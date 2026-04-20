/**
 * CEO Group — Aggregates reports from ALL client CEO entities
 *
 * Architecture:
 *   CEO Entity (per client) → executes, fixes params, reports
 *   CEO Group (admin) → aggregates ALL reports → recommends code changes
 *
 * Every CEO entity report enriches the shared knowledge pool.
 * Problems solved by one client benefit ALL clients.
 *
 * Reports to: contact@keiroai.com (3x/day)
 * Content: code recommendations, bug patterns, optimization opportunities
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { saveKnowledge } from './knowledge-rag';

interface ClientReport {
  client_id: string;
  client_name: string;
  agent: string;
  action: string;
  status: string;
  error?: string;
  solution?: string;
  duration_ms?: number;
}

/**
 * Aggregate all CEO entity reports from the last period.
 * Called by the CEO group cron (3x/day).
 */
export async function aggregateCeoReports(
  supabase: SupabaseClient,
  periodHours: number = 8,
): Promise<{
  totalReports: number;
  successRate: number;
  failures: ClientReport[];
  patterns: Array<{ pattern: string; count: number; agents: string[] }>;
  codeRecommendations: string[];
}> {
  const since = new Date(Date.now() - periodHours * 60 * 60 * 1000).toISOString();

  // 1. Collect ALL execution reports from ALL clients
  const { data: allLogs } = await supabase
    .from('agent_logs')
    .select('agent, action, status, data, created_at, org_id')
    .in('action', ['execution_success', 'execution_failure', 'auto_fix_config', 'client_bug_notification', 'setting_updated'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);

  if (!allLogs || allLogs.length === 0) {
    return { totalReports: 0, successRate: 100, failures: [], patterns: [], codeRecommendations: [] };
  }

  const successes = allLogs.filter(l => l.status === 'ok' || l.action === 'execution_success');
  const failures = allLogs.filter(l => l.status === 'error' || l.action === 'execution_failure');
  const successRate = allLogs.length > 0 ? Math.round((successes.length / allLogs.length) * 100) : 100;

  // 2. Detect patterns (same error across multiple clients/agents)
  const errorMap: Record<string, { count: number; agents: Set<string>; orgs: Set<string> }> = {};
  for (const f of failures) {
    const errorKey = (f.data?.error || f.data?.action || 'unknown').substring(0, 100);
    if (!errorMap[errorKey]) errorMap[errorKey] = { count: 0, agents: new Set(), orgs: new Set() };
    errorMap[errorKey].count++;
    errorMap[errorKey].agents.add(f.agent);
    if (f.org_id) errorMap[errorKey].orgs.add(f.org_id);
  }

  const patterns = Object.entries(errorMap)
    .filter(([, v]) => v.count >= 2) // Pattern = same error 2+ times
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      agents: Array.from(data.agents),
    }));

  // 3. Generate code recommendations based on patterns
  const codeRecommendations: string[] = [];

  for (const p of patterns) {
    if (p.pattern.includes('timeout') || p.pattern.includes('FUNCTION_INVOCATION_TIMEOUT')) {
      codeRecommendations.push(`[TIMEOUT] Agent ${p.agents.join(', ')} timeout ${p.count}x — Decomposer en sous-taches ou reduire le batch size`);
    }
    if (p.pattern.includes('rate') || p.pattern.includes('quota') || p.pattern.includes('limit')) {
      codeRecommendations.push(`[QUOTA] Agent ${p.agents.join(', ')} depasse quota ${p.count}x — Implementer un rate limiter ou augmenter le plan API`);
    }
    if (p.pattern.includes('token') || p.pattern.includes('auth') || p.pattern.includes('401')) {
      codeRecommendations.push(`[AUTH] Agent ${p.agents.join(', ')} erreur auth ${p.count}x — Verifier/renouveler les tokens API`);
    }
    if (p.pattern.includes('parse') || p.pattern.includes('JSON') || p.pattern.includes('undefined')) {
      codeRecommendations.push(`[CODE] Agent ${p.agents.join(', ')} erreur parsing ${p.count}x — Ajouter validation/fallback dans le code`);
    }
    if (p.pattern.includes('network') || p.pattern.includes('fetch') || p.pattern.includes('ECONNREFUSED')) {
      codeRecommendations.push(`[NETWORK] Agent ${p.agents.join(', ')} erreur reseau ${p.count}x — Ajouter retry avec exponential backoff`);
    }
  }

  // Generic recommendations based on overall health
  if (successRate < 90) {
    codeRecommendations.push(`[HEALTH] Taux de succes ${successRate}% < 90% — Investigation prioritaire sur les agents defaillants`);
  }
  if (failures.length > 20) {
    codeRecommendations.push(`[VOLUME] ${failures.length} echecs en ${periodHours}h — Verifier les crons et la stabilite de l infrastructure`);
  }

  // 4. Enrich the shared knowledge pool with solutions found
  const autoFixes = allLogs.filter(l => l.action === 'auto_fix_config');
  for (const fix of autoFixes) {
    await saveKnowledge(supabase, {
      content: `AUTO-FIX APPLIED: ${fix.data?.key} changed from ${fix.data?.old_value} to ${fix.data?.new_value}. Reason: ${fix.data?.reason}. Agent: ${fix.agent}.`,
      summary: `Auto-fix ${fix.data?.key}: ${fix.data?.old_value}→${fix.data?.new_value}`,
      agent: fix.agent,
      category: 'learning',
      source: 'ceo_group_aggregation',
      confidence: 0.7,
    }).catch(() => {});
  }

  // Save execution patterns to RAG
  for (const p of patterns) {
    await saveKnowledge(supabase, {
      content: `PATTERN DETECTED: "${p.pattern}" occurred ${p.count}x across agents ${p.agents.join(', ')}. ${codeRecommendations.find(r => r.includes(p.agents[0])) || 'Investigation needed.'}`,
      summary: `Pattern: ${p.pattern.substring(0, 50)} (${p.count}x)`,
      agent: undefined,
      category: 'learning',
      source: 'ceo_group_pattern',
      confidence: 0.6,
    }).catch(() => {});
  }

  return {
    totalReports: allLogs.length,
    successRate,
    failures: failures.slice(0, 20).map(f => ({
      client_id: f.org_id || 'default',
      client_name: f.org_id || 'KeiroAI',
      agent: f.agent,
      action: f.data?.action || f.action,
      status: f.status,
      error: f.data?.error?.substring(0, 200),
      solution: f.data?.solution,
      duration_ms: f.data?.duration,
    })),
    patterns,
    codeRecommendations,
  };
}

/**
 * Send the CEO Group report to admin.
 * Contains: aggregated data, patterns, code recommendations.
 */
export async function sendCeoGroupReport(
  supabase: SupabaseClient,
): Promise<void> {
  const report = await aggregateCeoReports(supabase);
  const now = new Date();
  const period = now.getUTCHours() < 12 ? 'matin' : now.getUTCHours() < 18 ? 'apres-midi' : 'soir';

  // Send via Brevo (the same provider we use for every other email). The
  // previous code gated on RESEND_API_KEY which was never configured on
  // the VPS, so this report was silently skipped since the migration.
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_KEY) return;

  const patternsHtml = report.patterns.length > 0
    ? report.patterns.map(p => `<li><strong>${p.pattern.substring(0, 80)}</strong> — ${p.count}x (agents: ${p.agents.join(', ')})</li>`).join('')
    : '<li>Aucun pattern detecte</li>';

  const recoHtml = report.codeRecommendations.length > 0
    ? report.codeRecommendations.map(r => `<li>${r}</li>`).join('')
    : '<li>Aucune recommandation — tout fonctionne bien</li>';

  const failuresHtml = report.failures.slice(0, 10).map(f =>
    `<tr><td style="padding:4px 8px;font-size:12px;">${f.agent}</td><td style="padding:4px 8px;font-size:12px;">${f.action}</td><td style="padding:4px 8px;font-size:12px;color:#ef4444;">${f.error?.substring(0, 80) || 'N/A'}</td></tr>`
  ).join('');

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': BREVO_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Noah CEO Group', email: 'contact@keiroai.com' },
      to: [{ email: 'contact@keiroai.com' }],
      subject: `${report.codeRecommendations.length > 0 ? '\uD83D\uDEE0' : '\u2705'} CEO Group — Reco code ${period} (${report.successRate}% succes, ${report.codeRecommendations.length} reco)`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);color:white;padding:20px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;">\uD83D\uDEE0 CEO Group — Recommandations Code</h2>
          <p style="margin:4px 0 0;color:#a5b4fc;font-size:13px;">${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — Rapport ${period}</p>
        </div>
        <div style="background:white;padding:20px;border:1px solid #e5e7eb;">
          <div style="display:flex;gap:16px;margin-bottom:16px;">
            <div style="flex:1;background:#f0fdf4;padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:20px;font-weight:bold;color:#22c55e;">${report.successRate}%</div>
              <div style="font-size:10px;color:#888;">Succes</div>
            </div>
            <div style="flex:1;background:${report.failures.length > 0 ? '#fef2f2' : '#f0fdf4'};padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:20px;font-weight:bold;color:${report.failures.length > 0 ? '#ef4444' : '#22c55e'}">${report.failures.length}</div>
              <div style="font-size:10px;color:#888;">Echecs</div>
            </div>
            <div style="flex:1;background:#eef2ff;padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:20px;font-weight:bold;color:#6366f1;">${report.patterns.length}</div>
              <div style="font-size:10px;color:#888;">Patterns</div>
            </div>
            <div style="flex:1;background:#faf5ff;padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:20px;font-weight:bold;color:#a855f7;">${report.codeRecommendations.length}</div>
              <div style="font-size:10px;color:#888;">Reco code</div>
            </div>
          </div>

          ${report.codeRecommendations.length > 0 ? `<h3 style="color:#1e1b4b;">\uD83D\uDEE0 Recommandations Code</h3>
          <ul style="font-size:13px;color:#374151;background:#faf5ff;padding:16px 16px 16px 32px;border-radius:8px;border-left:3px solid #a855f7;">
            ${recoHtml}
          </ul>` : '<p style="color:#22c55e;font-weight:bold;">Aucune recommandation code — tout fonctionne.</p>'}

          <h3 style="color:#1e1b4b;">Patterns detectes</h3>
          <ul style="font-size:12px;color:#666;">${patternsHtml}</ul>

          ${report.failures.length > 0 ? `<h3 style="color:#1e1b4b;">Echecs recents</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Agent</th><th style="padding:6px 8px;text-align:left;">Action</th><th style="padding:6px 8px;text-align:left;">Erreur</th></tr>
            ${failuresHtml}
          </table>` : ''}

          <p style="color:#9ca3af;font-size:11px;margin-top:16px;">Ce rapport agrege les donnees de TOUS les CEO entites (clients). Les patterns et solutions sont partages dans le pool de connaissances pour ameliorer tous les agents.</p>
        </div>
        <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:11px;border-radius:0 0 12px 12px;">Noah CEO Group — KeiroAI Admin</div>
      </div>`,
    }),
  }).catch(() => {});

  // Log the report
  await supabase.from('agent_logs').insert({
    agent: 'ceo',
    action: 'ceo_group_report',
    status: 'ok',
    data: {
      period,
      total_reports: report.totalReports,
      success_rate: report.successRate,
      failures_count: report.failures.length,
      patterns_count: report.patterns.length,
      recommendations_count: report.codeRecommendations.length,
      recommendations: report.codeRecommendations,
    },
    created_at: now.toISOString(),
  });
}
