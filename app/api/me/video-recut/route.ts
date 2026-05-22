/**
 * POST /api/me/video-recut
 *
 * Re-cut an uploaded video into a tight 12-25 s reel by selecting the
 * strongest moments and concatenating them in a strategy-driven order.
 *
 * Body:
 *   {
 *     videoUrl: string,
 *     strategy?: 'best_of_3' | 'hook_escalation_payoff' | 'preserve_order',
 *     targetDurationSec?: number,
 *     segmentDurationSec?: number,
 *   }
 *
 * Returns: { ok, output_url, segments_used, strategy, duration_sec }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { recutVideo } from '@/lib/visuals/video-recut';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  let userId: string | null = null;
  if (!isCron) {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    userId = user.id;
  }

  const body = await req.json().catch(() => ({}));
  const videoUrl = String(body.videoUrl || '');
  const strategy = ['best_of_3', 'hook_escalation_payoff', 'preserve_order'].includes(body.strategy)
    ? body.strategy
    : 'hook_escalation_payoff';
  const targetDuration = typeof body.targetDurationSec === 'number'
    ? Math.min(60, Math.max(6, body.targetDurationSec))
    : 15;
  const segmentDuration = typeof body.segmentDurationSec === 'number'
    ? Math.min(8, Math.max(1, body.segmentDurationSec))
    : 2.5;

  if (!videoUrl) {
    return NextResponse.json({ ok: false, error: 'videoUrl required' }, { status: 400 });
  }

  const baseId = `${userId?.slice(0, 8) || 'anon'}-${Date.now()}`;
  const result = await recutVideo(videoUrl, {
    strategy,
    targetDurationSec: targetDuration,
    segmentDurationSec: segmentDuration,
    outputBaseId: baseId,
  });

  if (!result.outputUrl) {
    return NextResponse.json({ ok: false, error: 'Recut failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    output_url: result.outputUrl,
    segments_used: result.segmentsUsed,
    strategy: result.strategy,
    duration_sec: result.durationSec,
  });
}
