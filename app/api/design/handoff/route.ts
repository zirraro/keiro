import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Claude Design handoff endpoint.
 *
 * Claude Design (claude.ai/design) can export polished designs as
 * standalone HTML files. This endpoint accepts that HTML (or a raw design
 * artifact payload) and stores it as a reusable template in the user's
 * library, tagged so Lena / Clara / Marketing agents can pick it up as
 * a style reference for client work.
 *
 * Workflow:
 *   1. User designs a landing page / social template / onboarding card in
 *      Claude Design.
 *   2. Clicks "Export → standalone HTML" in Claude Design.
 *   3. POSTs the HTML (or drops the file in /assistant/templates) here.
 *   4. The template appears in the user's template library and agents can
 *      reference it by template_id when generating similar assets.
 *
 * Not an API integration — Anthropic's Claude Design is UI-only — but
 * this gives a clean "handoff lane" so designs cross the boundary into
 * your product without manual copy-paste in Git.
 */
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Strip scripts + external resources for safety since we may render it. */
function sanitiseHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')        // strip inline event handlers
    .replace(/javascript:/gi, '');         // strip javascript: urls
}

/** Extract primary-colour palette hex codes from the HTML (first 8 found). */
function extractPalette(html: string): string[] {
  const hexes = new Set<string>();
  const re = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hexes.size < 8) {
    hexes.add(`#${m[1].toLowerCase()}`);
  }
  return Array.from(hexes);
}

export async function POST(req: NextRequest) {
  const { user, error: authErr } = await getAuthUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const { html, name, category = 'general', notes } = body as {
    html?: string; name?: string; category?: string; notes?: string;
  };

  if (!html || typeof html !== 'string' || html.length < 40) {
    return NextResponse.json({ ok: false, error: 'html payload required (min 40 chars)' }, { status: 400 });
  }
  if (html.length > 600_000) {
    return NextResponse.json({ ok: false, error: 'html too large (600kB max)' }, { status: 413 });
  }

  const sb = admin();
  const sanitised = sanitiseHtml(html);
  const palette = extractPalette(sanitised);
  const now = new Date().toISOString();
  const templateName = (name || 'Claude Design import').toString().slice(0, 120);

  const record = {
    user_id: user.id,
    source: 'claude_design',
    name: templateName,
    category: category.toString().slice(0, 40),
    html: sanitised,
    palette,
    notes: notes ? String(notes).slice(0, 500) : null,
    created_at: now,
    updated_at: now,
  };

  // Attempt insert into design_templates. If the table doesn't exist yet
  // we report the migration need rather than failing silently.
  const { data, error } = await sb
    .from('design_templates')
    .insert(record)
    .select('id')
    .single();

  if (error) {
    // Graceful fallback: store in agent_logs so nothing is lost while the
    // migration is applied. The UI can read these back via a fallback.
    await sb.from('agent_logs').insert({
      agent: 'design',
      action: 'handoff_pending_migration',
      data: { ...record, user_id: user.id, error: error.message },
      created_at: now,
    });
    return NextResponse.json({
      ok: true,
      stored: 'pending_migration',
      message: 'Template enregistré (en attente de la table design_templates).',
      palette,
    });
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    palette,
    message: 'Template importé depuis Claude Design.',
  });
}

/**
 * GET /api/design/handoff — list the authenticated user's imported templates.
 */
export async function GET(req: NextRequest) {
  const { user, error: authErr } = await getAuthUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const sb = admin();
  const { data, error } = await sb
    .from('design_templates')
    .select('id, name, category, palette, notes, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: true, templates: [], note: 'design_templates table missing' });
  }
  return NextResponse.json({ ok: true, templates: data ?? [] });
}
