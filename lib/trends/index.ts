/**
 * Agrégateur de tendances : Google Trends + TikTok + Instagram + LinkedIn.
 * Cache serveur 12h + persistance en BDD Supabase pour historique.
 */

import { fetchGoogleTrendsFR, type GoogleTrendItem } from './googleTrends';
import { deriveTikTokHashtags, type TikTokHashtag } from './tiktokTrends';
import { fetchTikTokTrendingMusicFR, type TikTokTrendingSong } from './tiktokMusic';
import { fetchTikTokTrends, fetchInstagramTrends, fetchLinkedInSocialTrends, type SocialTrend } from './socialTrends';
import { fetchInstagramRealTrends, type InstagramRealTrend } from './instagramRealTrends';
import { fetchTikTokCreativeCenterTrends, type TikTokRealTrend } from './tiktokCreativeCenter';
import { createClient } from '@supabase/supabase-js';

export type TrendingData = {
  googleTrends: GoogleTrendItem[];
  tiktokHashtags: TikTokHashtag[];
  trendingMusic: TikTokTrendingSong[];
  tiktokTrends: SocialTrend[];
  instagramTrends: SocialTrend[];
  linkedinTrends: SocialTrend[];
  instagramHashtags: InstagramRealTrend[];
  tiktokRealHashtags: TikTokRealTrend[];
  keywords: string[]; // liste plate pour scoring rapide
  fetchedAt: string;  // ISO timestamp
};

// Map newsRegion codes to Google Trends geo codes
const REGION_TO_GEO: Record<string, string> = {
  fr: 'FR', be: 'BE', es: 'ES', gb: 'GB', us: 'US', pt: 'PT',
  me: 'SA', // Middle East → Saudi Arabia (closest Google Trends geo)
  nord: 'SE', // Northern Europe → Sweden (closest)
};

// Cache serveur par région (persiste tant que le process Node tourne)
const cachedByRegion: Record<string, { data: TrendingData; ts: number }> = {};
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12h (refresh 2x/jour via cron)

export async function fetchAllTrends(force = false, region = 'fr'): Promise<TrendingData> {
  const geo = REGION_TO_GEO[region] || 'FR';
  const now = Date.now();

  // Vérifier le cache par région (sauf si force refresh via cron)
  const cached = cachedByRegion[region];
  if (!force && cached && now - cached.ts < CACHE_TTL) {
    const ageH = Math.round((now - cached.ts) / 3600000);
    console.log(`[Trends] Cache hit for ${region}/${geo} (age: ${ageH}h)`);
    return cached.data;
  }

  console.log(`[Trends] Cache miss for ${region}/${geo}, fetching fresh trends...`);

  // Fetch all sources in parallel with geo
  const [googleResult, musicResult, tiktokResult, instaResult, linkedinResult, instaRealResult, tiktokRealResult] = await Promise.allSettled([
    fetchGoogleTrendsFR(geo),
    fetchTikTokTrendingMusicFR(),
    fetchTikTokTrends(geo),
    fetchInstagramTrends(geo),
    fetchLinkedInSocialTrends(geo),
    fetchInstagramRealTrends(geo),
    fetchTikTokCreativeCenterTrends(geo),
  ]);

  const googleTrends =
    googleResult.status === 'fulfilled' ? googleResult.value : [];
  const trendingMusic =
    musicResult.status === 'fulfilled' ? musicResult.value : [];
  const tiktokTrends =
    tiktokResult.status === 'fulfilled' ? tiktokResult.value : [];
  const instagramTrends =
    instaResult.status === 'fulfilled' ? instaResult.value : [];
  const linkedinTrends =
    linkedinResult.status === 'fulfilled' ? linkedinResult.value : [];
  const instagramHashtags =
    instaRealResult.status === 'fulfilled' ? instaRealResult.value : [];
  const tiktokRealHashtags =
    tiktokRealResult.status === 'fulfilled' ? tiktokRealResult.value : [];

  // Derive TikTok hashtags from Google Trends data
  const tiktokHashtags = deriveTikTokHashtags(googleTrends.map(t => t.title));

  // Construire la liste plate de keywords pour scoring
  const keywords: string[] = [];

  for (const trend of googleTrends) {
    if (trend.title) keywords.push(trend.title.toLowerCase());
    for (const q of trend.relatedQueries) {
      keywords.push(q.toLowerCase());
    }
  }

  for (const tag of tiktokHashtags) {
    if (tag.hashtag) {
      keywords.push(tag.hashtag.replace(/^#/, '').toLowerCase());
    }
  }

  // Add music titles/artists to keywords for scoring
  for (const song of trendingMusic) {
    if (song.title) keywords.push(song.title.toLowerCase());
    if (song.artist) keywords.push(song.artist.toLowerCase());
  }

  // Add social trend titles to keywords
  for (const t of tiktokTrends) {
    if (t.title) keywords.push(t.title.toLowerCase());
  }
  for (const t of instagramTrends) {
    if (t.title) keywords.push(t.title.toLowerCase());
  }

  // Add LinkedIn trends to keywords
  for (const t of linkedinTrends) {
    if (t.title) keywords.push(t.title.toLowerCase());
    if (t.keyword && t.keyword !== t.title) keywords.push(t.keyword.toLowerCase());
  }

  // Add Instagram real hashtags to keywords
  for (const t of instagramHashtags) {
    if (t.hashtag) keywords.push(t.hashtag.toLowerCase());
  }

  // Add TikTok real hashtags to keywords
  for (const t of tiktokRealHashtags) {
    if (t.hashtag) keywords.push(t.hashtag.toLowerCase());
  }

  const data: TrendingData = {
    googleTrends,
    tiktokHashtags,
    trendingMusic,
    tiktokTrends,
    instagramTrends,
    linkedinTrends,
    instagramHashtags,
    tiktokRealHashtags,
    keywords: [...new Set(keywords)],
    fetchedAt: new Date().toISOString(),
  };

  // Mettre en cache mémoire par région
  cachedByRegion[region] = { data, ts: now };

  console.log(
    `[Trends] Cached: ${googleTrends.length} Google, ${tiktokTrends.length} TikTok, ${instagramTrends.length} Instagram, ${linkedinTrends.length} LinkedIn, ${instagramHashtags.length} InstaHashtags, ${tiktokRealHashtags.length} TikTokReal, ${trendingMusic.length} songs, ${data.keywords.length} keywords`
  );

  // Persister en BDD pour historique (async, non bloquant)
  persistTrendsToDb(googleTrends, tiktokHashtags).catch((err) =>
    console.error('[Trends] DB persist error:', err.message)
  );

  return data;
}

/**
 * Persiste les tendances du jour en BDD Supabase (table daily_trends).
 * Utilise UPSERT pour éviter les doublons si appelé plusieurs fois le même jour.
 */
async function persistTrendsToDb(
  googleTrends: GoogleTrendItem[],
  tiktokHashtags: TikTokHashtag[]
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const rows: any[] = [];

  for (const trend of googleTrends) {
    if (!trend.title) continue;
    rows.push({
      trend_date: today,
      source: 'google_trends',
      keyword: trend.title.toLowerCase(),
      traffic: trend.traffic || null,
      video_count: null,
      trend_direction: 'up',
      related_queries: trend.relatedQueries || [],
      raw_data: trend,
    });
  }

  for (const tag of tiktokHashtags) {
    if (!tag.hashtag) continue;
    rows.push({
      trend_date: today,
      source: 'tiktok',
      keyword: tag.hashtag.replace(/^#/, '').toLowerCase(),
      traffic: null,
      video_count: tag.videoCount || null,
      trend_direction: tag.trend || 'stable',
      related_queries: [],
      raw_data: tag,
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('daily_trends')
    .upsert(rows, { onConflict: 'trend_date,source,keyword', ignoreDuplicates: true });

  if (error) {
    console.warn('[Trends] DB upsert warning:', error.message);
  } else {
    console.log(`[Trends] Persisted ${rows.length} trends to DB for ${today}`);
  }
}

// Export pour usage externe
export type { GoogleTrendItem } from './googleTrends';
export type { TikTokHashtag } from './tiktokTrends';
export type { TikTokTrendingSong } from './tiktokMusic';
export type { SocialTrend } from './socialTrends';
export type { InstagramRealTrend } from './instagramRealTrends';
export type { TikTokRealTrend } from './tiktokCreativeCenter';
