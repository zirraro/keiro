/**
 * Fetch TikTok Creative Center trending music/songs for France.
 * Uses TikTok's internal Creative Radar API (public JSON endpoint, no auth).
 * Same pattern as hashtag trends — falls back gracefully if API changes.
 */

export type TikTokTrendingSong = {
  title: string;
  artist: string;
  duration: number; // seconds
  videoCount: number;
  trend: 'up' | 'down' | 'stable';
  coverUrl: string | null;
  clipUrl: string | null; // preview audio URL if available
};

const TIKTOK_MUSIC_API_URL =
  'https://ads.tiktok.com/creative_radar_api/v1/popular_trend/sound/list';

export async function fetchTikTokTrendingMusicFR(): Promise<TikTokTrendingSong[]> {
  try {
    console.log('[TikTokMusic] Fetching trending songs for France...');

    const params = new URLSearchParams({
      page: '1',
      limit: '30',
      period: '7',
      country_code: 'FR',
      sort_by: 'popular',
    });

    const response = await fetch(`${TIKTOK_MUSIC_API_URL}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[TikTokMusic] API responded ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (data.code !== 0 || !data.data?.list) {
      console.warn('[TikTokMusic] Unexpected response format:', data.code, data.msg);
      return [];
    }

    const items: TikTokTrendingSong[] = data.data.list.map((item: any) => ({
      title: item.title || item.music_name || item.sound_name || 'Unknown',
      artist: item.author || item.artist || item.creator_name || 'Unknown',
      duration: item.duration || 0,
      videoCount: item.video_count || item.publish_cnt || 0,
      trend: parseMusicTrend(item.trend || item.value_trend),
      coverUrl: item.cover_url || item.cover_large || item.avatar_url || null,
      clipUrl: item.play_url || item.music_url || item.sound_url || null,
    }));

    console.log(`[TikTokMusic] Found ${items.length} trending songs`);
    return items;
  } catch (error: any) {
    console.warn('[TikTokMusic] Failed to fetch:', error.message);
    return [];
  }
}

function parseMusicTrend(value: any): 'up' | 'down' | 'stable' {
  if (typeof value === 'number') {
    return value > 0 ? 'up' : value < 0 ? 'down' : 'stable';
  }
  if (typeof value === 'string') {
    if (value.includes('up') || value.includes('rise')) return 'up';
    if (value.includes('down') || value.includes('fall')) return 'down';
  }
  return 'stable';
}
