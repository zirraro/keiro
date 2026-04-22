import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * GET /api/design/template/[id]
 *   → JSON payload with the template record (for the UI)
 *
 * GET /api/design/template/[id]?format=html
 *   → raw HTML response (used by <iframe srcDoc> previews)
 *
 * Auth: owner only (design_templates.user_id must match the caller).
 */
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { data } = await admin()
    .from('design_templates')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const format = req.nextUrl.searchParams.get('format');
  if (format === 'html') {
    // Wrap the HTML snippet in a minimal document so it renders alone.
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#fff;color:#111}</style></head><body>${data.html}</body></html>`;
    return new Response(doc, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src https:;",
      },
    });
  }

  return NextResponse.json({ ok: true, template: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const { error: delErr } = await admin()
    .from('design_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
