/**
 * Admin supervision audit endpoint — run on-demand or list past audits.
 *
 *   POST { agent, user_id }      → runs the audit, persists, returns
 *   GET  ?agent=&user_id=&limit= → returns archive (newest first)
 *
 * Only admin users (profiles.is_admin OR subscription_plan='admin').
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { runAgentAudit } from '@/lib/admin/agent-auditors';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

export async function POST(req: NextRequest) {
  const auth = await assertAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.msg }, { status: auth.status });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const agent: string = String(body.agent || '').trim();
  const userId: string = String(body.user_id || '').trim();
  const triggerKind: string = body.trigger_kind || 'manual';

  if (!agent || !userId) {
    return NextResponse.json({ ok: false, error: 'agent + user_id requis' }, { status: 400 });
  }

  // Run the actual audit (per-agent deep checks + generic).
  const result = await runAgentAudit(auth.supabase, agent, userId);

  // Persist for the supervision archive.
  const { data: row, error: insertErr } = await auth.supabase
    .from('agent_audits')
    .insert({
      agent,
      user_id: userId,
      scope: 'client',
      triggered_by: auth.user.id,
      trigger_kind: triggerKind,
      severity: result.severity,
      findings: result.findings,
      recommendations: result.recommendations,
      metrics: result.metrics,
      status: result.severity === 'green' && result.findings.length === 0 ? 'auto_resolved' : 'open',
    })
    .select('*')
    .single();

  if (insertErr) {
    return NextResponse.json({ ok: false, error: `persist failed: ${insertErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, audit: row });
}

export async function GET(req: NextRequest) {
  const auth = await assertAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.msg }, { status: auth.status });

  const url = new URL(req.url);
  const agent = url.searchParams.get('agent') || undefined;
  const userId = url.searchParams.get('user_id') || undefined;
  const status = url.searchParams.get('status') || undefined;
  const severity = url.searchParams.get('severity') || undefined;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);

  let q = auth.supabase
    .from('agent_audits')
    .select('id, agent, user_id, scope, severity, findings, recommendations, metrics, status, resolution_kind, resolution_note, resolved_at, knowledge_id, trigger_kind, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (agent) q = q.eq('agent', agent);
  if (userId) q = q.eq('user_id', userId);
  if (status) q = q.eq('status', status);
  if (severity) q = q.eq('severity', severity);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Enrich with client email so the UI can show "client X" without an extra round-trip.
  const userIds = [...new Set((data || []).map((a: any) => a.user_id).filter(Boolean))];
  let emailMap: Record<string, { email: string; business_type: string | null }> = {};
  if (userIds.length > 0) {
    const { data: profs } = await auth.supabase
      .from('profiles')
      .select('id, email, business_type')
      .in('id', userIds);
    emailMap = Object.fromEntries((profs || []).map((p: any) => [p.id, { email: p.email, business_type: p.business_type }]));
  }

  const enriched = (data || []).map((a: any) => ({
    ...a,
    client_email: a.user_id ? emailMap[a.user_id]?.email || null : null,
    client_business_type: a.user_id ? emailMap[a.user_id]?.business_type || null : null,
  }));

  return NextResponse.json({ ok: true, audits: enriched, count: enriched.length });
}
