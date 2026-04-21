import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { analyzeImageForAgent } from '@/lib/agents/visual-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET  /api/agents/uploads?agent_id=content
 *   → Returns the list of uploads + analyses for the authenticated user.
 *
 * POST /api/agents/uploads
 *   Body: { agent_id, file_url, file_type, file_name?, caption? }
 *   Uploads a file URL (already hosted — e.g. Supabase Storage), kicks
 *   off Claude Vision analysis in the same request, stores the result.
 *
 * DELETE /api/agents/uploads?id=X
 *   Removes one upload (owner only).
 *
 * Why this is load-bearing: the analyses are fed into content generation
 * prompts as "VISUAL REFERENCES" so Jade's posts/scripts stay grounded
 * in the client's actual decor, products, palette — zero generic copy.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agentId = req.nextUrl.searchParams.get('agent_id');
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('agent_uploads')
    .select('id, agent_id, file_url, file_type, file_name, caption, ai_analysis, analyzed_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (agentId) query = query.eq('agent_id', agentId);

  const { data } = await query;
  const current = (data || []).length;
  return NextResponse.json({
    ok: true,
    uploads: data || [],
    limit: MAX_UPLOADS_PER_AGENT,
    current,
    remaining: Math.max(0, MAX_UPLOADS_PER_AGENT - current),
  });
}

// Per-agent upload caps. We want enough samples for the analyzer to
// produce a stable palette / style signal without letting a client dump
// 500 photos that slow generation and bloat the prompt context.
const MAX_UPLOADS_PER_AGENT = 20;

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { agent_id, file_url, file_type, file_name, caption } = body || {};
  if (!agent_id || !file_url || !file_type) {
    return NextResponse.json({ error: 'agent_id, file_url, file_type requis' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Cap check — reject cleanly with a client-readable message so the UI
  // can show "Tu as atteint la limite — supprime d'anciens uploads".
  const { count: existing } = await supabase
    .from('agent_uploads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('agent_id', agent_id);
  if ((existing || 0) >= MAX_UPLOADS_PER_AGENT) {
    return NextResponse.json({
      error: `Limite atteinte (${MAX_UPLOADS_PER_AGENT} uploads max pour cet agent). Supprime d'anciens uploads avant d'en ajouter.`,
      limit: MAX_UPLOADS_PER_AGENT,
      current: existing,
    }, { status: 400 });
  }

  // Look up business_type to hint the analyzer.
  const { data: dossier } = await supabase
    .from('business_dossiers')
    .select('business_type')
    .eq('user_id', user.id)
    .maybeSingle();

  // Insert first so the row exists even if analysis fails — analysis
  // can be retried async. We want to keep the upload visible either way.
  const { data: row, error: insertError } = await supabase
    .from('agent_uploads')
    .insert({
      user_id: user.id,
      agent_id,
      file_url,
      file_type,
      file_name: file_name || null,
      caption: caption || null,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Fire-and-analyze for images. Videos could be handled later via
  // frame extraction + per-frame analysis; skipping for MVP.
  if (file_type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file_url)) {
    try {
      const analysis = await analyzeImageForAgent(file_url, agent_id, dossier?.business_type || null);
      if (analysis) {
        await supabase
          .from('agent_uploads')
          .update({ ai_analysis: analysis, analyzed_at: new Date().toISOString() })
          .eq('id', row.id);
        return NextResponse.json({ ok: true, upload: { ...row, ai_analysis: analysis, analyzed_at: new Date().toISOString() } });
      }
    } catch (e: any) {
      console.error('[agent-uploads] Analysis failed:', String(e?.message || e).substring(0, 200));
    }
  }

  return NextResponse.json({ ok: true, upload: row });
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  await supabase.from('agent_uploads').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
