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
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  // Bumped 2026-05-17 — was 50, founder couldn't see the actual queue size
  // (1600+ prospect base capped at 50 felt empty). Now 500 with a `total`
  // counter so the UI can render an accurate funnel.
  const { data: rows } = await supabase
    .from('crm_prospects')
    .select('id, company, instagram, score, angle_approche, notes, city:quartier, note_google, google_rating, dm_queued_at')
    .eq('user_id', user.id)
    .eq('dm_status', 'queued_for_manual_follow')
    .order('score', { ascending: false, nullsFirst: false })
    .limit(500);

  // Funnel counters so the panel can show "X to follow / Y followed /
  // Z eligible (with IG handle, score ≥ 20, not yet touched)".
  const [
    { count: queuedTotal },
    { count: followedTotal },
    { count: eligibleTotal },
    { count: dmSent },
  ] = await Promise.all([
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('dm_status', 'queued_for_manual_follow'),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('dm_followed_at', 'is', null),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('instagram', 'is', null).is('dm_followed_at', null).gte('score', 20),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('dm_sent_at', 'is', null),
  ]);

  return NextResponse.json({
    ok: true,
    follows: rows || [],
    funnel: {
      queued: queuedTotal || 0,
      followed: followedTotal || 0,
      eligible: eligibleTotal || 0,
      dm_sent: dmSent || 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action: 'done' | 'skip' | 'all_done' = body?.action;
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Batch variant: mark every currently-queued follow as done in one shot.
  // Used by the "Tout marquer fait" button after the client has swiped
  // through the list on their phone.
  if (action === 'all_done') {
    const { data: queuedRows } = await supabase
      .from('crm_prospects')
      .select('id, instagram')
      .eq('user_id', user.id)
      .eq('dm_status', 'queued_for_manual_follow');

    const rows = queuedRows || [];
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, action: 'all_done', count: 0 });
    }

    await supabase
      .from('crm_prospects')
      .update({ dm_followed_at: now, dm_status: 'followed_by_user', updated_at: now })
      .eq('user_id', user.id)
      .eq('dm_status', 'queued_for_manual_follow');

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
