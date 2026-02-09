/**
 * Fetch TikTok Creative Center trending hashtags for France.
 * Uses TikTok's internal Creative Radar API (public JSON endpoint, no auth).
 * Falls back gracefully if the API changes or blocks.
 */

export type TikTokHashtag = {
  hashtag: string;
  videoCount: number;
  trend: 'up' | 'down' | 'stable';
};

const TIKTOK_API_URL =
  'https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list';

export async function fetchTikTokTrendsFR(): Promise<TikTokHashtag[]> {
  try {
    console.log('[TikTok] Fetching trending hashtags for France...');

    const params = new URLSearchParams({
      page: '1',
      limit: '50',
      period: '7',       // derniers 7 jours
      country_code: 'FR',
      sort_by: 'popular',
    });

    const response = await fetch(`${TIKTOK_API_URL}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[TikTok] API responded ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (data.code !== 0 || !data.data?.list) {
      console.warn('[TikTok] Unexpected response format:', data.code, data.msg);
      return [];
    }

    const items: TikTokHashtag[] = data.data.list.map((item: any) => ({
      hashtag: item.hashtag_name || item.hashtag || '',
      videoCount: item.video_count || item.publish_cnt || 0,
      trend: parseTrend(item.trend || item.value_trend),
    }));

    console.log(`[TikTok] Found ${items.length} trending hashtags`);
    return items;
  } catch (error: any) {
    // Fallback gracieux - pas de crash si TikTok bloque
    console.warn('[TikTok] Failed to fetch (expected if API changes):', error.message);
    return [];
  }
}

function parseTrend(value: any): 'up' | 'down' | 'stable' {
  if (typeof value === 'number') {
    return value > 0 ? 'up' : value < 0 ? 'down' : 'stable';
  }
  if (typeof value === 'string') {
    if (value.includes('up') || value.includes('rise')) return 'up';
    if (value.includes('down') || value.includes('fall')) return 'down';
  }
  return 'stable';
}
