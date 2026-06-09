/**
 * Resolve a single audit. Two paths :
 *   1. status='mutualised' + knowledge_id  → résolution mutualisée
 *      (la fix devient une row agent_knowledge applicable aux clients
 *      du même business_type ou globale).
 *   2. status='resolved' (manual_fix) / status='auto_resolved' /
 *      status='archived' (no_action_needed)
 *
 * POST { kind, note?, knowledge?: { summary, content, business_type, category } }
 *
 * Le knowledge_id est posé sur la row agent_audits pour qu'on puisse
 * remonter à la fix mutualisée depuis l'archive plus tard.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function assertAdmin() {
  const { user, error } = await getAuthUser();
  if (error || !user) return { ok: false as const, status: 401, msg: 'Non autorisé' };
  const supabase = sb();
  const { data: profile } = await supabase.from('profiles').select('is_admin, subscription_plan').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin && profile?.subscription_plan !== 'admin') {
    return { ok: false as const, status: 403, msg: 'Admin only' };
  }
  return { ok: true as const, user, supabase };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await assertAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.msg }, { status: auth.status });

  const { id } = await ctx.params;
  let body: any = {};
  try { body = await req.json(); } catch {}

  const kind: string = body.kind;
  const note: string | undefined = body.note;
  const knowledge = body.knowledge;

  if (!['mutualise_to_knowledge', 'manual_fix', 'auto_fix', 'no_action'].includes(kind)) {
    return NextResponse.json({ ok: false, error: 'kind invalide' }, { status: 400 });
  }

  let knowledgeId: string | null = null;

  // 1. If mutualising → write to agent_knowledge first
  if (kind === 'mutualise_to_knowledge' && knowledge?.summary) {
    const { data: audit } = await auth.supabase
      .from('agent_audits')
      .select('agent, user_id')
      .eq('id', id)
      .maybeSingle();
    if (!audit) return NextResponse.json({ ok: false, error: 'audit introuvable' }, { status: 404 });

    const { data: knowRow, error: knowErr } = await auth.supabase
      .from('agent_knowledge')
      .insert({
        agent: audit.agent,
        business_type: knowledge.business_type || 'global',
        category: knowledge.category || 'error_pattern',
        summary: knowledge.summary,
        content: knowledge.content || '',
        confidence: 0.9,
        source: 'supervision_audit',
        created_by: auth.user.id,
      })
      .select('id')
      .single();
    if (knowErr) {
      return NextResponse.json({ ok: false, error: `knowledge write failed: ${knowErr.message}` }, { status: 500 });
    }
    knowledgeId = knowRow?.id || null;
  }

  // 2. Mark audit as resolved
  const newStatus =
    kind === 'mutualise_to_knowledge' ? 'mutualised' :
    kind === 'auto_fix' ? 'auto_resolved' :
    kind === 'no_action' ? 'archived' :
    'resolved';

  const { data: updated, error: updErr } = await auth.supabase
    .from('agent_audits')
    .update({
      status: newStatus,
      resolution_kind: kind,
      resolution_note: note || null,
      resolved_by: auth.user.id,
      resolved_at: new Date().toISOString(),
      knowledge_id: knowledgeId,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (updErr) {
    return NextResponse.json({ ok: false, error: `update failed: ${updErr.message}` }, { status: 500 });
  }

  // 3. If auto_fix → trigger the agent run immediately (one of the canonical auto-fixes)
  if (kind === 'auto_fix' && updated?.user_id) {
    try {
      const url = `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/admin/agents/control/${updated.agent}`;
      if (url.startsWith('http')) {
        // Fire and forget — don't block the response
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
          body: JSON.stringify({ action: 'trigger', user_id: updated.user_id }),
        }).catch(() => {});
      }
    } catch { /* swallow */ }
  }

  return NextResponse.json({ ok: true, audit: updated, knowledge_id: knowledgeId });
}
