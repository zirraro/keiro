import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { graphGET } from '@/lib/meta';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function authorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  return !!cronSecret && auth === `Bearer ${cronSecret}`;
}

/**
 * POST /api/agents/content/sync-social-metrics
 *
 * Takes a daily snapshot of public social-platform counters (followers,
 * following, media count) for each client with a connected account.
 * Writes one row per (user_id, platform, recorded_on) into social_metrics.
 *
 * Today's row is upserted so re-running on the same day updates counts
 * without creating duplicates — useful when the scheduler misfires.
 *
 * Noah's brief reads (today, yesterday) and shows "+12 followers
 * aujourd'hui" by diffing them.
 */
export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, instagram_business_account_id, facebook_page_access_token')
    .not('instagram_business_account_id', 'is', null)
    .not('facebook_page_access_token', 'is', null);

  if (!clients || clients.length === 0) {
    return NextResponse.json({ ok: true, clients: 0 });
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const results: Array<{ user_id: string; followers?: number; error?: string }> = [];

  for (const client of clients) {
    const igId = client.instagram_business_account_id as string;
    const token = client.facebook_page_access_token as string;

    try {
      const account = await graphGET<{
        followers_count?: number;
        follows_count?: number;
        media_count?: number;
        username?: string;
      }>(`/${igId}`, token, {
        fields: 'followers_count,follows_count,media_count,username',
      }, { igUserId: igId });

      await supabase
        .from('social_metrics')
        .upsert({
          user_id: client.id,
          platform: 'instagram',
          followers_count: account.followers_count ?? null,
          following_count: account.follows_count ?? null,
          media_count: account.media_count ?? null,
          recorded_on: today,
          raw: account,
        }, { onConflict: 'user_id,platform,recorded_on' });

      results.push({ user_id: client.id, followers: account.followers_count });
    } catch (e: any) {
      results.push({ user_id: client.id, error: e?.message?.substring(0, 200) });
    }
  }

  await supabase.from('agent_logs').insert({
    agent: 'content',
    action: 'sync_social_metrics',
    status: 'success',
    data: { clients: clients.length, results, recorded_on: today },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, clients: clients.length, recorded_on: today, results });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
