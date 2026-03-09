/**
 * Fetch social media trends with images — all from Google Trends FR RSS.
 *
 * TikTok tab: Google Trends FR positions 4-6
 * Instagram tab: Google Trends FR positions 7-9
 *
 * Google Trends geo=FR reflects what's trending in France across ALL platforms.
 * Titles displayed = ht:news_item_title (always in French) with keyword as subtitle.
 * No duplicates between tabs guaranteed (different position ranges).
 */

export type SocialTrend = {
  title: string;         // French article title (ht:news_item_title)
  keyword: string;       // Trending keyword (may be English: "Taylor Swift", etc.)
  description: string;
  platform: 'tiktok' | 'instagram';
  imageUrl?: string;
  type: 'challenge' | 'trend' | 'format' | 'viral';
  engagement?: string;
};

/**
 * Fetch TikTok trends = Google Trends FR positions 4-9 (6 items for "voir plus").
 */
export async function fetchTikTokTrends(geo = 'FR'): Promise<SocialTrend[]> {
  try {
    console.log(`[SocialTrends] Fetching TikTok trends (Google Trends ${geo} 4-9)...`);
    return await fetchGoogleTrendsRange(4, 9, 'tiktok', geo);
  } catch (err: any) {
    console.warn('[SocialTrends] TikTok trends error:', err.message);
    return [];
  }
}

/**
 * Fetch Instagram trends = Google Trends positions 10-15 (6 items for "voir plus").
 */
export async function fetchInstagramTrends(geo = 'FR'): Promise<SocialTrend[]> {
  try {
    console.log(`[SocialTrends] Fetching Instagram trends (Google Trends ${geo} 10-15)...`);
    return await fetchGoogleTrendsRange(10, 15, 'instagram', geo);
  } catch (err: any) {
    console.warn('[SocialTrends] Instagram trends error:', err.message);
    return [];
  }
}

/**
 * Shared: fetch Google Trends RSS and extract a specific position range.
 */
async function fetchGoogleTrendsRange(
  startPos: number,
  endPos: number,
  platform: 'tiktok' | 'instagram',
  geo: string
): Promise<SocialTrend[]> {
  const res = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeiroBot/1.0)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];

  const xml = await res.text();
  const trends: SocialTrend[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  let index = 0;

  while ((match = itemRegex.exec(xml)) !== null) {
    index++;
    if (index < startPos) continue;
    if (index > endPos) break;

    const block = match[1];
    const keyword = cleanText(extractTag(block, 'title'));
    const newsTitle = cleanText(extractTag(block, 'ht:news_item_title'));
    const picture = extractTag(block, 'ht:picture') || extractTag(block, 'ht:news_item_picture');
    const traffic = extractTag(block, 'ht:approx_traffic');

    if (!keyword) continue;

    // Use French article title as main title, keyword as subtitle
    const title = newsTitle || keyword;

    trends.push({
      title,
      keyword,
      description: newsTitle && newsTitle !== keyword
        ? `${keyword} \u2014 ${traffic || 'Tendance'}`
        : `${traffic || 'Populaire'} en France`,
      platform,
      imageUrl: picture || undefined,
      type: 'trend',
      engagement: traffic || undefined,
    });
  }

  console.log(`[SocialTrends] Got ${trends.length} ${platform} trends (pos ${startPos}-${endPos})`);
  return trends;
}

// ─── Helpers ────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`);
  const m = xml.match(regex);
  return (m?.[1] || m?.[2] || '').trim();
}

/** Clean XML entities and encoding artifacts */
function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .trim();
}
