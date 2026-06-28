import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET  /api/agents/dm-instagram/manual-follows
 * POST /api/agents/dm-instagram/manual-follows
 *
 * The warm-up-follow queue Jade maintains. IG Business has no
 * programmatic follow API, so Jade queues handles she recommends
 * following and the client validates them with one tap in the
 * workspace. Marking as "done" writes dm_followed_at so it never
 * reappears in the queue.
 *
 * POST body: { prospect_id: string, action: 'done' | 'skip' }
 */
const PLATFORM_COL: Record<string, string> = { instagram: 'instagram', tiktok: 'tiktok_handle', linkedin: 'linkedin_url' };

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rawP = (new URL(req.url).searchParams.get('platform') || 'instagram').toLowerCase();
  const platform = ['instagram', 'tiktok', 'linkedin'].includes(rawP) ? rawP : 'instagram';
  const supabase = getSupabaseAdmin();

  // INSTAGRAM : file dédiée (dm_status='queued_for_manual_follow', dm_followed_at). Inchangé.
  if (platform === 'instagram') {
    const { data: rowsRaw } = await supabase
      .from('crm_prospects')
      .select('id, company, instagram, score, angle_approche, notes, city:quartier, note_google, google_rating, dm_queued_at, no_outbound, temperature, status')
      .eq('user_id', user.id)
      .eq('dm_status', 'queued_for_manual_follow')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(500);
    // Coordination (2026-06-25) : même si la file amont a été filtrée, un prospect
    // peut être passé opt-out/mort/perdu APRÈS sa mise en file → on re-filtre ici
    // pour que la garde "follow = touch" soit uniforme sur les 3 réseaux.
    const rows = (rowsRaw || []).filter((r: any) => !r.no_outbound && r.temperature !== 'dead' && r.status !== 'perdu');
    const [{ count: queuedTotal }, { count: followedTotal }, { count: eligibleTotal }, { count: dmSent }] = await Promise.all([
      supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('dm_status', 'queued_for_manual_follow'),
      supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('dm_followed_at', 'is', null),
      supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('instagram', 'is', null).is('dm_followed_at', null).gte('score', 20),
      supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('dm_sent_at', 'is', null),
    ]);
    let igFollows = (rows || []).map(r => ({ ...r, handle: r.instagram }));
    // Vérif d'existence Instagram (clic = profil réel). SAFE : si la vérif renvoie 0
    // sur plusieurs candidats (= IG bloque nos requêtes serveur), on NE vide PAS la liste.
    try {
      const { filterExisting } = await import('@/lib/agents/account-exists');
      const existing = await filterExisting('instagram', igFollows.map((f: any) => String(f.handle || '')), 24);
      if (existing.size > 0) igFollows = igFollows.filter((f: any) => existing.has(String(f.handle || '').replace(/^@/, '').toLowerCase()));
    } catch (e: any) { console.warn('[manual-follows] ig verify failed:', e?.message); }
    return NextResponse.json({ ok: true, platform, follows: igFollows, funnel: { queued: queuedTotal || 0, followed: followedTotal || 0, eligible: eligibleTotal || 0, dm_sent: dmSent || 0 } });
  }

  // TIKTOK / LINKEDIN : même UX, file = prospects AVEC le handle de la plateforme,
  // pas encore suivis (suivi tracé dans crm_activities type 'client_followed' channel=platform).
  const col = PLATFORM_COL[platform];
  const { data: rows } = await supabase
    .from('crm_prospects')
    .select(`id, company, ${col}, score, angle_approche, note_google, google_rating, no_outbound, temperature, status`)
    .eq('user_id', user.id).not(col, 'is', null)
    .order('score', { ascending: false, nullsFirst: false }).limit(500);
  // Coordination multi-canal : un follow est un touch. On ne propose JAMAIS de suivre
  // un opt-out (no_outbound), un prospect mort (temperature='dead') ou perdu (status='perdu').
  // (filtre en JS — .neq côté SQL exclurait aussi les status NULL légitimes.)
  const isContactable = (r: any) => !r.no_outbound && r.temperature !== 'dead' && r.status !== 'perdu';
  const all = (rows || []).filter(isContactable);
  // Suivis sur CETTE plateforme (exclusion de la file).
  const ids = all.map((r: any) => r.id);
  const followed = new Set<string>();
  if (ids.length) {
    const { data: acts } = await supabase.from('crm_activities')
      .select('prospect_id, data, type').in('prospect_id', ids).in('type', ['client_followed', 'follow_skipped']);
    for (const a of (acts || []) as any[]) {
      if ((a.data?.channel || a.data?.platform) === platform) followed.add(a.prospect_id);
    }
  }
  // Nettoyage bulletproof du handle TikTok : extrait le username propre depuis
  // tout format stocké (URL complète, @, espaces) → le lien tiktok.com/@username
  // est TOUJOURS bien formé (sinon il ouvre l'app sans naviguer vers le profil).
  const cleanTt = (raw: string) => String(raw || '')
    .replace(/https?:\/\/(www\.|m\.)?tiktok\.com\/@?/i, '')
    .split(/[/?#]/)[0]
    .replace(/^@/, '')
    .replace(/\s+/g, '')
    .trim();

  // UNIFICATION du "Fait" : les deux listes (ManualFollowsList + FollowSuggestions)
  // partagent le même tracking par HANDLE (agent_logs client_follow_action). Sinon
  // marquer fait dans l'une ne retire pas de l'autre → le compte revient + chiffres faux.
  const doneHandles = new Set<string>();
  try {
    const { data: doneRows } = await supabase.from('agent_logs')
      .select('data').eq('agent', 'content').eq('action', 'client_follow_action').eq('user_id', user.id).limit(1000);
    for (const d of (doneRows || []) as any[]) {
      const dd = d.data || {};
      if (dd.platform === platform && dd.handle && dd.done === true) doneHandles.add(String(dd.handle).toLowerCase().replace(/^@/, ''));
    }
  } catch { /* best-effort */ }

  let follows = all
    .filter((r: any) => { const h = String(r[col] || '').trim(); return h.length >= 2 && !followed.has(r.id); })
    .map((r: any) => {
      const handle = platform === 'tiktok' ? cleanTt(r[col]) : String(r[col] || '').replace(/^@/, '');
      return { id: r.id, company: r.company, handle, score: r.score, angle_approche: r.angle_approche, note_google: r.note_google || r.google_rating };
    })
    .filter((f: any) => !doneHandles.has(String(f.handle).toLowerCase())); // déjà marqué fait (n'importe quelle liste)

  // VÉRIFICATION D'EXISTENCE (TikTok) : on ne montre QUE des comptes réels — sinon
  // le client clique sur un handle et tombe dans le vide. (founder, 28/06). On vérifie
  // les meilleurs candidats par score (cap), live + cache.
  if (platform === 'tiktok') {
    // 1) FILTRE FORMAT : on ne garde que les usernames TikTok valides (a-z0-9._, 2-24).
    //    Un handle malformé → lien cassé → app ouverte mais pas de profil.
    follows = follows.filter(f => /^[a-zA-Z0-9._]{2,24}$/.test(f.handle));
    try {
      const { filterExisting } = await import('@/lib/agents/account-exists');
      const existing = await filterExisting('tiktok', follows.map(f => f.handle), 24);
      // SAFE : si 0 vérifié sur plusieurs candidats (= TikTok bloque nos requêtes
      // serveur), on NE vide PAS la liste (sinon faux négatif = liste vide).
      if (existing.size > 0) follows = follows.filter(f => existing.has(f.handle.toLowerCase()));
    } catch (e: any) { console.warn('[manual-follows] tiktok verify failed:', e?.message); }
  }

  return NextResponse.json({
    ok: true, platform,
    follows,
    // "eligible" = prospects avec un handle PAS encore suivis (même sémantique qu'Instagram,
    // où eligible exclut dm_followed_at). Évite que "Éligibles" gonfle en comptant les suivis.
    funnel: { queued: follows.length, followed: followed.size, eligible: Math.max(0, all.length - followed.size), dm_sent: 0 },
  });
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action: 'done' | 'skip' | 'all_done' = body?.action;
  const rawP = String(body?.platform || 'instagram').toLowerCase();
  const platform = ['instagram', 'tiktok', 'linkedin'].includes(rawP) ? rawP : 'instagram';
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // TIKTOK / LINKEDIN : suivi tracé dans crm_activities (channel=platform),
  // sans toucher la file Instagram (dm_followed_at). Même UX "Fait/Passer/Tout".
  if (platform !== 'instagram') {
    const col = PLATFORM_COL[platform];
    if (action === 'all_done') {
      const { data: rows } = await supabase.from('crm_prospects')
        .select(`id, ${col}, no_outbound, temperature, status`).eq('user_id', user.id).not(col, 'is', null).limit(500);
      // Mêmes gardes que la file : pas d'opt-out / mort / perdu dans le batch.
      const list = (rows || []).filter((r: any) => !r.no_outbound && r.temperature !== 'dead' && r.status !== 'perdu');
      const cleanH = (v: string) => (platform === 'tiktok'
        ? String(v || '').replace(/https?:\/\/(www\.|m\.)?tiktok\.com\/@?/i, '').split(/[/?#]/)[0].replace(/^@/, '').replace(/\s+/g, '')
        : String(v || '').replace(/^@/, '')).trim();
      if (list.length) {
        await supabase.from('crm_activities').insert(list.map((r: any) => ({
          prospect_id: r.id, type: 'client_followed',
          description: `Follow confirmé par le client (batch) sur ${platform} @${cleanH(r[col])}`,
          data: { channel: platform, confirmed_by_client: true, batch: true, at: now }, created_at: now,
        })));
        // Tracking unifié par handle (partagé avec FollowSuggestions).
        await supabase.from('agent_logs').insert(list.map((r: any) => ({
          agent: 'content', action: 'client_follow_action', status: 'ok', user_id: user.id,
          data: { platform, handle: cleanH(r[col]), done: true, prospect_id: r.id, batch: true, at: now }, created_at: now,
        }))).then(() => {}, () => {});
      }
      return NextResponse.json({ ok: true, action: 'all_done', count: list.length, platform });
    }
    const pid: string = body?.prospect_id;
    if (!pid) return NextResponse.json({ error: 'prospect_id requis' }, { status: 400 });
    const { data: pr } = await supabase.from('crm_prospects').select(`id, ${col}`).eq('id', pid).eq('user_id', user.id).maybeSingle();
    if (!pr) return NextResponse.json({ error: 'Prospect introuvable' }, { status: 404 });
    const isDone = action === 'done'; // 'skip' ET 'dead_link' = PAS suivi
    const isDeadLink = action === 'dead_link';
    const cleanHandle = (platform === 'tiktok'
      ? String((pr as any)[col] || '').replace(/https?:\/\/(www\.|m\.)?tiktok\.com\/@?/i, '').split(/[/?#]/)[0].replace(/^@/, '').replace(/\s+/g, '')
      : String((pr as any)[col] || '').replace(/^@/, '')).trim();
    await supabase.from('crm_activities').insert({
      prospect_id: (pr as any).id, type: isDone ? 'client_followed' : 'follow_skipped',
      description: isDone ? `Follow confirmé par le client sur ${platform} @${cleanHandle}`
        : isDeadLink ? `Lien ${platform} signalé invalide/introuvable par le client (@${cleanHandle})`
        : `Follow ${platform} passé par le client`,
      data: { channel: platform, confirmed_by_client: isDone, reason: isDeadLink ? 'dead_link' : undefined, at: now }, created_at: now,
    });
    // Tracking unifié par handle (partagé avec FollowSuggestions) → ne revient plus dans AUCUNE liste.
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'client_follow_action', status: 'ok', user_id: user.id,
      data: { platform, handle: cleanHandle, done: isDone, dead_link: isDeadLink, prospect_id: (pr as any).id, at: now }, created_at: now,
    }).then(() => {}, () => {});
    return NextResponse.json({ ok: true, action, platform });
  }

  // Batch variant: mark every currently-queued follow as done in one shot.
  // Used by the "Tout marquer fait" button after the client has swiped
  // through the list on their phone.
  if (action === 'all_done') {
    const { data: queuedRows } = await supabase
      .from('crm_prospects')
      .select('id, instagram, no_outbound, temperature, status')
      .eq('user_id', user.id)
      .eq('dm_status', 'queued_for_manual_follow');

    // Mêmes gardes que la file : pas d'opt-out / mort / perdu dans le batch.
    const rows = (queuedRows || []).filter((r: any) => !r.no_outbound && r.temperature !== 'dead' && r.status !== 'perdu');
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, action: 'all_done', count: 0 });
    }

    await supabase
      .from('crm_prospects')
      .update({ dm_followed_at: now, dm_status: 'followed_by_user', updated_at: now })
      .in('id', rows.map((r: any) => r.id));

    await supabase.from('crm_activities').insert(
      rows.map(r => ({
        prospect_id: r.id,
        type: 'dm_followed',
        description: `Follow confirmé par le client (batch) sur @${String(r.instagram || '').replace(/^@/, '')}`,
        data: { channel: 'instagram', confirmed_by_client: true, batch: true, at: now },
        created_at: now,
      })),
    );

    return NextResponse.json({ ok: true, action: 'all_done', count: rows.length });
  }

  const prospectId: string = body?.prospect_id;
  const perAction: 'done' | 'skip' = action === 'skip' ? 'skip' : 'done';

  if (!prospectId) {
    return NextResponse.json({ error: 'prospect_id requis' }, { status: 400 });
  }

  // Ownership check — prevent a user from marking another client's row.
  const { data: prospect } = await supabase
    .from('crm_prospects')
    .select('id, instagram')
    .eq('id', prospectId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!prospect) {
    return NextResponse.json({ error: 'Prospect introuvable' }, { status: 404 });
  }

  if (perAction === 'done') {
    await supabase.from('crm_prospects').update({
      dm_followed_at: now,
      dm_status: 'followed_by_user',
      updated_at: now,
    }).eq('id', prospect.id);

    await supabase.from('crm_activities').insert({
      prospect_id: prospect.id,
      type: 'dm_followed',
      description: `Follow confirmé par le client sur @${String(prospect.instagram || '').replace(/^@/, '')}`,
      data: { channel: 'instagram', confirmed_by_client: true, at: now },
      created_at: now,
    });
  } else {
    await supabase.from('crm_prospects').update({
      dm_status: 'follow_skipped',
      updated_at: now,
    }).eq('id', prospect.id);
  }

  return NextResponse.json({ ok: true, action: perAction });
}
