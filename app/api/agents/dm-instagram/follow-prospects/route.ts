import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { verifyInstagramHandle } from '@/lib/agents/dm-verify';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/agents/dm-instagram/follow-prospects
 *
 * Daily auto-follow campaign for Jade: picks up to ~25 qualified prospect
 * accounts that we haven't followed yet, verifies each handle via
 * business_discovery, then follows them from the business owner's
 * Instagram account.
 *
 * Why it exists: warming up a prospect by following them (and liking a
 * couple of their posts) makes the later DM feel less cold. It also
 * tends to trigger a notification that drives the prospect back to our
 * profile, where the bio + recent content does the pre-selling before
 * the actual DM message is sent.
 *
 * Auth: CRON_SECRET for scheduled calls, or an admin session cookie.
 *
 * Body (optional):
 *   { user_id?: string }  — only pick prospects owned by this user_id
 *
 * Rate limit: MAX_FOLLOWS_PER_RUN (default 25) + 2s delay between follows
 * so Meta's anti-abuse heuristics stay happy.
 */

const MAX_FOLLOWS_PER_RUN = 25;
const DELAY_BETWEEN_FOLLOWS_MS = 2_000;

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
  let followed = 0;
  let skipped = 0;
  let failed = 0;
  const details: Array<{ handle: string; status: string; reason?: string }> = [];

  for (const prospect of prospects) {
    const handle = String(prospect.instagram || '').replace(/^@/, '').trim();
    if (!handle) {
      skipped++;
      continue;
    }

    try {
      // Step 1: verify the target account is reachable (business/creator + active)
      const verify = await verifyInstagramHandle(handle, igBusinessId, fbPageToken);
      if (!verify.exists) {
        details.push({ handle, status: 'skipped_not_found', reason: verify.rawError });
        await supabase.from('crm_prospects').update({
          dm_follow_attempts: (prospect.dm_follow_attempts || 0) + 1,
          dm_status: 'invalid_handle',
          instagram: null,
          updated_at: now,
        }).eq('id', prospect.id);
        skipped++;
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Step 2: attempt the follow via Graph API
      // NOTE: the /{ig-user-id}/follows endpoint requires
      // instagram_manage_insights scope. Until Meta approves it, we log
      // the intent and mark the prospect as "pending follow" so the run
      // still produces a trail we can review post-approval.
      const followUrl = `https://graph.facebook.com/v21.0/${igBusinessId}/follows` +
        `?user_id=${encodeURIComponent(verify.igId!)}&access_token=${encodeURIComponent(fbPageToken)}`;
      let followOk = false;
      let followError: string | undefined;
      try {
        const res = await fetch(followUrl, { method: 'POST' });
        const resData = await res.json().catch(() => ({}));
        if (res.ok && resData?.success !== false) {
          followOk = true;
        } else {
          followError = resData?.error?.message || `HTTP ${res.status}`;
        }
      } catch (e: any) {
        followError = e?.message || 'fetch_error';
      }

      if (followOk) {
        await supabase.from('crm_prospects').update({
          dm_followed_at: now,
          dm_follow_attempts: (prospect.dm_follow_attempts || 0) + 1,
          updated_at: now,
        }).eq('id', prospect.id);

        await supabase.from('crm_activities').insert({
          prospect_id: prospect.id,
          type: 'dm_followed',
          description: `Jade a suivi @${handle} (warm-up avant DM)`,
          data: {
            channel: 'instagram',
            handle,
            ig_id: verify.igId,
            followers: verify.followersCount,
            media_count: verify.mediaCount,
          },
          created_at: now,
        });

        followed++;
        details.push({ handle, status: 'followed' });
      } else {
        // Even on failure, bump the attempt counter so we eventually
        // stop retrying this prospect (max 3).
        await supabase.from('crm_prospects').update({
          dm_follow_attempts: (prospect.dm_follow_attempts || 0) + 1,
          updated_at: now,
        }).eq('id', prospect.id);
        failed++;
        details.push({ handle, status: 'failed', reason: followError });
      }
    } catch (e: any) {
      failed++;
      details.push({ handle, status: 'exception', reason: e?.message });
    }

    // Rate limit: wait between follows so Meta doesn't flag the account
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_FOLLOWS_MS));
  }

  // Log the run summary
  await supabase.from('agent_logs').insert({
    agent: 'dm_instagram',
    action: 'follow_campaign',
    status: followed > 0 ? 'success' : 'error',
    data: {
      candidates: prospects.length,
      followed,
      skipped,
      failed,
      details: details.slice(0, 50),
    },
    created_at: now,
    ...(clientUserId ? { user_id: clientUserId } : {}),
  });

  return NextResponse.json({
    ok: true,
    candidates: prospects.length,
    followed,
    skipped,
    failed,
  });
}

export async function GET(req: NextRequest) {
  // Also accept GET for the scheduler which uses GET for most cron endpoints.
  return POST(req);
}
