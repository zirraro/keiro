import { NextRequest, NextResponse } from 'next/server';
import { fetchAllTrends } from '@/lib/trends';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Cron endpoint : rafraîchit les tendances Google Trends + TikTok.
 * Appelé automatiquement par Vercel Cron à 6h et 20h (heure de Paris).
 * Les données sont persistées en BDD (table daily_trends) pour historique long terme.
 */
export async function GET(request: NextRequest) {
  // Vérifier le secret pour sécuriser l'endpoint cron
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Cron/refresh-trends] Starting scheduled trend refresh...');

    // Forcer le refresh en invalidant le cache
    const data = await fetchAllTrends(true); // force = true

    console.log(
      `[Cron/refresh-trends] Done: ${data.googleTrends.length} Google, ${data.tiktokHashtags.length} TikTok, ${data.keywords.length} keywords`
    );

    return NextResponse.json({
      ok: true,
      message: 'Tendances rafraîchies et persistées en BDD',
      stats: {
        googleTrends: data.googleTrends.length,
        tiktokHashtags: data.tiktokHashtags.length,
        keywords: data.keywords.length,
        fetchedAt: data.fetchedAt,
      },
    });
  } catch (error: any) {
    console.error('[Cron/refresh-trends] Error:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
