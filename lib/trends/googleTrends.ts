/**
 * Fetch Google Trends daily trending searches for France.
 * Uses the unofficial google-trends-api npm package (free, no auth).
 */

// google-trends-api n'a pas de types TS, on utilise require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const googleTrends = require('google-trends-api');

export type GoogleTrendItem = {
  title: string;
  traffic: string; // ex: "200K+"
  relatedQueries: string[];
  articleTitle?: string;
  articleUrl?: string;
};

export async function fetchGoogleTrendsFR(): Promise<GoogleTrendItem[]> {
  try {
    console.log('[GoogleTrends] Fetching daily trends for France...');

    const result = await googleTrends.dailyTrends({
      trendDate: new Date(),
      geo: 'FR',
    });

    const parsed = JSON.parse(result);
    const trendingSearches =
      parsed?.default?.trendingSearchesDays?.[0]?.trendingSearches || [];

    const items: GoogleTrendItem[] = trendingSearches.map((trend: any) => {
      const relatedQueries = (trend.relatedQueries || []).map(
        (q: any) => q.query || q
      );

      // Premier article associé (si dispo)
      const firstArticle = trend.articles?.[0];

      return {
        title: trend.title?.query || trend.title || '',
        traffic: trend.formattedTraffic || '',
        relatedQueries: relatedQueries.slice(0, 5),
        articleTitle: firstArticle?.title,
        articleUrl: firstArticle?.url,
      };
    });

    console.log(`[GoogleTrends] Found ${items.length} trending topics`);
    return items;
  } catch (error: any) {
    console.error('[GoogleTrends] Error:', error.message);
    return [];
  }
}
