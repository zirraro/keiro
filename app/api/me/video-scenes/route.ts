/**
 * POST /api/me/video-scenes
 *
 * Auto-detect the strongest visual moments in an uploaded video.
 * Returns the top N scenes with timestamps + thumbnail URLs so the
 * Studio UI can show "here are the 5 best hook candidates — pick one".
 *
 * Body:
 *   { videoUrl: string, threshold?: number, maxScenes?: number }
 *
 * Returns:
 *   { ok: true, scenes: [{ timestamp_sec, score, thumbnail_url, recommended_for }] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { detectScenes } from '@/lib/visuals/scene-detector';

export const runtime = 'nodejs';
export const maxDuration = 180;

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
  const threshold = typeof body.threshold === 'number' ? body.threshold : 0.25;
  const maxScenes = typeof body.maxScenes === 'number' ? Math.min(10, Math.max(3, body.maxScenes)) : 6;

  if (!videoUrl) {
    return NextResponse.json({ ok: false, error: 'videoUrl required' }, { status: 400 });
  }

  const baseId = `${userId?.slice(0, 8) || 'anon'}-${Date.now()}`;
  const scenes = await detectScenes(videoUrl, {
    threshold,
    maxScenes,
    withThumbnails: true,
    outputBaseId: baseId,
  });

  return NextResponse.json({ ok: true, scenes });
}
