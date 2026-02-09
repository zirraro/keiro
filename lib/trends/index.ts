/**
 * Agrégateur de tendances : Google Trends + TikTok hashtags.
 * Cache serveur 24h + persistance en BDD Supabase pour historique.
 */

import { fetchGoogleTrendsFR, type GoogleTrendItem } from './googleTrends';
import { fetchTikTokTrendsFR, type TikTokHashtag } from './tiktokTrends';
import { createClient } from '@supabase/supabase-js';

export type TrendingData = {
  googleTrends: GoogleTrendItem[];
  tiktokHashtags: TikTokHashtag[];
  keywords: string[]; // liste plate pour scoring rapide
  fetchedAt: string;  // ISO timestamp
};

// Cache serveur (persiste tant que le process Node tourne)
let cachedTrends: TrendingData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export async function fetchAllTrends(): Promise<TrendingData> {
  // Vérifier le cache
  const now = Date.now();
  if (cachedTrends && now - cacheTimestamp < CACHE_TTL) {
    const ageH = Math.round((now - cacheTimestamp) / 3600000);
    console.log(`[Trends] Cache hit (age: ${ageH}h)`);
    return cachedTrends;
  }

  console.log('[Trends] Cache miss, fetching fresh trends...');

  // Fetch en parallèle avec fallback
  const [googleResult, tiktokResult] = await Promise.allSettled([
    fetchGoogleTrendsFR(),
    fetchTikTokTrendsFR(),
  ]);

  const googleTrends =
    googleResult.status === 'fulfilled' ? googleResult.value : [];
  const tiktokHashtags =
    tiktokResult.status === 'fulfilled' ? tiktokResult.value : [];

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

  const uniqueKeywords = [...new Set(keywords)];

  const data: TrendingData = {
    googleTrends,
    tiktokHashtags,
    keywords: uniqueKeywords,
    fetchedAt: new Date().toISOString(),
  };

  // Mettre en cache mémoire
  cachedTrends = data;
  cacheTimestamp = now;

  console.log(
    `[Trends] Cached: ${googleTrends.length} Google topics, ${tiktokHashtags.length} TikTok hashtags, ${uniqueKeywords.length} keywords`
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
