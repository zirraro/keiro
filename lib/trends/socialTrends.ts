/**
 * Fetch real social media trends (TikTok + Instagram) with images.
 *
 * TikTok: Creative Center API (public, no auth needed)
 * Instagram: Derived from Google Trends + enriched with social context
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
 * Fetch trending TikTok hashtags/challenges from Creative Center API
 */
export async function fetchTikTokTrends(): Promise<SocialTrend[]> {
  try {
    console.log('[SocialTrends] Fetching TikTok Creative Center trends...');

    // TikTok Creative Center internal API — public, no auth
    const res = await fetch(
      'https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list?page=1&limit=10&period=7&country_code=FR',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en',
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      console.warn(`[SocialTrends] TikTok Creative Center responded ${res.status}`);
      return fetchTikTokTrendsFallback();
    }

    const json = await res.json();
    const items = json?.data?.list || json?.data?.hashtag_list || [];

    if (!items.length) {
      console.warn('[SocialTrends] TikTok Creative Center returned empty, using fallback');
      return fetchTikTokTrendsFallback();
    }

    const trends: SocialTrend[] = items.slice(0, 8).map((item: any) => ({
      title: item.hashtag_name || item.hashtag || item.name || '',
      description: item.trend_sentence || item.description || `${formatCount(item.publish_cnt || item.video_count || 0)} vidéos`,
      platform: 'tiktok' as const,
      imageUrl: item.video_cover || item.cover || item.thumbnail || undefined,
      type: detectTrendType(item.hashtag_name || ''),
      engagement: formatCount(item.publish_cnt || item.video_count || item.view_count || 0),
    }));

    console.log(`[SocialTrends] Got ${trends.length} TikTok trends from Creative Center`);
    return trends.filter(t => t.title);
  } catch (err: any) {
    console.warn('[SocialTrends] TikTok Creative Center error:', err.message);
    return fetchTikTokTrendsFallback();
  }
}

/**
 * Fallback: Fetch TikTok trends from Google Trends (repackaged for TikTok context)
 */
async function fetchTikTokTrendsFallback(): Promise<SocialTrend[]> {
  try {
    // Use Google Trends RSS but frame as TikTok-relevant trends
    const res = await fetch('https://trends.google.com/trending/rss?geo=FR', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeiroBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const trends: SocialTrend[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && trends.length < 6) {
      const block = match[1];
      const title = extractTag(block, 'title');
      const picture = extractTag(block, 'ht:picture') || extractTag(block, 'ht:news_item_picture');
      const newsTitle = extractTag(block, 'ht:news_item_title');
      const traffic = extractTag(block, 'ht:approx_traffic');

      if (!title) continue;

      trends.push({
        title,
        description: newsTitle || `Tendance ${traffic || 'populaire'} — potentiel viral TikTok`,
        platform: 'tiktok',
        imageUrl: picture || undefined,
        type: 'trend',
        engagement: traffic || undefined,
      });
    }
    return trends;
  } catch {
    return [];
  }
}

/**
 * Fetch Instagram trends.
 * Instagram has no public trending API, so we derive from Google Trends
 * and frame them as Instagram-relevant content opportunities.
 */
export async function fetchInstagramTrends(): Promise<SocialTrend[]> {
  try {
    console.log('[SocialTrends] Deriving Instagram trends from Google Trends...');

    const res = await fetch('https://trends.google.com/trending/rss?geo=FR', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeiroBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const trends: SocialTrend[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    // Skip the first 4 (those are shown in Google tab), take the next 6
    let skip = 0;
    while ((match = itemRegex.exec(xml)) !== null && trends.length < 6) {
      skip++;
      if (skip <= 4) continue; // Skip first 4 (already in Google trends tab)

      const block = match[1];
      const title = extractTag(block, 'title');
      const picture = extractTag(block, 'ht:picture') || extractTag(block, 'ht:news_item_picture');
      const newsTitle = extractTag(block, 'ht:news_item_title');
      const traffic = extractTag(block, 'ht:approx_traffic');

      if (!title) continue;

      trends.push({
        title,
        description: newsTitle || `Tendance ${traffic || 'populaire'} — à exploiter en Reels`,
        platform: 'instagram',
        imageUrl: picture || undefined,
        type: detectInstaTrendType(title),
        engagement: traffic || undefined,
      });
    }

    console.log(`[SocialTrends] Derived ${trends.length} Instagram trends`);
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
  return String(n || '');
}

function detectTrendType(name: string): SocialTrend['type'] {
  const lower = (name || '').toLowerCase();
  if (lower.includes('challenge') || lower.includes('defi')) return 'challenge';
  if (lower.includes('trend') || lower.includes('tendance')) return 'trend';
  if (lower.includes('format') || lower.includes('pov') || lower.includes('storytime')) return 'format';
  return 'viral';
}

function detectInstaTrendType(name: string): SocialTrend['type'] {
  const lower = (name || '').toLowerCase();
  if (lower.includes('challenge') || lower.includes('défi')) return 'challenge';
  if (lower.includes('viral') || lower.includes('buzz')) return 'viral';
  return 'trend';
}
