/**
 * Fetch Google Trends daily trending searches for France.
 * Uses the official Google Trends RSS feed (reliable, no auth, no scraping).
 */

export type GoogleTrendItem = {
  title: string;
  traffic: string; // ex: "200K+"
  relatedQueries: string[];
  articleTitle?: string;
  articleUrl?: string;
  pictureUrl?: string;
};

export async function fetchGoogleTrendsFR(geo = 'FR'): Promise<GoogleTrendItem[]> {
  try {
    console.log(`[GoogleTrends] Fetching daily trends via RSS for ${geo}...`);

    const response = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KeiroBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[GoogleTrends] RSS responded ${response.status}`);
      return [];
    }

    const xml = await response.text();

    // Parse RSS XML — extract <item> blocks
    const items: GoogleTrendItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
      const block = match[1];

      const title = extractTag(block, 'title');
      const traffic = extractTag(block, 'ht:approx_traffic');
      const newsTitle = extractTag(block, 'ht:news_item_title') || extractTag(block, 'description');
      const newsUrl = extractTag(block, 'ht:news_item_url');
      const pictureUrl = extractTag(block, 'ht:picture') || extractTag(block, 'ht:news_item_picture');

      if (!title) continue;

      items.push({
        title,
        traffic: traffic || '',
        relatedQueries: [],
        articleTitle: newsTitle || undefined,
        articleUrl: newsUrl || undefined,
        pictureUrl: pictureUrl || undefined,
      });
    }

    console.log(`[GoogleTrends] Found ${items.length} trending topics`);
    return items;
  } catch (error: any) {
    console.error('[GoogleTrends] Error:', error.message);
    return [];
  }
}

/** Extract text content from an XML tag */
function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`);
  const m = xml.match(regex);
  if (!m) return '';
  return cleanText((m[1] || m[2] || '').trim());
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
