import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { generateBrandTemplatesForUser } from '@/lib/design/auto-generator';

export const runtime = 'nodejs';
export const maxDuration = 180;

/**
 * POST /api/design/auto-generate
 *
 * Triggers brand-template generation from the authenticated user's
 * uploads (logo, photos, brand guide PDF/Excel) + dossier profile.
 * Creates a fresh set of HTML templates in design_templates tagged
 * source='auto_generated'. Previous auto-generated set for this user
 * is replaced — manual Claude Design imports are left alone.
 *
 * This is the "Claude Design as a service" flow: the client doesn't go
 * to claude.ai/design — KeiroAI produces the brand assets directly from
 * what they've uploaded.
 */
export async function POST(_req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await generateBrandTemplatesForUser(user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[design/auto-generate] failure:', err?.message);
    return NextResponse.json({ ok: false, error: err?.message || 'generation_failed' }, { status: 500 });
  }
}
