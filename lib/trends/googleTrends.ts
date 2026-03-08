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

export async function fetchGoogleTrendsFR(): Promise<GoogleTrendItem[]> {
  try {
    console.log('[GoogleTrends] Fetching daily trends via RSS for France...');

    const response = await fetch('https://trends.google.com/trending/rss?geo=FR', {
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
  return (m[1] || m[2] || '').trim();
}
