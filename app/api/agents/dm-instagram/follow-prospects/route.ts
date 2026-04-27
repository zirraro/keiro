import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { verifyInstagramHandle } from '@/lib/agents/dm-verify';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/agents/dm-instagram/follow-prospects
 *
 * Daily follow-warmup queue for Jade. The Instagram Graph API does NOT
 * expose a programmatic follow endpoint for business accounts (we tried
 * /{ig-user-id}/follows and it always returns "Object does not exist").
 *
 * So instead of attempting an impossible API call, we VERIFY each
 * prospect's handle and queue the verified ones as "to follow manually".
 * The client sees them in their daily brief and in Jade's workspace with
 * a one-tap "mark as followed" button. This matches how IG actually
 * works (follow gestures must be human) while still surfacing the
 * warm-up action Jade recommends each day.
 *
 * Auth: CRON_SECRET for scheduled calls, or an admin session cookie.
 *
 * Body (optional):
 *   { user_id?: string }  — only pick prospects owned by this user_id
 */

const MAX_FOLLOWS_PER_RUN = 25;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function authorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const { user, error } = await getAuthUser();
  if (error || !user) return false;
  const sb = getSupabaseAdmin();
  const { data: profile } = await sb.from('profiles').select('is_admin').eq('id', user.id).single();
  return !!profile?.is_admin;
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const clientUserId: string | null = body?.user_id || null;

  const supabase = getSupabaseAdmin();

  // Load the Instagram Business credentials. Prefer the client's own
  // account (so the follow comes from their profile, not the admin's),
  // otherwise fall back to admin for QA testing.
  let resolvedIgId: string | null = null;
  let resolvedToken: string | null = null;
  if (clientUserId) {
    const { data: client } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, facebook_page_access_token')
      .eq('id', clientUserId)
      .maybeSingle();
    if (client?.instagram_business_account_id && client.facebook_page_access_token) {
      resolvedIgId = client.instagram_business_account_id;
      resolvedToken = client.facebook_page_access_token;
    }
  }
  if (!resolvedIgId || !resolvedToken) {
    const { data: admin } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, facebook_page_access_token')
      .eq('is_admin', true)
      .not('facebook_page_access_token', 'is', null)
      .not('instagram_business_account_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (!admin?.instagram_business_account_id || !admin.facebook_page_access_token) {
      return NextResponse.json({
        ok: false,
        error: 'No Instagram Business account connected — can\'t follow prospects',
      }, { status: 400 });
    }
    resolvedIgId = admin.instagram_business_account_id;
    resolvedToken = admin.facebook_page_access_token;
  }
  // Narrow for the rest of the function (checked above — guaranteed non-null)
  if (!resolvedIgId || !resolvedToken) {
    return NextResponse.json({ ok: false, error: 'No IG credentials' }, { status: 400 });
  }
  const igBusinessId: string = resolvedIgId;
  const fbPageToken: string = resolvedToken;

  // Pick the next batch of prospects to follow.
  // Eligibility:
  //   - has an Instagram handle
  //   - not already followed (dm_followed_at IS NULL)
  //   - not a dead/blocked prospect
  //   - has a reasonable score (>=20) so we don't warm up low-quality leads
  let query = supabase
    .from('crm_prospects')
    .select('id, company, instagram, score, dm_follow_attempts')
    .not('instagram', 'is', null)
    .neq('instagram', '')
    .is('dm_followed_at', null)
    .not('dm_status', 'in', '("blocked","invalid_handle")')
    .gte('score', 20)
    .lt('dm_follow_attempts', 3)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(MAX_FOLLOWS_PER_RUN);

  if (clientUserId) query = query.eq('user_id', clientUserId);

  const { data: prospects, error: queryError } = await query;
  if (queryError) {
    console.error('[DMFollowProspects] Query error:', queryError.message);
    return NextResponse.json({ ok: false, error: queryError.message }, { status: 500 });
  }

  if (!prospects || prospects.length === 0) {
    return NextResponse.json({
      ok: true,
      followed: 0,
      message: 'No prospects to follow right now — pipeline is already warm.',
    });
  }

  const now = new Date().toISOString();
  let queued = 0;
  let skipped = 0;
  const details: Array<{ handle: string; status: string; reason?: string }> = [];

  for (const prospect of prospects) {
    const handle = String(prospect.instagram || '').replace(/^@/, '').trim();
    if (!handle) {
      skipped++;
      continue;
    }

    try {
      // Verify the target account is reachable (business/creator + active).
      // Unreachable handles get flagged so we don't keep retrying them.
      const verify = await verifyInstagramHandle(handle, igBusinessId, fbPageToken);
      if (!verify.exists) {
        await supabase.from('crm_prospects').update({
          dm_status: 'invalid_handle',
          instagram: null,
          updated_at: now,
        }).eq('id', prospect.id);
        skipped++;
        details.push({ handle, status: 'skipped_invalid', reason: verify.rawError });
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      // Deep snapshot + Sonnet vision read so the client sees WHO this
      // person is before deciding to follow them. Bio + 3 visuals →
      // intent classification (has_business / entrepreneur_curious / …)
      // and best_offer recommendation (B2C use_keiroai / B2B
      // white_label_agency). Stored on the activity for the dashboard.
      let snapshotData: any = null;
      let visionData: any = null;
      try {
        const { getInstagramProfileSnapshot, readProfileFromVisuals } = await import('@/lib/agents/ig-profile-snapshot');
        const snap = await getInstagramProfileSnapshot(handle, igBusinessId, fbPageToken);
        if (snap.exists) {
          snapshotData = {
            biography: snap.biography,
            website: snap.website,
            followers: snap.followers_count,
            media_count: snap.media_count,
            recent_posts: snap.recent_posts.slice(0, 3).map(p => ({
              caption: p.caption,
              like_count: p.like_count,
              comments_count: p.comments_count,
              media_url: p.media_url,
              permalink: p.permalink,
            })),
          };
          // Vision read — only for accounts with at least one image post.
          visionData = await readProfileFromVisuals(snap).catch(() => null);
        }
      } catch { /* best-effort, never blocks the queue */ }

      // Queue for manual follow by the client — the IG Business API has no
      // programmatic follow, so we surface the list to the human instead.
      await supabase.from('crm_prospects').update({
        dm_status: 'queued_for_manual_follow',
        updated_at: now,
      }).eq('id', prospect.id);

      await supabase.from('crm_activities').insert({
        prospect_id: prospect.id,
        type: 'dm_follow_queued',
        description: `Jade suggère de suivre @${handle}${visionData ? ` — ${visionData.intent}, offre ${visionData.best_offer}` : ' (warm-up avant DM)'}`,
        data: {
          channel: 'instagram',
          handle,
          ig_id: verify.igId,
          followers: verify.followersCount,
          media_count: verify.mediaCount,
          ...(snapshotData ? { profile_snapshot: snapshotData } : {}),
          ...(visionData ? { vision: visionData } : {}),
        },
        created_at: now,
      });

      queued++;
      details.push({ handle, status: 'queued_manual' });
    } catch (e: any) {
      skipped++;
      details.push({ handle, status: 'exception', reason: e?.message });
    }
  }

  // Log the run summary — status is always success now since we're
  // curating a list, not trying an impossible API call.
  await supabase.from('agent_logs').insert({
    agent: 'dm_instagram',
    action: 'follow_campaign',
    status: 'success',
    data: {
      candidates: prospects.length,
      queued_for_manual_follow: queued,
      skipped,
      details: details.slice(0, 50),
    },
    created_at: now,
    ...(clientUserId ? { user_id: clientUserId } : {}),
  });

  return NextResponse.json({
    ok: true,
    candidates: prospects.length,
    queued_for_manual_follow: queued,
    skipped,
  });
}

export async function GET(req: NextRequest) {
  // Also accept GET for the scheduler which uses GET for most cron endpoints.
  return POST(req);
}
