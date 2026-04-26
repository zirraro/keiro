import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/me/overlay-text/suggest
 * Body: { postId: string, tone?: 'punchy'|'elegant'|'playful' }
 *
 * Lets the client click "✨ Suggestion IA" in the draft modal to get a
 * pre-filled punchline based on hook + caption + visual_description +
 * business dossier. This is the same Sonnet decider Léna uses upstream
 * — exposed here so the user can manually summon a suggestion when
 * editing an existing post.
 *
 * Returns the suggestion BUT DOES NOT compose. The user reviews the
 * text in the textarea, tweaks it, then hits "Apply" which goes to
 * /api/me/overlay-text. This keeps the user in control.
 */
export async function POST(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const postId = String(body.postId || '');
  if (!postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
  const requestedTone = ['punchy', 'elegant', 'playful'].includes(body.tone) ? body.tone : undefined;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: post } = await sb
    .from('content_calendar')
    .select('id, user_id, hook, caption, visual_description, pillar, format')
    .eq('id', postId)
    .maybeSingle();
  if (!post) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });
  if (post.user_id && post.user_id !== user.id) {
    const { data: profile } = await sb.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  let businessType: string | undefined;
  let businessSummary: string | undefined;
  let signatureOffer: string | undefined;
  if (post.user_id) {
    const { data: dossier } = await sb
      .from('business_dossiers')
      .select('business_type, summary, signature_offer')
      .eq('user_id', post.user_id)
      .maybeSingle();
    if (dossier) {
      businessType = dossier.business_type || undefined;
      businessSummary = dossier.summary || undefined;
      signatureOffer = dossier.signature_offer || undefined;
    }
  }

  try {
    const { decideTextOverlay } = await import('@/lib/visuals/text-overlay');
    const decision = await decideTextOverlay({
      hook: post.hook || '',
      caption: post.caption || '',
      visualDescription: post.visual_description || '',
      businessType,
      businessSummary,
      signatureOffer,
      pillar: post.pillar || undefined,
      format: post.format || undefined,
      language: 'fr',
    });
    if (!decision.needsText) {
      return NextResponse.json({ ok: true, suggestion: null, reason: 'Léna juge que cette image est plus forte sans texte. Tu peux quand même écrire le tien.' });
    }
    return NextResponse.json({
      ok: true,
      suggestion: {
        text: decision.text,
        position: decision.position,
        tone: requestedTone || decision.tone,
      },
    });
  } catch (e: any) {
    console.error('[overlay-text/suggest] failed:', e?.message);
    return NextResponse.json({ ok: false, error: e?.message || 'Suggest failed' }, { status: 500 });
  }
}
