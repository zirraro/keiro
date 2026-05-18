/**
 * Single source of truth for Instagram + TikTok insight stats used by
 * both Léna (Content panel) and AMI (Marketing panel).
 *
 * Why: the two agents used to fetch slightly different shapes — Léna read
 * 50 posts with likes+comments and showed stats as soon as the account was
 * connected; AMI read 20 posts with likes-only and required at least one
 * KeiroAI-published post before showing anything. Same account, different
 * numbers, which broke trust. This module unifies the two so any panel
 * that wants IG stats calls the same helper.
 *
 * Léna's approach won (more posts sampled, full engagement, no arbitrary
 * gate). `hasActivity` is still returned so AMI can label "X via KeiroAI"
 * without hiding the rest of the dashboard.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface InstagramAccountInsights {
  connected: boolean;
  /** True iff the user has at least 1 KeiroAI-published post on Instagram. */
  hasActivity: boolean;
  /** Real IG media_count from /me?fields=media_count (NOT KeiroAI count). */
  postsCount: number;
  /** KeiroAI-published count, surfaced separately. */
  keiroaiPosts: number;
  followersCount: number;
  /** Sum of like_count over the last 50 posts. */
  likes: number;
  /** Sum of comments_count over the last 50 posts. */
  comments: number;
  /** /me/insights reach metric (day period). */
  reach: number;
  /** Engagement % = (likes + comments) / sampled_count / followers × 100. */
  engagement: number;
  /** How many posts the sample actually contains (≤ 50). */
  sampledMediaCount: number;
}

export const EMPTY_IG_INSIGHTS: InstagramAccountInsights = {
  connected: false,
  hasActivity: false,
  postsCount: 0,
  keiroaiPosts: 0,
  followersCount: 0,
  likes: 0,
  comments: 0,
  reach: 0,
  engagement: 0,
  sampledMediaCount: 0,
};

/**
 * Fetch Instagram insights for a user, using their stored IGAA / Page token.
 * Returns the canonical shape — every consumer (Léna, AMI, status page, etc.)
 * must use this and never roll their own Graph calls.
 *
 * Read-only. Tolerant of Graph errors / timeouts (returns zeros on failure
 * rather than throwing, so the dashboard never errors out because IG is slow).
 */
export async function loadInstagramInsights(
  supabase: SupabaseClient,
  userId: string,
): Promise<InstagramAccountInsights> {
  const out: InstagramAccountInsights = { ...EMPTY_IG_INSIGHTS };

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('instagram_access_token, instagram_igaa_token, instagram_business_account_id, instagram_media_count, instagram_followers_count')
      .eq('id', userId)
      .single();

    out.connected = !!(profile?.instagram_business_account_id || profile?.instagram_igaa_token || profile?.instagram_access_token);
    out.postsCount = (profile as any)?.instagram_media_count ?? 0;
    out.followersCount = (profile as any)?.instagram_followers_count ?? 0;

    const { count: keiroPublished } = await supabase
      .from('content_calendar')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('platform', 'instagram')
      .eq('status', 'published');
    out.keiroaiPosts = keiroPublished || 0;
    out.hasActivity = out.connected && out.keiroaiPosts > 0;

    if (!out.connected) return out;

    const token = profile?.instagram_igaa_token || profile?.instagram_access_token;
    if (!token) return out;

    const [mediaRes, profileRes, insightsRes] = await Promise.all([
      fetch(`https://graph.instagram.com/v21.0/me/media?fields=like_count,comments_count&limit=50&access_token=${token}`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
      fetch(`https://graph.instagram.com/v21.0/me?fields=followers_count,media_count&access_token=${token}`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
      fetch(`https://graph.instagram.com/v21.0/me/insights?metric=reach&metric_type=total_value&period=day&access_token=${token}`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
    ]);

    if (mediaRes && mediaRes.ok) {
      const md = await mediaRes.json().catch(() => null);
      const arr: any[] = md?.data || [];
      out.sampledMediaCount = arr.length;
      for (const m of arr) {
        out.likes += m.like_count || 0;
        out.comments += m.comments_count || 0;
      }
    }

    if (profileRes && profileRes.ok) {
      const pd = await profileRes.json().catch(() => null);
      if (typeof pd?.followers_count === 'number') out.followersCount = pd.followers_count;
      if (typeof pd?.media_count === 'number') out.postsCount = pd.media_count;
    }

    if (insightsRes && insightsRes.ok) {
      const id = await insightsRes.json().catch(() => null);
      const reachEntry = (id?.data || []).find((d: any) => d.name === 'reach');
      out.reach = reachEntry?.total_value?.value || 0;
    }

    out.engagement = out.followersCount > 0 && out.sampledMediaCount > 0 && (out.likes + out.comments) > 0
      ? Math.round(((out.likes + out.comments) / out.sampledMediaCount / out.followersCount) * 10000) / 100
      : 0;

    // Write the live numbers back to the profile cache so subsequent
    // dashboard loads (and any consumer reading from profiles directly)
    // stay in sync — without this the cached value can lag for hours
    // after a new publish or follower change. Cheap update, only fires
    // when the live fetch actually produced a non-zero number.
    if (out.postsCount > 0 || out.followersCount > 0) {
      try {
        await supabase
          .from('profiles')
          .update({
            instagram_media_count: out.postsCount,
            instagram_followers_count: out.followersCount,
            instagram_last_sync_at: new Date().toISOString(),
          })
          .eq('id', userId);
      } catch { /* non-fatal */ }
    }
  } catch (e: any) {
    console.warn('[insights-shared] IG load failed:', e?.message);
  }

  return out;
}

/**
 * Fire-and-forget refresh hook called from publish / webhook handlers.
 * Bumps the cached media_count + followers_count immediately so the
 * Léna and AMI panels reflect the change on the next dashboard load
 * (no manual page refresh, no waiting for the next scheduled sync).
 */
export async function bumpInstagramInsights(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    await loadInstagramInsights(supabase, userId);
  } catch { /* non-fatal — caller doesn't depend on the refresh */ }
}
