/**
 * Fetch trending music for France.
 * Uses Apple Music RSS Charts (official, free, no auth, always works).
 * This gives us the real top songs in France — these are the songs
 * people are listening to and using in social media content.
 */

export type TikTokTrendingSong = {
  title: string;
  artist: string;
  duration: number; // seconds (0 = unknown from this source)
  videoCount: number; // not available from Apple, kept for compat
  trend: 'up' | 'down' | 'stable';
  coverUrl: string | null;
  clipUrl: string | null; // Apple Music link for reference
};

const APPLE_MUSIC_RSS_URL =
  'https://rss.applemarketingtools.com/api/v2/fr/music/most-played/25/songs.json';

export async function fetchTikTokTrendingMusicFR(): Promise<TikTokTrendingSong[]> {
  try {
    console.log('[TrendingMusic] Fetching top songs France via Apple Music Charts...');

    const response = await fetch(APPLE_MUSIC_RSS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KeiroBot/1.0)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[TrendingMusic] Apple Music API responded ${response.status}`);
      return [];
    }

    const data = await response.json();
    const results = data?.feed?.results;

    if (!Array.isArray(results) || results.length === 0) {
      console.warn('[TrendingMusic] No results in Apple Music response');
      return [];
    }

    const items: TikTokTrendingSong[] = results.map((song: any, i: number) => ({
      title: song.name || 'Unknown',
      artist: song.artistName || 'Unknown',
      duration: 0,
      videoCount: 0,
      trend: i < 5 ? 'up' : 'stable', // top 5 are "trending up"
      coverUrl: song.artworkUrl100
        ? song.artworkUrl100.replace('100x100bb', '200x200bb')
        : null,
      clipUrl: song.url || null,
    }));

    console.log(`[TrendingMusic] Found ${items.length} top songs France`);
    return items;
  } catch (error: any) {
    console.warn('[TrendingMusic] Failed to fetch:', error.message);
    return [];
  }
}
