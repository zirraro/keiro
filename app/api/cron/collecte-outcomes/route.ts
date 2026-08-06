import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordOutcome } from '@/lib/agents/outcome-events';
import { partager } from '@/lib/agents/synergies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * ALIMENTATION DU SOCLE DE RÉSULTATS — tous les canaux, pas seulement TikTok.
 *
 * Demande du fondateur : « alimenter outcome_events depuis tous les canaux ;
 * c'est le seul actif qui ne dépende d'aucune plateforme — si Meta coupe une
 * permission demain, il reste. »
 *
 * ── Pourquoi un cron plutôt que des appels dispersés ──
 *
 * On aurait pu appeler `recordOutcome` à chaque publication, chaque envoi de
 * DM, chaque email. Trois raisons de ne pas le faire :
 *
 * Le résultat n'est pas connu au moment de l'action. Un post publié ne fait
 * ses vues que le lendemain ; l'enregistrer à la publication ne capturerait
 * qu'un zéro. C'est justement le défaut qui rendait la métrique inutilisable.
 *
 * Un appel supplémentaire dans le chemin de publication est un risque
 * supplémentaire de le casser, pour une écriture qui n'est pas urgente.
 *
 * Et l'idempotence est gratuite ici : la clé (client, type, référence,
 * fenêtre) fait que repasser sur les mêmes lignes met à jour au lieu de
 * dupliquer, donc on peut relancer sans réfléchir.
 *
 * ── Ce qu'on ne fera jamais ici ──
 *
 * Servir un benchmark en dessous du seuil d'anonymat. Dix clients distincts
 * par métier, garde-fou qu'il ne faut pas lever : en dessous, un « moyenne du
 * secteur » désigne en creux un concurrent identifiable.
 */

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Les vues arrivent sous des clés différentes selon la plateforme. */
function vuesDe(e: any): number | null {
  if (!e || typeof e !== 'object') return null;
  const c = [e.views, e.reach, e.impressions, e.video_views, e.play_count].filter(v => typeof v === 'number');
  return c.length ? Math.max(...c) : null;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const depuis = new Date(Date.now() - 3 * 86400000).toISOString();
  const bilan = { contenu: 0, dm: 0, email: 0, prospection: 0, observations_partagees: 0 };

  const { data: clients } = await supabase
    .from('profiles')
    .select('id, business_type')
    .not('subscription_plan', 'is', null)
    .neq('subscription_plan', 'free')
    .limit(300);

  for (const client of clients || []) {
    const secteur = (client as any).business_type;

    // ── CONTENU : un post et ce qu'il a réellement fait ──
    const { data: posts } = await supabase
      .from('content_calendar')
      .select('id, platform, format, pillar, hook, published_at, engagement_data')
      .eq('user_id', client.id)
      .gte('published_at', depuis)
      .not('published_at', 'is', null)
      .limit(200);

    for (const p of posts || []) {
      const vues = vuesDe((p as any).engagement_data);
      // Sans métrique, il n'y a rien à apprendre : enregistrer un zéro
      // fausserait toutes les moyennes du secteur.
      if (vues === null) continue;
      const e: any = (p as any).engagement_data || {};
      await recordOutcome(supabase, {
        userId: client.id, agent: 'content', type: 'post_published',
        sector: secteur, platform: (p as any).platform, format: (p as any).format,
        hookFamily: (p as any).pillar || null,
        metrics: {
          views: vues,
          likes: Number(e.like_count ?? e.likes ?? 0),
          comments: Number(e.comments_count ?? e.comments ?? 0),
          saves: Number(e.saved ?? 0),
        },
        measuredAt: '72h',
        refId: (p as any).id,
        dayOfWeek: new Date((p as any).published_at).getUTCDay(),
        hourOfDay: new Date((p as any).published_at).getUTCHours(),
      });
      bilan.contenu++;
    }

    // ── DM : envoyé, et réponse ou non ──
    const { data: profil } = await supabase
      .from('organization_members').select('org_id').eq('user_id', client.id).limit(1).maybeSingle();
    const orgId = (profil as any)?.org_id;
    if (orgId) {
      const { data: dms } = await supabase
        .from('dm_queue')
        .select('id, channel, status, sent_at')
        .eq('org_id', orgId)
        .in('status', ['sent', 'responded'])
        .gte('sent_at', depuis)
        .limit(300);

      for (const d of dms || []) {
        await recordOutcome(supabase, {
          userId: client.id, agent: 'dm', type: 'dm_handled',
          sector: secteur, platform: (d as any).channel || 'instagram',
          metrics: { conversion: (d as any).status === 'responded' ? 1 : 0 },
          measuredAt: '72h', refId: (d as any).id,
        });
        bilan.dm++;
      }
    }

    // ── EMAIL : envoyé, ouvert, cliqué ──
    const { data: mails } = await supabase
      .from('crm_prospects')
      .select('id, last_email_sent_at, email_opens_count, email_clicks_count, email_sequence_step')
      .eq('created_by', client.id)
      .gte('last_email_sent_at', depuis)
      .not('last_email_sent_at', 'is', null)
      .limit(300);

    for (const m of mails || []) {
      await recordOutcome(supabase, {
        userId: client.id, agent: 'email', type: 'email_step',
        sector: secteur, platform: 'email',
        format: `etape_${(m as any).email_sequence_step ?? '?'}`,
        metrics: {
          opens: Number((m as any).email_opens_count || 0),
          clicks: Number((m as any).email_clicks_count || 0),
        },
        measuredAt: '72h', refId: (m as any).id,
      });
      bilan.email++;
    }

    // ── PROSPECTION : qualifié, et devenu quoi ──
    const { data: prospects } = await supabase
      .from('crm_prospects')
      .select('id, status, classe_terrain, created_at')
      .eq('created_by', client.id)
      .gte('created_at', depuis)
      .limit(300);

    for (const pr of prospects || []) {
      await recordOutcome(supabase, {
        userId: client.id, agent: 'commercial', type: 'prospect_added',
        sector: secteur,
        format: (pr as any).classe_terrain || 'non_classe',
        metrics: { conversion: ['client', 'signe', 'converti'].includes(String((pr as any).status)) ? 1 : 0 },
        measuredAt: '7d', refId: (pr as any).id,
      });
      bilan.prospection++;
    }

    // ── Ce que la collecte permet de faire circuler ──
    //
    // Les DM qui obtiennent une réponse disent quels sujets intéressent cette
    // clientèle. C'est exactement l'information que Léna n'avait pas.
    if (orgId) {
      const { data: repondus } = await supabase
        .from('dm_queue')
        .select('message')
        .eq('org_id', orgId)
        .eq('status', 'responded')
        .gte('sent_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .limit(20);

      if ((repondus?.length || 0) >= 3) {
        const extraits = (repondus || [])
          .map((r: any) => String(r.message || '').replace(/\s+/g, ' ').slice(0, 90))
          .filter(Boolean).slice(0, 3);
        const res = await partager(supabase, {
          observation: 'sujets_qui_font_repondre',
          de: 'dm',
          userId: client.id,
          contenu: `Les approches qui obtiennent une réponse ces 30 derniers jours parlent de : ${extraits.join(' / ')}`,
          preuve: `${repondus?.length} réponses obtenues`,
        });
        if (res.diffuse) bilan.observations_partagees++;
      }
    }
  }

  await supabase.from('agent_logs').insert({
    agent: 'ops', action: 'collecte_outcomes', status: 'ok',
    data: bilan, created_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, ...bilan, clients: (clients || []).length });
}
