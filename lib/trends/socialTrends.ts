/**
 * Fetch real social media trends with images.
 *
 * TikTok tab: Google Trends FR positions 4-6 (different from Google tab which shows 1-3)
 * Instagram tab: French Mastodon (piaille.fr) trending statuses — real French visual social content
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
 * Fetch TikTok trends from Google Trends (positions 4-6, French, with images).
 * What trends on Google in France also trends on French TikTok.
 */
export async function fetchTikTokTrends(): Promise<SocialTrend[]> {
  try {
    console.log('[SocialTrends] Fetching TikTok trends (Google Trends FR 4-6)...');

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
        description: newsTitle || `${traffic || 'Populaire'} \u2014 id\u00e9al pour TikTok`,
        platform: 'tiktok',
        imageUrl: picture || undefined,
        type: 'trend',
        engagement: traffic || undefined,
      });
    }

    console.log(`[SocialTrends] Got ${trends.length} TikTok trends`);
    return trends;
  } catch (err: any) {
    console.warn('[SocialTrends] TikTok trends error:', err.message);
    return [];
  }
}

/**
 * Fetch Instagram trends from French Mastodon (piaille.fr) — real French visual social content.
 * Falls back to mastodon.social if piaille.fr fails.
 */
export async function fetchInstagramTrends(): Promise<SocialTrend[]> {
  try {
    console.log('[SocialTrends] Fetching Instagram trends (French Mastodon)...');

    // Try French Mastodon instance first, fallback to mastodon.social
    let statuses: any[] = [];
    for (const instance of ['piaille.fr', 'mastodon.social']) {
      try {
        const res = await fetch(`https://${instance}/api/v1/trends/statuses?limit=15`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          statuses = await res.json();
          if (Array.isArray(statuses) && statuses.length > 0) {
            console.log(`[SocialTrends] Got statuses from ${instance}`);
            break;
          }
        }
      } catch {
        continue;
      }
    }

    if (!Array.isArray(statuses) || !statuses.length) return [];

    const trends: SocialTrend[] = [];

    for (const status of statuses) {
      if (trends.length >= 3) break;

      // Prefer posts with images (Instagram is visual)
      const imageAttachment = (status.media_attachments || []).find(
        (m: any) => m.type === 'image'
      );
      const imageUrl = imageAttachment?.preview_url || imageAttachment?.url || undefined;

      // Extract text content (strip HTML tags)
      const rawContent = (status.content || '').replace(/<[^>]*>/g, '').trim();
      if (!rawContent || rawContent.length < 10) continue;

      // Skip non-French content (basic heuristic: check for common French words/chars)
      const frenchIndicators = /[àâéèêëïîôùûüÿçœæ]|(?:les |des |une |est |pour |dans |avec |sur |que |qui |pas |ont |sont |cette |mais |tout |bien |très |aussi |plus )/i;
      const isFrench = frenchIndicators.test(rawContent);
      // If from piaille.fr, trust it's French; otherwise filter
      if (!isFrench && !imageUrl) continue;

      // Get title — first sentence or first 80 chars
      const firstSentence = rawContent.split(/[.!?]\s/)[0];
      const title = firstSentence.length > 80
        ? firstSentence.substring(0, 77) + '...'
        : firstSentence;

      // Engagement metrics
      const favs = status.favourites_count || 0;
      const reblogs = status.reblogs_count || 0;
      const total = favs + reblogs;

      trends.push({
        title,
        description: rawContent.length > 120 ? rawContent.substring(0, 117) + '...' : rawContent,
        platform: 'instagram',
        imageUrl,
        type: total > 500 ? 'viral' : 'trend',
        engagement: formatCount(total),
      });
    }

    console.log(`[SocialTrends] Got ${trends.length} Instagram trends from Mastodon`);
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
