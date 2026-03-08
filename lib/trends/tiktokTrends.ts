/**
 * Fetch TikTok-relevant trending hashtags.
 * Since TikTok Creative Center API is now restricted (40101 no permission),
 * we derive TikTok-style hashtags from Google Trends + curated viral topics.
 * This gives us real trending topics formatted as TikTok-ready hashtags.
 */

export type TikTokHashtag = {
  hashtag: string;
  videoCount: number;
  trend: 'up' | 'down' | 'stable';
};

/**
 * Generate trending TikTok hashtags from Google Trends data + curated viral topics.
 * Called by the aggregator after Google Trends are fetched.
 */
export function deriveTikTokHashtags(googleTrendTitles: string[]): TikTokHashtag[] {
  const hashtags: TikTokHashtag[] = [];
  const seen = new Set<string>();

  // Convert Google Trends titles into TikTok-style hashtags
  for (const title of googleTrendTitles) {
    const tag = toHashtag(title);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      hashtags.push({
        hashtag: tag,
        videoCount: 0, // we don't have exact counts
        trend: 'up',   // they're trending on Google so trending on TikTok too
      });
    }
  }

  // Add always-relevant social media hashtags for France
  const evergreen = [
    'pourtoi', 'fyp', 'foryou', 'viral', 'trend', 'france',
    'entrepreneur', 'business', 'marketing', 'growthhacking',
    'smallbusiness', 'motivation', 'reseauxsociaux', 'contentcreator',
    'pme', 'startup', 'commerce', 'digitalmarketing',
  ];

  for (const tag of evergreen) {
    if (!seen.has(tag)) {
      seen.add(tag);
      hashtags.push({ hashtag: tag, videoCount: 0, trend: 'stable' });
    }
  }

  return hashtags;
}

/** Legacy function kept for compatibility — now uses derived data */
export async function fetchTikTokTrendsFR(): Promise<TikTokHashtag[]> {
  // TikTok API is restricted since early 2026 (code 40101 "no permission")
  // Return empty — the aggregator will use deriveTikTokHashtags() instead
  console.log('[TikTok] API restricted, using derived hashtags from Google Trends');
  return [];
}

/** Convert a trending topic title into a clean hashtag */
function toHashtag(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]/g, '')  // keep only alphanumeric
    .substring(0, 30);
}
