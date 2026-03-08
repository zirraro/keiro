/**
 * Fetch real social media trends with images.
 *
 * TikTok tab: Mastodon trending statuses (real viral social posts with images)
 * Instagram tab: Google Trends positions 4-6 (different from Google tab which shows 1-3)
 *
 * No duplicates between tabs guaranteed.
 */

export type SocialTrend = {
  title: string;
  description: string;
  platform: 'tiktok' | 'instagram';
  imageUrl?: string;
  type: 'challenge' | 'trend' | 'format' | 'viral';
  engagement?: string;
};

/**
 * Fetch trending social posts from Mastodon (100% public API, no auth).
 * These are real viral posts with images — good proxy for social media trends.
 */
export async function fetchTikTokTrends(): Promise<SocialTrend[]> {
  try {
    console.log('[SocialTrends] Fetching Mastodon trending statuses...');

    // Mastodon trending statuses — public, free, real social content with images
    const res = await fetch('https://mastodon.social/api/v1/trends/statuses?limit=10', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[SocialTrends] Mastodon responded ${res.status}`);
      return [];
    }

    const statuses = await res.json();
    if (!Array.isArray(statuses) || !statuses.length) return [];

    const trends: SocialTrend[] = [];

    for (const status of statuses) {
      if (trends.length >= 6) break;

      // Extract text content (strip HTML tags)
      const rawContent = (status.content || '').replace(/<[^>]*>/g, '').trim();
      if (!rawContent || rawContent.length < 10) continue;

      // Get title — first sentence or first 80 chars
      const firstSentence = rawContent.split(/[.!?]\s/)[0];
      const title = firstSentence.length > 80
        ? firstSentence.substring(0, 77) + '...'
        : firstSentence;

      // Get image from media attachments
      const imageAttachment = (status.media_attachments || []).find(
        (m: any) => m.type === 'image'
      );
      const imageUrl = imageAttachment?.preview_url || imageAttachment?.url || undefined;

      // Engagement metrics
      const favs = status.favourites_count || 0;
      const reblogs = status.reblogs_count || 0;
      const total = favs + reblogs;

      trends.push({
        title,
        description: rawContent.length > 120 ? rawContent.substring(0, 117) + '...' : rawContent,
        platform: 'tiktok',
        imageUrl,
        type: total > 500 ? 'viral' : 'trend',
        engagement: formatCount(total),
      });
    }

    console.log(`[SocialTrends] Got ${trends.length} social trends from Mastodon`);
    return trends;
  } catch (err: any) {
    console.warn('[SocialTrends] Mastodon error:', err.message);
    return [];
  }
}

/**
 * Fetch Instagram trends from Google Trends (positions 4-6, no overlap with Google tab).
 */
export async function fetchInstagramTrends(): Promise<SocialTrend[]> {
  try {
    console.log('[SocialTrends] Fetching Instagram trends (Google Trends 4-6)...');

    const res = await fetch('https://trends.google.com/trending/rss?geo=FR', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeiroBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const trends: SocialTrend[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    // Skip first 3 (shown in Google tab), take next 3
    let index = 0;
    while ((match = itemRegex.exec(xml)) !== null && trends.length < 3) {
      index++;
      if (index <= 3) continue; // Skip first 3

      const block = match[1];
      const title = extractTag(block, 'title');
      const picture = extractTag(block, 'ht:picture') || extractTag(block, 'ht:news_item_picture');
      const newsTitle = extractTag(block, 'ht:news_item_title');
      const traffic = extractTag(block, 'ht:approx_traffic');

      if (!title) continue;

      trends.push({
        title,
        description: newsTitle || `${traffic || 'Populaire'} — idéal pour Reels & Stories`,
        platform: 'instagram',
        imageUrl: picture || undefined,
        type: 'trend',
        engagement: traffic || undefined,
      });
    }

    console.log(`[SocialTrends] Got ${trends.length} Instagram trends`);
    return trends;
  } catch (err: any) {
    console.warn('[SocialTrends] Instagram trends error:', err.message);
    return [];
  }
}

// ─── Helpers ────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`);
  const m = xml.match(regex);
  return (m?.[1] || m?.[2] || '').trim();
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n > 0 ? String(n) : '';
}
