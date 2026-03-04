import { NextRequest, NextResponse } from 'next/server';
import { fetchAllTrends } from '@/lib/trends';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/trends - Tendances du jour (Google Trends + TikTok)
 * GET /api/trends?history=week|month|year - Historique des tendances
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const history = searchParams.get('history');

  // Si demande d'historique → lire depuis Supabase
  if (history) {
    return getHistoricalTrends(history);
  }

  // Sinon → tendances du jour (avec cache)
  try {
    const data = await fetchAllTrends();

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error: any) {
    console.error('[API/trends] Error:', error.message);
    return NextResponse.json(
      {
        ok: false,
        error: 'Erreur lors de la récupération des tendances',
        data: {
          googleTrends: [],
          tiktokHashtags: [],
          keywords: [],
          fetchedAt: new Date().toISOString(),
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Récupère l'historique des tendances depuis Supabase.
 * Agrège par keyword avec fréquence d'apparition.
 */
async function getHistoricalTrends(period: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ ok: false, error: 'Supabase non configuré' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Calculer la date de début selon la période
  const now = new Date();
  let startDate: string;
  switch (period) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().split('T')[0];
      break;
    case 'year':
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0];
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }

  const { data: trends, error } = await supabase
    .from('daily_trends')
    .select('keyword, source, traffic, video_count, trend_direction, trend_date')
    .gte('trend_date', startDate)
    .order('trend_date', { ascending: false });

  if (error) {
    console.error('[API/trends/history] Error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Agréger : compter combien de jours chaque keyword apparaît
  const keywordStats: Record<string, {
    keyword: string;
    source: string;
    appearances: number;
    dates: string[];
    lastTraffic?: string;
    lastVideoCount?: number;
  }> = {};

  for (const row of (trends || [])) {
    const key = `${row.source}:${row.keyword}`;
    if (!keywordStats[key]) {
      keywordStats[key] = {
        keyword: row.keyword,
        source: row.source,
        appearances: 0,
        dates: [],
        lastTraffic: row.traffic,
        lastVideoCount: row.video_count,
      };
    }
    keywordStats[key].appearances++;
    keywordStats[key].dates.push(row.trend_date);
  }

  // Trier par fréquence d'apparition (les plus récurrentes = les plus fortes tendances)
  const sorted = Object.values(keywordStats).sort((a, b) => b.appearances - a.appearances);

  return NextResponse.json({
    ok: true,
    period,
    startDate,
    totalDays: Math.ceil((now.getTime() - new Date(startDate).getTime()) / 86400000),
    trends: sorted.slice(0, 100),
    google: sorted.filter(t => t.source === 'google_trends').slice(0, 50),
    tiktok: sorted.filter(t => t.source === 'tiktok').slice(0, 50),
  });
}
