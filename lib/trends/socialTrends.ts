/**
 * Fetch social media trends with images — all from Google Trends RSS.
 *
 * Single fetch, items distributed across platforms:
 * Instagram: items 1-6
 * TikTok:    items 7-12
 * LinkedIn:  items 13-18
 *
 * Google Trends geo=FR reflects what's trending in France across ALL platforms.
 * Titles displayed = ht:news_item_title (always in French) with keyword as subtitle.
 * No duplicates between tabs guaranteed (different position ranges).
 */

export type SocialTrend = {
  title: string;         // French article title (ht:news_item_title)
  keyword: string;       // Trending keyword (may be English: "Taylor Swift", etc.)
  description: string;
  platform: 'tiktok' | 'instagram' | 'linkedin';
  imageUrl?: string;
  type: 'challenge' | 'trend' | 'format' | 'viral';
  engagement?: string;
};

export type AllSocialTrends = {
  instagram: SocialTrend[];
  tiktok: SocialTrend[];
  linkedin: SocialTrend[];
};

/**
 * Fetch Google Trends RSS once and split items across platforms.
 * Instagram = items 1-6, TikTok = 7-12, LinkedIn = 13-18.
 */
export async function fetchAllSocialTrends(geo = 'FR'): Promise<AllSocialTrends> {
  try {
    console.log(`[SocialTrends] Fetching all social trends (Google Trends ${geo}, single fetch)...`);

    const res = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeiroBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[SocialTrends] RSS fetch failed: ${res.status}`);
      return { instagram: [], tiktok: [], linkedin: [] };
    }

    const xml = await res.text();
    const allItems = parseAllItems(xml);

    // Split: 1-6 Instagram, 7-12 TikTok, 13-18 LinkedIn
    const instagram = assignPlatform(allItems.slice(0, 6), 'instagram');
    const tiktok = assignPlatform(allItems.slice(6, 12), 'tiktok');
    const linkedin = assignPlatform(allItems.slice(12, 18), 'linkedin');

    console.log(`[SocialTrends] Got ${instagram.length} Instagram, ${tiktok.length} TikTok, ${linkedin.length} LinkedIn trends`);

    return { instagram, tiktok, linkedin };
  } catch (err: any) {
    console.warn('[SocialTrends] Fetch error:', err.message);
    return { instagram: [], tiktok: [], linkedin: [] };
  }
}

// ─── Internal ───────────────────────────────────────────

type RawItem = {
  title: string;
  keyword: string;
  description: string;
  imageUrl?: string;
  engagement?: string;
};

/** Parse all <item> blocks from RSS XML into raw items (no platform assigned yet). */
function parseAllItems(xml: string): RawItem[] {
  const items: RawItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const keyword = cleanText(extractTag(block, 'title'));
    const newsTitle = cleanText(extractTag(block, 'ht:news_item_title'));
    const picture = extractTag(block, 'ht:picture') || extractTag(block, 'ht:news_item_picture');
    const traffic = extractTag(block, 'ht:approx_traffic');

    if (!keyword) continue;

    const title = newsTitle || keyword;

    items.push({
      title,
      keyword,
      description: newsTitle && newsTitle !== keyword
        ? `${keyword} \u2014 ${traffic || 'Tendance'}`
        : `${traffic || 'Populaire'} en France`,
      imageUrl: picture || undefined,
      engagement: traffic || undefined,
    });
  }

  return items;
}

/** Assign platform to raw items, producing SocialTrend[]. */
function assignPlatform(
  items: RawItem[],
  platform: 'tiktok' | 'instagram' | 'linkedin'
): SocialTrend[] {
  return items.map((item) => ({
    ...item,
    platform,
    type: 'trend' as const,
  }));
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
