/**
 * LinkedIn Trends — Business-oriented trending topics from Google News FR.
 *
 * LinkedIn doesn't expose a public trending API.
 * Best free approach: Google News RSS for business/professional topics in France.
 * These are the same topics that trend on LinkedIn France (business news, startups, etc.).
 *
 * Also tries to scrape LinkedIn Pulse trending if available.
 */

export type LinkedInTrend = {
  title: string;
  keyword: string;
  description: string;
  imageUrl?: string;
  source: string;       // 'google_news' | 'linkedin_pulse'
  engagement?: string;
  url?: string;
};

/**
 * Fetch LinkedIn-relevant business trends for a country.
 * Uses Google News business RSS as primary source.
 */
export async function fetchLinkedInTrends(geo = 'FR'): Promise<LinkedInTrend[]> {
  try {
    console.log(`[LinkedInTrends] Fetching business trends for ${geo}...`);

    // Map geo to Google News language/country params
    const geoConfig = GEO_NEWS_CONFIG[geo] || GEO_NEWS_CONFIG['FR'];

    const trends = await fetchGoogleNewsBusiness(geoConfig);
    console.log(`[LinkedInTrends] Got ${trends.length} business trends for ${geo}`);
    return trends;
  } catch (err: any) {
    console.warn('[LinkedInTrends] Error:', err.message);
    return [];
  }
}

// ─── Google News Business RSS ──────────────────────────────

interface GeoNewsConfig {
  hl: string;   // host language
  gl: string;   // country
  ceid: string;  // edition
  query: string; // search terms
}

const GEO_NEWS_CONFIG: Record<string, GeoNewsConfig> = {
  FR: { hl: 'fr', gl: 'FR', ceid: 'FR:fr', query: 'entreprise OR startup OR business OR economie OR tech' },
  BE: { hl: 'fr', gl: 'BE', ceid: 'BE:fr', query: 'entreprise OR startup OR business OR economie' },
  ES: { hl: 'es', gl: 'ES', ceid: 'ES:es', query: 'empresa OR startup OR negocio OR economia OR tecnologia' },
  GB: { hl: 'en', gl: 'GB', ceid: 'GB:en', query: 'business OR startup OR economy OR tech OR entrepreneur' },
  US: { hl: 'en', gl: 'US', ceid: 'US:en', query: 'business OR startup OR economy OR tech OR entrepreneur' },
  PT: { hl: 'pt', gl: 'PT', ceid: 'PT:pt', query: 'empresa OR startup OR negocio OR economia' },
  SA: { hl: 'ar', gl: 'SA', ceid: 'SA:ar', query: 'business OR startup OR أعمال OR تكنولوجيا' },
  SE: { hl: 'sv', gl: 'SE', ceid: 'SE:sv', query: 'företag OR startup OR business OR ekonomi' },
};

async function fetchGoogleNewsBusiness(config: GeoNewsConfig): Promise<LinkedInTrend[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(config.query)}&hl=${config.hl}&gl=${config.gl}&ceid=${config.ceid}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeiroBot/1.0)' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    console.warn(`[LinkedInTrends] Google News responded ${res.status}`);
    return [];
  }

  const xml = await res.text();
  const trends: LinkedInTrend[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && trends.length < 6) {
    const block = match[1];
    const title = cleanText(extractTag(block, 'title'));
    const description = cleanText(extractTag(block, 'description'));
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const source = extractTag(block, 'source');

    if (!title || title.length < 5) continue;

    // Extract image from description HTML if present
    const imgMatch = description.match(/src="([^"]+)"/);
    const imageUrl = imgMatch?.[1] || undefined;

    // Clean description (remove HTML tags)
    const cleanDesc = description
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

    // Extract a keyword from the title (first 2-3 significant words)
    const keyword = extractKeyword(title);

    trends.push({
      title,
      keyword,
      description: cleanDesc || `${source || 'Business'} — ${pubDate ? formatRelativeTime(pubDate) : 'Tendance'}`,
      imageUrl,
      source: 'google_news',
      engagement: source || undefined,
      url: link || undefined,
    });
  }

  return trends;
}

// ─── Helpers ────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`);
  const m = xml.match(regex);
  return (m?.[1] || m?.[2] || '').trim();
}

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

/** Extract significant keyword from a title */
function extractKeyword(title: string): string {
  const stopWords = new Set([
    'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'en', 'et', 'ou', 'à', 'au', 'aux',
    'que', 'qui', 'sur', 'par', 'pour', 'dans', 'avec', 'son', 'sa', 'ses', 'ce', 'cette',
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'was',
    'est', 'sont', 'été', 'être', 'avoir', 'fait', 'plus', 'pas', 'ne', 'se',
  ]);

  const words = title.split(/[\s:,\-–—]+/).filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
  return words.slice(0, 3).join(' ');
}

/** Format a date string as relative time in French */
function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = Date.now();
    const diffH = Math.round((now - date.getTime()) / 3600000);
    if (diffH < 1) return "Il y a moins d'1h";
    if (diffH < 24) return `Il y a ${diffH}h`;
    const diffD = Math.round(diffH / 24);
    return `Il y a ${diffD}j`;
  } catch {
    return 'Tendance';
  }
}
