import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getOwnInstagramMedia } from '@/lib/meta';

export const runtime = 'nodejs';
export const maxDuration = 300;

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
 * POST /api/agents/content/sync-engagement
 *
 * Pulls like/comment/impression/reach counts from Instagram for every
 * client's recent posts and writes them to content_calendar.engagement_data.
 *
 * This is what makes "engagement" visible in Noah's brief and in the
 * content workspace — without it, every post shows 0 forever because the
 * publish route doesn't know the final numbers at publish time.
 *
 * Runs once a day (evening slot). For each client with IG credentials:
 *   1. Fetch last 25 own media via getOwnInstagramMedia (handles IGAA vs FB tokens)
 *   2. Match each to content_calendar by permalink
 *   3. Merge {like_count, comments_count, impressions, reach, saved, synced_at}
 *      into engagement_data
 */
export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // Grab every client with an IG business account + a page token
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, instagram_business_account_id, facebook_page_access_token')
    .not('instagram_business_account_id', 'is', null)
    .not('facebook_page_access_token', 'is', null);

  if (!clients || clients.length === 0) {
    return NextResponse.json({ ok: true, clients: 0, updated: 0 });
  }

  let totalUpdated = 0;
  const perClient: Array<{ user_id: string; fetched: number; updated: number; error?: string }> = [];

  for (const client of clients) {
    const igId = client.instagram_business_account_id as string;
    const token = client.facebook_page_access_token as string;

    try {
      const media = await getOwnInstagramMedia(igId, token, 25);
      let updated = 0;

      for (const m of media) {
        if (!m.permalink) continue;

        const engagement = {
          like_count: m.like_count || 0,
          comments_count: m.comments_count || 0,
          impressions: m.impressions || 0,
          reach: m.reach || 0,
          saved: m.saved || 0,
          synced_at: new Date().toISOString(),
        };

        // Update any content_calendar row owned by this client whose permalink matches.
        // Using eq on the permalink is exact — IG permalinks are stable.
        const { data: updatedRows } = await supabase
          .from('content_calendar')
          .update({ engagement_data: engagement })
          .eq('user_id', client.id)
          .eq('instagram_permalink', m.permalink)
          .select('id');

        if ((updatedRows?.length || 0) > 0) updated++;
      }

      totalUpdated += updated;
      perClient.push({ user_id: client.id, fetched: media.length, updated });
    } catch (e: any) {
      perClient.push({
        user_id: client.id,
        fetched: 0,
        updated: 0,
        error: e?.message?.substring(0, 200),
      });
    }
  }

  // Lightweight log for the CEO report
  await supabase.from('agent_logs').insert({
    agent: 'content',
    action: 'sync_engagement',
    status: 'success',
    data: { clients: clients.length, totalUpdated, perClient },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, clients: clients.length, totalUpdated, perClient });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
