import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 180;

/**
 * POST /api/me/video-hook
 * Body: {
 *   sourceVideoUrl: string,        // public URL of the source video
 *   network: 'instagram'|'tiktok'|'linkedin',
 *   style: 'three_word_punch'|'pov_opener'|'stat_carton'|'clean_cut_intro',
 *   keyframeUrl?: string,           // optional — if not provided we pull from agent_uploads
 *   hookOverride?: { primary: string; secondary?: string },
 * }
 *
 * Returns: { ok, output_url, hook }
 *
 * Phase 1 of Studio video editor: takes an uploaded source video,
 * asks Sonnet to draft a network-aware opening hook from a keyframe,
 * burns the hook into the front of the video via ffmpeg, returns
 * the result URL.
 */
export async function POST(req: NextRequest) {
  // Auth — accept both user cookies and cron secret (for admin testing).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  let userId: string | null = null;
  if (!isCron) {
    const auth = await getAuthUser();
    if (!auth.user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    userId = auth.user.id;
  } else {
    userId = req.nextUrl.searchParams.get('user_id');
  }

  const body = await req.json().catch(() => ({}));
  const sourceVideoUrl = String(body.sourceVideoUrl || '');
  const network = body.network as 'instagram' | 'tiktok' | 'linkedin';
  const style = body.style as 'three_word_punch' | 'pov_opener' | 'stat_carton' | 'clean_cut_intro';
  const keyframeUrl = body.keyframeUrl ? String(body.keyframeUrl) : undefined;
  const hookOverride: { primary: string; secondary?: string } | undefined = body.hookOverride && typeof body.hookOverride.primary === 'string'
    ? {
        primary: String(body.hookOverride.primary).slice(0, 80),
        ...(body.hookOverride.secondary ? { secondary: String(body.hookOverride.secondary).slice(0, 60) } : {}),
      }
    : undefined;

  if (!sourceVideoUrl) return NextResponse.json({ ok: false, error: 'sourceVideoUrl required' }, { status: 400 });
  if (!['instagram', 'tiktok', 'linkedin'].includes(network)) return NextResponse.json({ ok: false, error: 'invalid network' }, { status: 400 });
  if (!['three_word_punch', 'pov_opener', 'stat_carton', 'clean_cut_intro'].includes(style)) return NextResponse.json({ ok: false, error: 'invalid style' }, { status: 400 });

  // Pull business context for the Sonnet hook drafter.
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  let businessType: string | undefined;
  let businessSummary: string | undefined;
  if (userId) {
    const { data: dossier } = await sb
      .from('business_dossiers')
      .select('business_type, ai_summary, company_description')
      .eq('user_id', userId)
      .maybeSingle();
    businessType = dossier?.business_type || undefined;
    businessSummary = dossier?.ai_summary || dossier?.company_description || undefined;
  }

  try {
    const { draftHookText, applyVideoHook } = await import('@/lib/visuals/video-hook');

    // Either Sonnet drafts the hook, or the caller provides an override.
    let hook: { primary: string; secondary?: string } | undefined = hookOverride;
    if (!hook) {
      if (!keyframeUrl) {
        return NextResponse.json({ ok: false, error: 'keyframeUrl required when no hookOverride provided' }, { status: 400 });
      }
      const drafted = await draftHookText({
        keyframeUrl,
        network,
        style,
        businessType,
        businessSummary,
        language: 'fr',
      });
      if (drafted) hook = drafted;
    }
    if (!hook || !hook.primary) {
      return NextResponse.json({ ok: false, error: 'Could not produce a hook' }, { status: 422 });
    }

    const outputBaseId = `${userId?.slice(0, 8) || 'anon'}-${Date.now()}`;
    const outputUrl = await applyVideoHook({
      sourceVideoUrl,
      hook,
      style,
      network,
      outputBaseId,
    });
    if (!outputUrl) {
      return NextResponse.json({ ok: false, error: 'Hook overlay failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, output_url: outputUrl, hook });
  } catch (e: any) {
    console.error('[video-hook] error:', e?.message);
    return NextResponse.json({ ok: false, error: e?.message || 'failed' }, { status: 500 });
  }
}
