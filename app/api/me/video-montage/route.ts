import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/me/video-montage
 * Body: {
 *   uploadIds: string[],         // 2-6 agent_uploads ids (videos and/or images)
 *   transition?: 'cut' | 'crossfade' | 'fade',
 *   format?: 'portrait' | 'square' | 'landscape',
 *   durations?: number[]         // optional per-clip durations in seconds
 * }
 *
 * Builds a montage from the chosen uploads and returns the public URL.
 * Caller decides what to do with it (preview, attach to a post, etc.).
 */
export async function POST(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const uploadIds: string[] = Array.isArray(body.uploadIds) ? body.uploadIds : [];
  if (uploadIds.length < 2) {
    return NextResponse.json({ ok: false, error: 'At least 2 uploadIds required' }, { status: 400 });
  }
  if (uploadIds.length > 6) {
    return NextResponse.json({ ok: false, error: 'Max 6 uploadIds' }, { status: 400 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: uploads } = await sb
    .from('agent_uploads')
    .select('id, file_url, file_type, ai_analysis')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .in('id', uploadIds);

  if (!uploads || uploads.length < 2) {
    return NextResponse.json({ ok: false, error: 'Uploads not found or not yours' }, { status: 404 });
  }

  // Preserve client-specified order
  const ordered = uploadIds
    .map(id => uploads.find((u: any) => u.id === id))
    .filter(Boolean) as any[];

  const inputs = ordered.map((u: any, i: number) => {
    const ft = (u.file_type || '').toLowerCase();
    const url = u.file_url as string;
    const type: 'video' | 'image' = ft.startsWith('video/') ? 'video' : 'image';
    return {
      url,
      type,
      durationSec: Array.isArray(body.durations) ? Number(body.durations[i]) || undefined : undefined,
    };
  });

  const { buildMontage } = await import('@/lib/visuals/video-montage');
  const result = await buildMontage({
    inputs,
    transition: body.transition || 'crossfade',
    format: body.format || 'portrait',
    outputName: `montage-${user.id.substring(0, 8)}-${Date.now()}.mp4`,
  }, `${user.id.substring(0, 8)}`);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || 'montage failed' }, { status: 500 });
  }

  // Log usage so the cost dashboard can include it
  try {
    await sb.from('agent_logs').insert({
      agent: 'content',
      action: 'video_montage_built',
      user_id: user.id,
      data: { upload_ids: uploadIds, transition: body.transition || 'crossfade', format: body.format || 'portrait', duration_sec: result.durationSec, url: result.url },
    });
  } catch {}

  return NextResponse.json({ ok: true, url: result.url, duration_sec: result.durationSec });
}
