/**
 * POST /api/me/video-hook/draft
 *
 * Lightweight companion to /api/me/video-hook that ONLY drafts the
 * hook text from a keyframe — no ffmpeg, no video output. Used by
 * the Studio auto-pipeline so we can show "Hook recommandé:" instantly
 * after scene detection completes, without waiting for the full
 * overlay render. The full render happens on the explicit "Generate
 * finale" click.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  let userId: string | null = null;
  if (!isCron) {
    const auth = await getAuthUser();
    if (!auth.user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    userId = auth.user.id;
  }

  const body = await req.json().catch(() => ({}));
  const keyframeUrl = String(body.keyframeUrl || '');
  const network = body.network as 'instagram' | 'tiktok' | 'linkedin';
  const style = body.style as string;
  if (!keyframeUrl || !network || !style) {
    return NextResponse.json({ ok: false, error: 'keyframeUrl, network, style required' }, { status: 400 });
  }

  // Pull business context for a better hook.
  let businessType: string | undefined;
  let businessSummary: string | undefined;
  if (userId) {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: dossier } = await sb
      .from('business_dossiers')
      .select('business_type, ai_summary, company_description')
      .eq('user_id', userId)
      .maybeSingle();
    businessType = dossier?.business_type || undefined;
    businessSummary = dossier?.ai_summary || dossier?.company_description || undefined;
  }

  try {
    const { draftHookText } = await import('@/lib/visuals/video-hook');
    const drafted = await draftHookText({
      keyframeUrl,
      network,
      style: style as any,
      businessType,
      businessSummary,
      language: 'fr',
    });
    if (!drafted || !drafted.primary) {
      return NextResponse.json({ ok: false, error: 'Could not draft a hook' }, { status: 422 });
    }
    return NextResponse.json({ ok: true, hook: drafted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'draft failed' }, { status: 500 });
  }
}
