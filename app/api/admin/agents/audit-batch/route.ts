/**
 * Run audits in batch for all clients of a given agent that match
 * a risk filter. Useful when the supervisor wants to sweep the whole
 * client base in one click (e.g. before a Meta review, or after a
 * platform incident).
 *
 *   POST { agent, filter: 'all' | 'red' | 'amber' | 'never_audited' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { runAgentAudit } from '@/lib/admin/agent-auditors';

export const runtime = 'nodejs';
export const maxDuration = 300;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data: profile } = await supabase.from('profiles').select('is_admin, subscription_plan').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin && profile?.subscription_plan !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const agent: string = body.agent;
  const filter: 'all' | 'red' | 'amber' | 'never_audited' = body.filter || 'red';
  if (!agent) return NextResponse.json({ ok: false, error: 'agent requis' }, { status: 400 });

  // Reuse the control panel logic to identify clients.
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: logs7 } = await supabase
    .from('agent_logs')
    .select('user_id, status, created_at')
    .eq('agent', agent)
    .gte('created_at', since7d)
    .limit(5000);

  const stats = new Map<string, { runs: number; errors: number; lastRun: string | null }>();
  for (const l of (logs7 || []) as any[]) {
    if (!l.user_id) continue;
    const cur = stats.get(l.user_id) || { runs: 0, errors: 0, lastRun: null };
    cur.runs += 1;
    if (l.status === 'error' || l.status === 'failed') cur.errors += 1;
    if (!cur.lastRun || l.created_at > cur.lastRun) cur.lastRun = l.created_at;
    stats.set(l.user_id, cur);
  }

  const candidates = [...stats.entries()];

  // Apply filter
  let targets: string[] = [];
  if (filter === 'all') targets = candidates.map(([uid]) => uid);
  else if (filter === 'red') targets = candidates.filter(([, s]) => s.runs > 0 && s.errors / s.runs > 0.3).map(([uid]) => uid);
  else if (filter === 'amber') targets = candidates.filter(([, s]) => s.runs > 0 && s.errors / s.runs > 0.1 && s.errors / s.runs <= 0.3).map(([uid]) => uid);
  else if (filter === 'never_audited') {
    const { data: prev } = await supabase.from('agent_audits').select('user_id').eq('agent', agent);
    const audited = new Set((prev || []).map((p: any) => p.user_id));
    targets = candidates.filter(([uid]) => !audited.has(uid)).map(([uid]) => uid);
  }

  targets = targets.slice(0, 40); // hard cap pour éviter timeout

  let processed = 0;
  let red = 0, amber = 0, green = 0;
  for (const uid of targets) {
    try {
      const result = await runAgentAudit(supabase, agent, uid);
      await supabase.from('agent_audits').insert({
        agent,
        user_id: uid,
        scope: 'client',
        triggered_by: user.id,
        trigger_kind: 'batch_manual',
        severity: result.severity,
        findings: result.findings,
        recommendations: result.recommendations,
        metrics: result.metrics,
        status: result.severity === 'green' && result.findings.length === 0 ? 'auto_resolved' : 'open',
      });
      processed++;
      if (result.severity === 'red') red++;
      else if (result.severity === 'amber') amber++;
      else green++;
    } catch { /* swallow per-client errors */ }
  }

  return NextResponse.json({ ok: true, processed, targets_total: targets.length, breakdown: { red, amber, green } });
}
