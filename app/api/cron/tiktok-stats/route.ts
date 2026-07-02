import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTikTokVideos, refreshTikTokToken } from '@/lib/tiktok';

export const runtime = 'nodejs';
export const maxDuration = 180;

/**
 * GET /api/cron/tiktok-stats
 *
 * Fetches real TikTok performance (view_count / like_count / comment_count /
 * share_count + share_url) per connected account via /v2/video/list and
 * writes it back onto content_calendar.engagement_data — so we STOP being
 * blind on TikTok reach (was empty) and can measure the post-burst recovery.
 *
 * Matching video → calendar post: by share_url (tiktok_permalink) first, then
 * by create_time ≈ published_at (±36h). Also logs an account-level summary to
 * agent_logs for the founder / Ami.
 *
 * Run daily by the scheduler.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const clientKey = process.env.TIKTOK_CLIENT_KEY || process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  const { data: accounts } = await supabase
    .from('profiles')
    .select('id, tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry')
    .not('tiktok_access_token', 'is', null);

  const summary: Array<{ user: string; videos: number; totalViews: number; updated: number }> = [];

  for (const acct of accounts || []) {
    try {
      let accessToken = acct.tiktok_access_token as string;
      const expiry = acct.tiktok_token_expiry ? new Date(acct.tiktok_token_expiry) : null;

      // Refresh if expired
      if ((!expiry || expiry <= new Date()) && acct.tiktok_refresh_token && clientKey && clientSecret) {
        try {
          const refreshed = await refreshTikTokToken(acct.tiktok_refresh_token, clientKey, clientSecret);
          accessToken = refreshed.access_token;
          await supabase.from('profiles').update({
            tiktok_access_token: refreshed.access_token,
            ...(refreshed.refresh_token ? { tiktok_refresh_token: refreshed.refresh_token } : {}),
            ...(refreshed.expires_in ? { tiktok_token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString() } : {}),
          }).eq('id', acct.id);
        } catch { continue; /* can't refresh → skip this account */ }
      }

      let videos: any[] = [];
      try { videos = await getTikTokVideos(accessToken, 20); } catch { continue; }
      if (!videos.length) { summary.push({ user: acct.id.slice(0, 8), videos: 0, totalViews: 0, updated: 0 }); continue; }

      const totalViews = videos.reduce((s, v) => s + (v.view_count || 0), 0);

      // Load recent published TikTok calendar posts to correlate
      const since = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data: posts } = await supabase
        .from('content_calendar')
        .select('id, published_at, tiktok_permalink, engagement_data')
        .eq('user_id', acct.id).eq('platform', 'tiktok').eq('status', 'published')
        .gte('published_at', since);

      let updated = 0;
      for (const post of posts || []) {
        // Match by share_url, else by create_time ≈ published_at (±36h)
        let match = post.tiktok_permalink ? videos.find(v => v.share_url === post.tiktok_permalink) : null;
        if (!match && post.published_at) {
          const pubMs = new Date(post.published_at).getTime();
          match = videos.find(v => v.create_time && Math.abs(v.create_time * 1000 - pubMs) < 36 * 3600 * 1000);
        }
        if (!match) continue;
        await supabase.from('content_calendar').update({
          tiktok_permalink: post.tiktok_permalink || match.share_url || null,
          engagement_data: {
            ...(post.engagement_data || {}),
            views: match.view_count ?? 0,
            likes: match.like_count ?? 0,
            comments: match.comment_count ?? 0,
            shares: match.share_count ?? 0,
            share_url: match.share_url || null,
            tiktok_video_id: match.id || null,
            fetched_at: new Date().toISOString(),
          },
        }).eq('id', post.id);
        updated++;
      }

      // Account-level summary → agent_logs (visible to founder / Ami)
      await supabase.from('agent_logs').insert({
        agent: 'content', action: 'tiktok_stats', status: 'ok', user_id: acct.id,
        data: {
          videos_checked: videos.length,
          total_views_recent: totalViews,
          avg_views: Math.round(totalViews / videos.length),
          posts_updated: updated,
          // early signal: if avg views ~0 across recent videos → still throttled
          throttle_signal: totalViews / videos.length < 10 ? 'likely_throttled' : 'ok',
        },
        created_at: new Date().toISOString(),
      });

      summary.push({ user: acct.id.slice(0, 8), videos: videos.length, totalViews, updated });
    } catch (e: any) {
      console.warn(`[tiktok-stats] account ${acct.id?.slice(0, 8)} failed:`, e?.message);
    }
  }

  return NextResponse.json({ ok: true, accounts: summary.length, summary });
}
