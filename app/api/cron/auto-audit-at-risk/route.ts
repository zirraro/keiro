/**
 * Cron d'anticipation : audite automatiquement les clients en zone
 * AMBER (avant qu'ils basculent RED) et les clients jamais audités.
 *
 * Tourne 1×/jour à 06:00 UTC, avant la digest matin. Crée des audit
 * rows persistés avec trigger_kind='scheduled' que le superviseur
 * verra apparaître dans l'archive avec l'onglet dédié.
 *
 * Pas de spam : on n'audite pas un client × agent qui a déjà été
 * audité dans les 24h.
 *
 * Founder rule 2026-06-09 : "anticiper les pbm avant que ca arrive".
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runAgentAudit } from '@/lib/admin/agent-auditors';

export const runtime = 'nodejs';
export const maxDuration = 300;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function authOk(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const tok = auth.replace(/^Bearer\s+/i, '');
  return !!tok && tok === (process.env.CRON_SECRET || '');
}

const SUPERVISED_AGENTS = [
  'content', 'dm_instagram', 'email', 'commercial', 'reviews',
  'instagram_comments', 'gmaps', 'ceo', 'marketing', 'seo',
  'onboarding', 'retention', 'amit',
];

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const supabase = sb();
  const startedAt = Date.now();

  // 1. Liste des (agent, user_id) avec activité récente — à auditer en priorité.
  //    On regarde la table agent_logs, last 7 days, group by (agent, user_id).
  const { data: recentLogs } = await supabase
    .from('agent_logs')
    .select('agent, user_id, status, created_at')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
    .limit(10000);

  const pairs = new Map<string, { agent: string; user_id: string; runs: number; errors: number }>();
  for (const l of (recentLogs || []) as any[]) {
    if (!l.user_id || !SUPERVISED_AGENTS.includes(l.agent)) continue;
    const key = `${l.agent}::${l.user_id}`;
    const cur = pairs.get(key) || { agent: l.agent, user_id: l.user_id, runs: 0, errors: 0 };
    cur.runs += 1;
    if (l.status === 'error' || l.status === 'failed') cur.errors += 1;
    pairs.set(key, cur);
  }

  // 2. Pour chaque paire, vérifier qu'on n'a pas déjà audité dans les 24h.
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recentAudits } = await supabase
    .from('agent_audits')
    .select('agent, user_id, created_at')
    .gte('created_at', since24h);
  const recentlyAudited = new Set((recentAudits || []).map((a: any) => `${a.agent}::${a.user_id}`));

  // 3. Priorisation : on audite d'abord les paires avec des erreurs (plus à risque).
  const candidates = [...pairs.values()]
    .filter(p => !recentlyAudited.has(`${p.agent}::${p.user_id}`))
    .sort((a, b) => {
      // Tri : erreurs DESC puis runs DESC
      if (b.errors !== a.errors) return b.errors - a.errors;
      return b.runs - a.runs;
    })
    .slice(0, 30); // cap à 30 audits par run pour borner le coût

  let processed = 0;
  let red = 0, amber = 0, green = 0;
  const errors: string[] = [];

  for (const c of candidates) {
    try {
      const result = await runAgentAudit(supabase, c.agent, c.user_id);
      const status = result.severity === 'green' && result.findings.length === 0 ? 'auto_resolved' : 'open';
      await supabase.from('agent_audits').insert({
        agent: c.agent,
        user_id: c.user_id,
        scope: 'client',
        trigger_kind: 'scheduled',
        severity: result.severity,
        findings: result.findings,
        recommendations: result.recommendations,
        metrics: result.metrics,
        status,
      });
      processed++;
      if (result.severity === 'red') red++;
      else if (result.severity === 'amber') amber++;
      else green++;
    } catch (e: any) {
      errors.push(`${c.agent}::${c.user_id.substring(0, 8)} ${e?.message?.substring(0, 60)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    skipped_recently_audited: pairs.size - candidates.length,
    candidates_total: candidates.length,
    breakdown: { red, amber, green },
    errors_sample: errors.slice(0, 5),
    took_ms: Date.now() - startedAt,
  });
}
