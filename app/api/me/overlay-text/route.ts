import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/me/overlay-text
 * Body: {
 *   postId: string,
 *   text?: string,                                  // null/empty = remove overlay
 *   position?: 'top' | 'bottom' | 'center',
 *   tone?: 'punchy' | 'elegant' | 'playful'
 * }
 *
 * Re-composites the text overlay on the post's ORIGINAL visual (not
 * the current one — otherwise we'd stack overlays on every edit) and
 * updates content_calendar.visual_url + overlay_text.
 *
 * When text is empty, restores original_visual_url and clears overlay_text.
 */
export async function POST(req: NextRequest) {
  // Cron / admin secret bypass — lets us apply or strip overlays from
  // server-side scripts (test triggers, admin overrides, batch fixes).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  let user: { id: string } | null = null;
  if (!isCron) {
    const auth = await getAuthUser();
    if (!auth.user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    user = auth.user;
  }

  const body = await req.json().catch(() => ({}));
  const postId = String(body.postId || '');
  if (!postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: post } = await sb
    .from('content_calendar')
    .select('id, user_id, visual_url, overlay_text')
    .eq('id', postId)
    .maybeSingle();
  if (!post) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });
  if (!isCron && post.user_id && user && post.user_id !== user.id) {
    // Allow admin too
    const { data: profile } = await sb.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const cur = (post.overlay_text || {}) as any;
  const baseUrl = cur.original_visual_url || post.visual_url;
  const text = String(body.text ?? '').trim();

  // Empty text → strip overlay, revert to original visual
  if (!text) {
    if (cur.original_visual_url) {
      await sb.from('content_calendar').update({
        visual_url: cur.original_visual_url,
        overlay_text: null,
        updated_at: new Date().toISOString(),
      }).eq('id', postId);
    }
    return NextResponse.json({ ok: true, removed: true });
  }

  const validPositions = ['top', 'bottom', 'center', 'top-left', 'bottom-right', 'left-strip', 'right-strip'];
  const validStyles = ['white-shadow', 'dark-on-light', 'light-on-dark', 'accent-bar', 'outline-only'];
  const position = validPositions.includes(body.position) ? body.position : (validPositions.includes(cur.position) ? cur.position : 'bottom');
  const tone = ['punchy', 'elegant', 'playful'].includes(body.tone) ? body.tone : (cur.tone || 'punchy');
  const style = validStyles.includes(body.style) ? body.style : (validStyles.includes(cur.style) ? cur.style : 'white-shadow');
  const accentColor = typeof body.accentColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.accentColor)
    ? body.accentColor
    : (typeof cur.accentColor === 'string' ? cur.accentColor : undefined);

  const { applyTextOverlay } = await import('@/lib/visuals/text-overlay');
  const newUrl = await applyTextOverlay(baseUrl, { needsText: true, text, position, tone, style, ...(accentColor ? { accentColor } : {}) }, postId);
  if (!newUrl) return NextResponse.json({ ok: false, error: 'Composite failed' }, { status: 500 });

  await sb.from('content_calendar').update({
    visual_url: newUrl,
    overlay_text: { text, position, tone, style, accentColor: accentColor || null, original_visual_url: baseUrl },
    updated_at: new Date().toISOString(),
  }).eq('id', postId);

  return NextResponse.json({ ok: true, visual_url: newUrl });
}
