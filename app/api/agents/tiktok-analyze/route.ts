import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { scrapeTiktok } from '@/lib/agents/prospect-scraper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/agents/tiktok-analyze
 *
 * Three use-cases (founder ask 2026-06-04 "parite tiktok avec insta") :
 *   1. INSPIRATION : le client veut analyser un compte TikTok pour
 *      s'inspirer (ex: concurrent qui marche).
 *   2. PROSPECT : Jade veut analyser un prospect avant DM exemple.
 *   3. FOLLOW SUGGESTION : on retourne un score de pertinence pour
 *      aider le client à décider de follow un compte.
 *
 * Body : { handle: string, intent?: 'inspiration' | 'prospect' | 'follow' }
 * Auth  : client connecté ou cron secret.
 */
export async function POST(req: NextRequest) {
  // Auth: either a CRON secret or a logged-in user (client side)
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isCron = !!cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isCron) {
    const { user } = await getAuthUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const handle = String(body.handle || '').replace(/^@/, '').trim();
  const intent = (body.intent || 'inspiration') as 'inspiration' | 'prospect' | 'follow';
  if (!handle) return NextResponse.json({ ok: false, error: 'handle required' }, { status: 400 });

  const notes = await scrapeTiktok(handle);
  if (!notes) {
    return NextResponse.json({
      ok: false,
      error: 'TikTok profile unreachable or empty — possibly blocked or handle invalid',
      handle,
    }, { status: 404 });
  }

  // Compute a simple follow-suggestion score from signals harvested.
  // Higher = more interesting to follow / engage with.
  let followScore = 0;
  if (notes.follower_count) {
    if (notes.follower_count > 100_000) followScore += 30;
    else if (notes.follower_count > 10_000) followScore += 20;
    else if (notes.follower_count > 1_000) followScore += 10;
  }
  if (notes.posts_recent && notes.posts_recent >= 3) followScore += 20;
  if (notes.insta_bio && notes.insta_bio.length > 30) followScore += 10;
  if (notes.signals && notes.signals.length > 2) followScore += 20;

  const verdict = intent === 'follow'
    ? followScore >= 40 ? 'HIGH_VALUE_FOLLOW' : followScore >= 20 ? 'WORTH_FOLLOW' : 'SKIP'
    : intent === 'prospect'
      ? notes.follower_count && notes.follower_count > 500 ? 'WARM_PROSPECT' : 'COLD_PROSPECT'
      : 'INSPIRATION_READY';

  return NextResponse.json({
    ok: true,
    handle,
    intent,
    verdict,
    follow_score: followScore,
    notes,
  });
}
