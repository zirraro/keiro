import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getOpsSystemPrompt } from '@/lib/agents/ops-prompt';
import { saveLearning, saveAgentFeedback } from '@/lib/agents/learning';
import { callGemini } from '@/lib/agents/gemini';
import { loadContextWithAvatar } from '@/lib/agents/shared-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const FOUNDER_EMAILS = ['contact@keiroai.com'];

// Agents qui DOIVENT s'executer via des crons scheduler quotidiens.
// Absence de run reussi en 48h = probleme reel.
const SCHEDULED_AGENTS = [
  'ceo', 'commercial', 'email', 'marketing', 'content', 'seo',
  'dm_instagram', 'onboarding', 'retention',
];

// Agents qui ne tournent QUE lorsque certains clients les ont actives
// (Google Business connecte pour gmaps, WhatsApp branche, etc.) ou qui
// sont purement on-demand (chatbot, tiktok_comments). 0 runs = etat normal,
// on n'alerte que si TOTAL > 0 ET taux d'echec eleve.
const CONDITIONAL_AGENTS = [
  'gmaps', 'amit', 'dm_tiktok', 'chatbot', 'whatsapp', 'tiktok_comments',
];

const KNOWN_AGENTS = [...SCHEDULED_AGENTS, ...CONDITIONAL_AGENTS];

// ── Auth helper ──

async function verifyAuth(request: NextRequest): Promise<{ authorized: boolean; isCron?: boolean; isAdmin?: boolean }> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { authorized: true, isCron: true };
  }

  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return { authorized: false };

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profile?.is_admin) return { authorized: true, isAdmin: true };
  } catch {
    // auth failed
  }

  return { authorized: false };
}

// ── Types ──

interface AgentHealth {
  agent: string;
  status: 'healthy' | 'degraded' | 'down';
  last_success: string | null;
  total_runs_24h: number;
  error_count_24h: number;
  success_rate: number;
  reason?: string;
}

interface HealthReport {
  system_health: {
    status: 'healthy' | 'degraded' | 'critical';
    uptime_score: number;
    agents_checked: number;
    agents_healthy: number;
    agents_degraded: string[];
    agents_down: string[];
  };
  issues_detected: {
    agent: string;
    issue: string;
    severity: 'critical' | 'warning' | 'info';
    last_success: string | null;
    suggested_fix: string;
  }[];
  actions_taken: string[];
  recommendations: string[];
  checked_at: string;
}

// ── Health check logic ──

async function runHealthCheck(orgId: string | null = null): Promise<HealthReport> {
  const supabase = getSupabaseAdmin();
  const now = new Date();

  // Load shared context
  const { prompt: sharedPrompt } = await loadContextWithAvatar(supabase, 'ops', orgId || undefined);

  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 3600000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600000).toISOString();

  // Fetch all agent logs from the last 48h in a single query
  const { data: allLogs, error: logsError } = await supabase
    .from('agent_logs')
    .select('agent, action, status, created_at, data')
    .gte('created_at', fortyEightHoursAgo)
    .in('agent', KNOWN_AGENTS)
    .neq('action', 'learning')
    .neq('action', 'agent_feedback')
    .order('created_at', { ascending: false });

  if (logsError) {
    console.error('[OpsAgent] Error fetching agent_logs:', logsError.message);
  }

  const logs = allLogs || [];

  // Analyze each agent. Different rules for SCHEDULED vs CONDITIONAL.
  const agentHealthMap: AgentHealth[] = KNOWN_AGENTS.map((agentName) => {
    const isConditional = CONDITIONAL_AGENTS.includes(agentName);
    const agentLogs = logs.filter((l: any) => l.agent === agentName);
    const successStatuses = ['ok', 'success', 'active', 'confirmed'];

    // Last successful run (within 48h)
    const lastSuccess = agentLogs.find((l: any) => successStatuses.includes(l.status));
    const lastSuccessDate = lastSuccess?.created_at || null;

    // 24h metrics — ignore learning/feedback-style actions that don't represent
    // an actual agent "run" (they're side effects of other agents' successes).
    const runLike = (l: any) => !/^(learning|agent_feedback|webhook_|hot_prospect_click|heartbeat)/.test(l.action || '');
    const logs24h = agentLogs.filter((l: any) => l.created_at >= twentyFourHoursAgo).filter(runLike);
    const totalRuns24h = logs24h.length;
    const errorCount24h = logs24h.filter((l: any) => !successStatuses.includes(l.status)).length;
    const successRate = totalRuns24h > 0 ? ((totalRuns24h - errorCount24h) / totalRuns24h) * 100 : -1;

    // Classify
    let status: 'healthy' | 'degraded' | 'down';
    let reason: string | undefined;

    if (isConditional) {
      // Conditional agents: 0 runs = normal (client hasn't activated the feature,
      // or no events have triggered this agent in 48h). Only alert if the agent
      // HAS been running and is failing badly.
      if (totalRuns24h === 0) {
        // No activity — silent. Treat as healthy so it doesn't appear in the report.
        status = 'healthy';
      } else if (successRate >= 0 && successRate < 30) {
        status = 'down';
        reason = `Taux de succès critique sur agent optionnel: ${successRate.toFixed(0)}% (${errorCount24h}/${totalRuns24h})`;
      } else if (successRate >= 0 && successRate < 50) {
        status = 'degraded';
        reason = `Agent optionnel en difficulté: ${successRate.toFixed(0)}% de succès (${errorCount24h}/${totalRuns24h})`;
      } else {
        status = 'healthy';
      }
    } else {
      // Scheduled agents: must have at least one successful run in 48h AND a
      // reasonable success rate in 24h.
      if (!lastSuccessDate) {
        status = 'down';
        reason = 'Aucun run réussi dans les 48h (cron possiblement arrêté)';
      } else if (successRate >= 0 && successRate < 30) {
        status = 'down';
        reason = `Taux de succès critique: ${successRate.toFixed(0)}% (${errorCount24h}/${totalRuns24h} runs 24h)`;
      } else if (successRate >= 0 && successRate < 50) {
        // Threshold lowered from 70% — 50% is a more realistic cut since many
        // "errors" are expected permanent failures (disconnected account, etc.)
        status = 'degraded';
        reason = `Taux de succès dégradé: ${successRate.toFixed(0)}% (${errorCount24h}/${totalRuns24h} runs 24h)`;
      } else if (totalRuns24h === 0 && lastSuccessDate) {
        // Had success in 48h but nothing in last 24h — might be a once-daily
        // cron that ran yesterday. That's fine, not an alert.
        status = 'healthy';
      } else {
        status = 'healthy';
      }
    }

    return {
      agent: agentName,
      status,
      last_success: lastSuccessDate,
      total_runs_24h: totalRuns24h,
      error_count_24h: errorCount24h,
      success_rate: successRate >= 0 ? Math.round(successRate) : -1,
      reason,
    };
  });

  // Build report
  const healthyAgents = agentHealthMap.filter((a) => a.status === 'healthy');
  const degradedAgents = agentHealthMap.filter((a) => a.status === 'degraded');
  const downAgents = agentHealthMap.filter((a) => a.status === 'down');

  // Calculate uptime score (weighted: healthy=100, degraded=50, down=0)
  const uptimeScore = Math.round(
    ((healthyAgents.length * 100 + degradedAgents.length * 50) / KNOWN_AGENTS.length)
  );

  // Overall status
  let systemStatus: 'healthy' | 'degraded' | 'critical';
  if (downAgents.length >= 3 || uptimeScore < 40) {
    systemStatus = 'critical';
  } else if (downAgents.length > 0 || degradedAgents.length > 0) {
    systemStatus = 'degraded';
  } else {
    systemStatus = 'healthy';
  }

  // Build issues
  const issues: HealthReport['issues_detected'] = [];
  for (const agent of [...downAgents, ...degradedAgents]) {
    const severity = agent.status === 'down' ? 'critical' as const : 'warning' as const;
    let suggestedFix = '';

    if (!agent.last_success) {
      suggestedFix = 'Vérifier que le cron est configuré dans vercel.json et que la route répond correctement.';
    } else if (agent.total_runs_24h === 0) {
      suggestedFix = 'Le cron ne semble pas se déclencher. Vérifier vercel.json et les logs Vercel.';
    } else if (agent.success_rate >= 0 && agent.success_rate < 30) {
      suggestedFix = 'Taux d\'erreur très élevé. Vérifier les logs d\'erreur récents et les variables d\'environnement.';
    } else {
      suggestedFix = 'Analyser les logs d\'erreur récents pour identifier le pattern de failure.';
    }

    issues.push({
      agent: agent.agent,
      issue: agent.reason || 'Unknown issue',
      severity,
      last_success: agent.last_success,
      suggested_fix: suggestedFix,
    });
  }

  const actions: string[] = [];
  const recommendations: string[] = [];

  // If there are critical issues, use Gemini for diagnostic suggestions
  if (issues.some((i) => i.severity === 'critical')) {
    try {
      // Gather recent error logs for down agents
      const downAgentNames = downAgents.map((a) => a.agent);
      const { data: errorLogs } = await supabase
        .from('agent_logs')
        .select('agent, action, status, data, created_at')
        .in('agent', downAgentNames)
        .neq('status', 'ok')
        .neq('status', 'success')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(20);

      const errorSummary = (errorLogs || []).map((l: any) =>
        `[${l.agent}] ${l.action} — status: ${l.status} — ${l.data?.error || l.data?.message || 'no details'}`
      ).join('\n');

      if (errorSummary) {
        const diagnosticPrompt = `Analyse ces erreurs d'agents KeiroAI et donne 3-5 recommandations techniques courtes (1 ligne chacune).

Erreurs récentes:
${errorSummary}

Agents down: ${downAgentNames.join(', ')}

Réponds UNIQUEMENT avec une liste de recommandations, une par ligne, commençant par "- ".`;

        const diagnosticResponse = await callGemini({
          system: getOpsSystemPrompt() + '\n\n' + sharedPrompt,
          message: diagnosticPrompt,
          maxTokens: 500,
        });

        // Parse recommendations from Gemini response
        const geminiRecs = diagnosticResponse
          .split('\n')
          .filter((line: string) => line.trim().startsWith('-') || line.trim().startsWith('*'))
          .map((line: string) => line.replace(/^[\s\-\*]+/, '').trim())
          .filter((line: string) => line.length > 5);

        recommendations.push(...geminiRecs);
      }
    } catch (e: any) {
      console.error('[OpsAgent] Gemini diagnostic failed:', e.message);
      recommendations.push('Diagnostic Gemini indisponible — vérifier manuellement les agents down.');
    }
  }

  // Dedup: compare the set of problem agents to the previous ops report.
  // If the set hasn't changed, skip the alert email — but still save the new
  // report so timeline / supervision panels stay up to date. Prevents the
  // "same alert every morning" spam (previous behavior: always send).
  const currentProblemKey = [
    ...downAgents.map(a => `down:${a.agent}:${a.reason || ''}`),
    ...degradedAgents.map(a => `degr:${a.agent}:${a.reason || ''}`),
  ].sort().join('|');

  const { data: lastOpsLog } = await supabase
    .from('agent_logs')
    .select('data')
    .eq('agent', 'ops')
    .eq('action', 'health_check')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousKey: string | undefined = lastOpsLog?.data?.problem_key;
  const shouldSendAlert =
    (systemStatus === 'critical' || downAgents.length > 0) && currentProblemKey !== previousKey;

  // Send alert only when the issue set is NEW compared to the previous run.
  if (shouldSendAlert) {
    const alertSent = await sendCriticalAlert(systemStatus, downAgents, degradedAgents, issues);
    if (alertSent) {
      actions.push(`Alerte envoyée au fondateur (${downAgents.length} down, ${degradedAgents.length} degraded — changement détecté)`);
    }
  } else if (downAgents.length > 0 || degradedAgents.length > 0) {
    actions.push('Dedup: situation identique au rapport precedent — pas de nouvelle alerte email');
  }

  const report: HealthReport & { problem_key?: string } = {
    system_health: {
      status: systemStatus,
      uptime_score: uptimeScore,
      agents_checked: KNOWN_AGENTS.length,
      agents_healthy: healthyAgents.length,
      agents_degraded: degradedAgents.map((a) => `${a.agent} — ${a.reason || 'degraded'}`),
      agents_down: downAgents.map((a) => `${a.agent} — ${a.reason || 'down'}`),
    },
    issues_detected: issues,
    actions_taken: actions,
    recommendations,
    checked_at: now.toISOString(),
    problem_key: currentProblemKey,
  };

  // Save report to agent_logs (agent_logs_agent_check was extended to allow
  // 'ops' in migration 20260413_fix_agent_logs_constraints.sql). The previous
  // insert also passed `target: null`, but the column is named `target_id` —
  // that silently rejected every insert before the constraint fix.
  await supabase.from('agent_logs').insert({
    agent: 'ops',
    action: 'health_check',
    status: systemStatus === 'critical' ? 'error' : 'ok',
    data: report,
    created_at: now.toISOString(),
    ...(orgId ? { org_id: orgId } : {}),
  });

  // Save learning about system health trends
  if (issues.length > 0) {
    await saveLearning(supabase, {
      agent: 'ops',
      category: 'general',
      learning: `${downAgents.length} agents down, ${degradedAgents.length} degraded. Uptime score: ${uptimeScore}/100. Agents problématiques: ${[...downAgents, ...degradedAgents].map(a => a.agent).join(', ')}`,
      evidence: `Health check ${now.toISOString()} — ${issues.length} issues détectées`,
      confidence: issues.some(i => i.severity === 'critical') ? 30 : 15,
    }, orgId);
  }

  // Send feedback to degraded/down agents
  for (const agent of [...downAgents, ...degradedAgents]) {
    await saveAgentFeedback(supabase, {
      from_agent: 'ops',
      to_agent: agent.agent,
      feedback: `[OPS ALERT] ${agent.reason || 'Agent en difficulté'}. Dernière réussite: ${agent.last_success || 'aucune en 48h'}. Taux succès 24h: ${agent.success_rate >= 0 ? agent.success_rate + '%' : 'N/A'}.`,
      category: 'general',
    }, orgId);
  }

  return report;
}

// ── Alert email ──

async function sendCriticalAlert(
  systemStatus: string,
  downAgents: AgentHealth[],
  degradedAgents: AgentHealth[],
  issues: HealthReport['issues_detected'],
): Promise<boolean> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('[OpsAgent] No RESEND_API_KEY, cannot send alert');
    return false;
  }

  const statusEmoji = systemStatus === 'critical' ? 'CRITIQUE' : 'ALERTE';
  const dateStr = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });

  const downList = downAgents.map((a) =>
    `<li style="color:#dc2626;"><strong>${a.agent}</strong> — ${a.reason || 'down'}</li>`
  ).join('');

  const degradedList = degradedAgents.map((a) =>
    `<li style="color:#d97706;"><strong>${a.agent}</strong> — ${a.reason || 'degraded'}</li>`
  ).join('');

  const issuesList = issues.map((i) =>
    `<li><strong>[${i.severity.toUpperCase()}] ${i.agent}</strong>: ${i.issue}<br/><em>Fix suggéré: ${i.suggested_fix}</em></li>`
  ).join('');

  const emailHtml = `
<!DOCTYPE html>
<html>
<head><style>body{font-family:Arial,sans-serif;color:#333;line-height:1.6;}h2{color:#dc2626;}.container{max-width:640px;margin:0 auto;padding:20px;}li{margin:6px 0;}</style></head>
<body>
<div class="container">
  <h2>[${statusEmoji}] Ops Agent — Problemes detectes</h2>
  <p style="color:#6b7280;">${dateStr}</p>

  ${downAgents.length > 0 ? `<h3 style="color:#dc2626;">Agents DOWN (${downAgents.length})</h3><ul>${downList}</ul>` : ''}
  ${degradedAgents.length > 0 ? `<h3 style="color:#d97706;">Agents DEGRADES (${degradedAgents.length})</h3><ul>${degradedList}</ul>` : ''}

  <h3>Details des problemes</h3>
  <ul>${issuesList}</ul>

  <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;"/>
  <p style="color:#6b7280;font-size:12px;">Genere automatiquement par l'Agent Ops KeiroAI</p>
</div>
</body>
</html>`;

  // Ops report saved to agent_logs for admin supervision panel.
  // The dedup gate is done by the caller (runHealthCheck) — if this function
  // is called, it means the issue set has genuinely changed and we DO want
  // to send the email.
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('agent_logs').insert({
      agent: 'ops',
      action: 'health_check_report',
      status: downAgents.length > 0 ? 'error' : 'ok',
      data: { downAgents, degradedAgents, statusEmoji },
      created_at: new Date().toISOString(),
    });
    console.log(`[OpsAgent] Report saved to supervision (${downAgents.length} down, ${degradedAgents.length} degraded)`);
    if (downAgents.length >= 1 && RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'KeiroAI Ops Agent <contact@keiroai.com>',
          to: FOUNDER_EMAILS,
          subject: `[${statusEmoji}] ${downAgents.length} agent(s) down — Ops Report`,
          html: emailHtml,
        }),
      });
    }
    return true;
  } catch (e: any) {
    console.error('[OpsAgent] Ops report error:', e.message);
    return false;
  }
}

// ── GET handler ──

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get('org_id') || null;

  // If cron, run health check
  if (auth.isCron) {
    try {
      const report = await runHealthCheck(orgId);
      return NextResponse.json({ success: true, report });
    } catch (e: any) {
      console.error('[OpsAgent] Health check failed:', e.message);
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // If admin, return last ops report
  const supabase = getSupabaseAdmin();
  const { data: lastReport } = await supabase
    .from('agent_logs')
    .select('*')
    .eq('agent', 'ops')
    .eq('action', 'health_check')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!lastReport) {
    return NextResponse.json({ message: 'Aucun rapport ops disponible' });
  }

  return NextResponse.json({ report: lastReport.data, created_at: lastReport.created_at });
}

// ── POST handler ──

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine, defaults to health_check
  }

  const orgId = body?.org_id || null;
  const action = body.action || 'health_check';

  if (action === 'health_check') {
    try {
      const report = await runHealthCheck(orgId);
      return NextResponse.json({ success: true, report });
    } catch (e: any) {
      console.error('[OpsAgent] Health check failed:', e.message);
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
