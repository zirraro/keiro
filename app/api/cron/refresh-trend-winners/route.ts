import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractAndStoreWinners } from '@/lib/trends/winners-extractor';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET /api/cron/refresh-trend-winners
 *
 * Fires daily at 06:00 UTC. Extracts winning content patterns from the
 * latest TikTok / Insta / LinkedIn / Google trends and stores them
 * by sector in content_trend_winners. Lena uses these to anchor her
 * post generation on what actually works in 2026.
 *
 * Founder ask 2026-06-03: "analyser les images et vidéos qui fonctionnent
 * via scraping TikTok trend et Insta et LinkedIn et prendre le hook qui
 * fonctionne pour générer des contenus qui surperforment".
 *
 * Auth: CRON_SECRET only.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const result = await extractAndStoreWinners(supabase);
    await supabase.from('agent_logs').insert({
      agent: 'content',
      action: 'trend_winners_refreshed',
      status: 'ok',
      data: result,
      created_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[refresh-trend-winners] Failed:', e.message?.substring(0, 300));
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
