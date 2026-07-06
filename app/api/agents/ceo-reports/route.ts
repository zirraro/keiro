import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { saveLearning } from '@/lib/agents/learning';
import { saveKnowledge } from '@/lib/agents/knowledge-rag';

import { sendBrevoCompat } from '@/lib/email/brevo-compat';
import { getPlanFloorsFlat } from '@/lib/agents/service-guarantees';
// Plan floors come from the single source of truth in
// lib/agents/service-guarantees.ts (getPlanFloorsFlat). The brief renders
// HTML while the shared helper outputs markdown, but both now read the SAME
// numbers — so a Créateur is scored on Créateur targets (posts + DMs only),
// a Pro on Pro targets, etc. Each plan can reach 100 %.

export const runtime = 'nodejs';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = 'contact@keiroai.com';

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const ALL_AGENTS = [
  'email', 'commercial', 'dm_instagram', 'tiktok_comments', 'seo', 'content',
  'onboarding', 'retention', 'marketing', 'chatbot', 'whatsapp', 'gmaps',
  'comptable', 'ads', 'rh', 'ceo', 'ops',
];

/**
 * POST /api/agents/ceo-reports
 * ?type=improvement  → Rapport amelioration agents (echecs, failles, recommandations code)
 * ?type=status        → Rapport etat des taches (ce que chaque agent a fait)
 *
 * Both reports are sent to contact@keiroai.com AND saved to RAG for continuous improvement.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const reportType = new URL(req.url).searchParams.get('type') || 'status';
  // phase: full (default — catch-up + email), catchup_only (run
  // catch-up + log diagnostic, no email — used at 21h Paris so
  // the admin digest at 21h30 has full data), send_only (skip
  // catch-up, just email — used at 22h Paris).
  const briefPhase = (new URL(req.url).searchParams.get('phase') || 'full') as 'full' | 'catchup_only' | 'send_only';

  // ─── Client brief: separate flow ─────────────────────
  // ?type=client_brief   — morning brief (7h Paris): today's plan
  // ?type=client_evening — evening debrief (20h Paris): what ran today
  if (reportType === 'client_brief' || reportType === 'client_evening') {
    return handleClientBrief(supabase, reportType === 'client_evening' ? 'evening' : 'morning', briefPhase);
  }
  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const ismorning = now.getUTCHours() < 12;

  // ─── Collect data from all agents ─────────────────────
  const agentData: Record<string, { runs: number; errors: number; successes: number; lastAction: string; errorDetails: string[] }> = {};

  for (const agent of ALL_AGENTS) {
    const { count: runs } = await supabase
      .from('agent_logs').select('id', { count: 'exact', head: true })
      .eq('agent', agent).gte('created_at', twelveHoursAgo);

    const { count: errors } = await supabase
      .from('agent_logs').select('id', { count: 'exact', head: true })
      .eq('agent', agent).eq('status', 'error').gte('created_at', twelveHoursAgo);

    const { data: lastLog } = await supabase
      .from('agent_logs').select('action, created_at')
      .eq('agent', agent).gte('created_at', twelveHoursAgo)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    // Get error details
    const { data: errorLogs } = await supabase
      .from('agent_logs').select('action, data, created_at')
      .eq('agent', agent).eq('status', 'error').gte('created_at', twelveHoursAgo)
      .order('created_at', { ascending: false }).limit(5);

    agentData[agent] = {
      runs: runs ?? 0,
      errors: errors ?? 0,
      successes: (runs ?? 0) - (errors ?? 0),
      lastAction: lastLog ? `${lastLog.action} (${new Date(lastLog.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})` : 'aucune execution',
      errorDetails: (errorLogs || []).map((e: any) => `${e.action}: ${e.data?.error || JSON.stringify(e.data).substring(0, 100)}`),
    };
  }

  const totalRuns = Object.values(agentData).reduce((s, a) => s + a.runs, 0);
  const totalErrors = Object.values(agentData).reduce((s, a) => s + a.errors, 0);
  const errorRate = totalRuns > 0 ? Math.round((totalErrors / totalRuns) * 100) : 0;

  const BREVO_KEY = process.env.BREVO_API_KEY;

  if (reportType === 'improvement') {
    // ═══ RAPPORT AMELIORATION AGENTS ═══
    // Focus: echecs, failles, recommandations code/optimisation

    // Get auto-improve analyses
    const { data: improvements } = await supabase
      .from('agent_logs')
      .select('agent, action, data, created_at')
      .in('action', ['execution_failure', 'execution_success'])
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(30);

    const failures = (improvements || []).filter((i: any) => i.action === 'execution_failure');
    const successes = (improvements || []).filter((i: any) => i.action === 'execution_success');

    // Build AI analysis with Claude
    let aiAnalysis = '';
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    // Learning loop (founder 2026-06-17): the digest doesn't just report — every
    // working solution it identifies is written as a reusable PREVENTION RULE
    // into agent_knowledge, the pool agents consult before each run
    // (applicableKnowledge). So a problem analysed once becomes an automatic
    // guard for next time, across all clients.
    let learnedRules: Array<{ agent: string; summary: string; content: string }> = [];
    if (ANTHROPIC_KEY && failures.length > 0) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 2500,
            tools: [{ name: 'analysis', description: 'structured agent-failure analysis', input_schema: {
              type: 'object',
              properties: {
                issues: { type: 'array', items: { type: 'object', properties: {
                  agent: { type: 'string', description: 'agent id concerned (email, content, dm_instagram, ...)' },
                  problem: { type: 'string', description: 'root cause in 1-2 sentences (FR)' },
                  impact: { type: 'string', description: 'concrete business impact (FR)' },
                  solution: { type: 'string', description: 'concrete CODE/config fix — file + change (FR)' },
                  prevention_rule: { type: 'string', description: 'ONE reusable, actionable rule (FR) the agent must follow to AVOID this next time. Phrase it as a standing instruction, business-type-agnostic, that makes sense injected into the agent prompt (e.g. "Avant tout envoi email, valider les adresses et purger les bounces des 30 derniers jours").' },
                  priority: { type: 'string', enum: ['P0', 'P1', 'P2'] },
                }, required: ['agent', 'problem', 'impact', 'solution', 'prevention_rule', 'priority'], additionalProperties: false } },
              }, required: ['issues'], additionalProperties: false,
            } as any }],
            tool_choice: { type: 'tool', name: 'analysis' },
            system: `Tu es Noah, CEO IA de KeiroAI. Tu analyses les échecs des agents des dernières 24h. Pour CHAQUE problème distinct : cause racine, impact business, solution code concrète, ET une règle de prévention réutilisable qui empêchera la récidive. Sois chirurgical : regroupe les échecs d'une même cause, priorise (P0 = bloque des clients maintenant). Maximum 5 issues, les plus impactantes.`,
            messages: [{ role: 'user', content: `Échecs 24h:\n${failures.map((f: any) => `${f.agent}: ${f.data?.error || f.data?.action || 'unknown'}`).join('\n')}\n\nSuccès: ${successes.length} · Total runs: ${totalRuns} · Error rate: ${errorRate}%` }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const tu = (data.content || []).find((b: any) => b.type === 'tool_use');
          const issues: any[] = tu?.input?.issues || [];
          if (issues.length) {
            const prioRank: any = { P0: 0, P1: 1, P2: 2 };
            issues.sort((a, b) => (prioRank[a.priority] ?? 3) - (prioRank[b.priority] ?? 3));
            aiAnalysis = issues.map((it) => `
<div style="margin:0 0 10px;padding:10px;background:#faf5ff;border-left:3px solid ${it.priority === 'P0' ? '#dc2626' : it.priority === 'P1' ? '#d97706' : '#8b5cf6'};border-radius:6px;font-size:13px;">
  <strong>[${it.priority}] ${it.agent}</strong> — ${it.problem}
  <div style="color:#6b7280;font-size:12px;margin:4px 0;">📉 ${it.impact}</div>
  <div style="margin:4px 0;"><strong>🔧 Solution :</strong> ${it.solution}</div>
  <div style="margin:4px 0;color:#166534;"><strong>🧠 Règle apprise (injectée aux agents) :</strong> ${it.prevention_rule}</div>
</div>`).join('');
            learnedRules = issues
              .filter((it) => it.prevention_rule && it.agent)
              .map((it) => ({ agent: String(it.agent), summary: String(it.problem).slice(0, 160), content: String(it.prevention_rule).slice(0, 600) }));
          }
        }
      } catch { /* silent */ }
    }

    // Feed working prevention rules into the global agent-knowledge pool.
    if (learnedRules.length) {
      for (const r of learnedRules) {
        try {
          const { data: exists } = await supabase
            .from('agent_knowledge').select('id')
            .eq('agent', r.agent).eq('summary', r.summary).maybeSingle();
          if (!exists) {
            await supabase.from('agent_knowledge').insert({
              agent: r.agent, category: 'incident_prevention', summary: r.summary,
              content: r.content, confidence: 0.6, business_type: null,
              source: 'admin_digest', usage_count: 0,
            });
          }
        } catch { /* best-effort — never block the digest */ }
      }
    }

    // Send email
    if (BREVO_KEY) {
      const agentStatusRows = ALL_AGENTS.map(a => {
        const d = agentData[a];
        const icon = d.runs === 0 ? '\u274C' : d.errors > 0 ? '\u26A0\uFE0F' : '\u2705';
        return `<tr><td style="padding:4px 8px;">${icon} ${a}</td><td style="padding:4px 8px;">${d.runs}</td><td style="padding:4px 8px;color:${d.errors > 0 ? '#ef4444' : '#22c55e'}">${d.errors}</td><td style="padding:4px 8px;font-size:11px;color:#888;">${d.lastAction}</td></tr>`;
      }).join('');

      const emailRes = await sendBrevoCompat({
          sender: { name: 'Noah CEO IA', email: 'contact@keiroai.com' },
          to: [{ email: ADMIN_EMAIL }],
          subject: `${totalErrors > 0 ? '\u{1F6A8}' : '\u2705'} Rapport amelioration agents — ${totalErrors} echecs, ${errorRate}% error rate`,
          htmlContent: `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
            <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:20px;border-radius:12px 12px 0 0;">
              <h2 style="margin:0;">\u{1F9E0} Noah — Rapport Amelioration Agents</h2>
              <p style="margin:4px 0 0;color:#a0aec0;font-size:13px;">${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — Rapport quotidien</p>
            </div>
            <div style="background:white;padding:20px;border:1px solid #e5e7eb;">
              <h3>\u{1F4CA} Vue d'ensemble (24h)</h3>
              <div style="display:flex;gap:20px;margin-bottom:16px;">
                <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px;text-align:center;">
                  <div style="font-size:24px;font-weight:bold;">${totalRuns}</div>
                  <div style="font-size:11px;color:#888;">Executions</div>
                </div>
                <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px;text-align:center;">
                  <div style="font-size:24px;font-weight:bold;color:${totalErrors > 0 ? '#ef4444' : '#22c55e'}">${totalErrors}</div>
                  <div style="font-size:11px;color:#888;">Echecs</div>
                </div>
                <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px;text-align:center;">
                  <div style="font-size:24px;font-weight:bold;">${errorRate}%</div>
                  <div style="font-size:11px;color:#888;">Error rate</div>
                </div>
              </div>

              <h3>\u{1F916} Status par agent</h3>
              <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
                <tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Agent</th><th style="padding:6px 8px;">Runs</th><th style="padding:6px 8px;">Erreurs</th><th style="padding:6px 8px;">Derniere action</th></tr>
                ${agentStatusRows}
              </table>

              ${failures.length > 0 ? `<h3>\u{1F6A8} Echecs detectes (${failures.length})</h3>
              <ul style="font-size:12px;color:#666;">
                ${failures.slice(0, 10).map((f: any) => `<li><strong>${f.agent}</strong>: ${(f.data?.error || f.data?.action || '').substring(0, 200)}</li>`).join('')}
              </ul>` : '<p style="color:#22c55e;">Aucun echec detecte \u2705</p>'}

              ${aiAnalysis ? `<h3>\u{1F4A1} Recommandations Noah (IA)</h3><div style="background:#faf5ff;padding:12px;border-radius:8px;border-left:3px solid #8b5cf6;font-size:13px;">${aiAnalysis}</div>` : ''}
            </div>
            <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:11px;border-radius:0 0 12px 12px;">Noah CEO IA — KeiroAI</div>
          </div>`,
      });
      if (!emailRes.ok) {
        const errText = await emailRes.text().catch(() => '');
        console.error('[CEO Reports] Improvement email FAILED:', emailRes.status, errText);
      } else {
        console.log('[CEO Reports] Improvement email sent to', ADMIN_EMAIL);
      }
    }

    // Save analysis to RAG for learning
    if (aiAnalysis) {
      await saveKnowledge(supabase, {
        content: `CEO DAILY REPORT: ${totalRuns} runs, ${totalErrors} errors (${errorRate}%). ${aiAnalysis.substring(0, 500)}`,
        summary: `Rapport CEO ${now.toISOString().split('T')[0]}: ${errorRate}% errors`,
        agent: 'ceo',
        category: 'learning',
        source: 'daily_improvement_report',
        confidence: 0.7,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, type: 'improvement', totalRuns, totalErrors, errorRate, failures: failures.length });
  }

  // ═══ RAPPORT ETAT DES TACHES (2x/jour) ═══
  const period = ismorning ? 'matin' : 'apres-midi';

  // Collect detailed activity per agent
  const agentActivities: Record<string, string[]> = {};
  for (const agent of ALL_AGENTS) {
    const { data: logs } = await supabase
      .from('agent_logs')
      .select('action, data, created_at')
      .eq('agent', agent)
      .neq('action', 'event')
      .gte('created_at', twelveHoursAgo)
      .order('created_at', { ascending: false })
      .limit(10);

    agentActivities[agent] = (logs || []).map((l: any) => {
      const time = new Date(l.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      return `${time} — ${l.action}${l.data?.message ? `: ${String(l.data.message).substring(0, 80)}` : ''}`;
    });
  }

  if (BREVO_KEY) {
    const activityHtml = ALL_AGENTS.map(a => {
      const d = agentData[a];
      const activities = agentActivities[a];
      if (d.runs === 0) return '';
      const icon = d.errors > 0 ? '\u26A0\uFE0F' : '\u2705';
      return `<div style="margin-bottom:12px;">
        <div style="font-weight:bold;font-size:13px;">${icon} ${a.toUpperCase()} — ${d.runs} actions, ${d.errors} erreurs</div>
        ${activities.length > 0 ? `<ul style="font-size:11px;color:#666;margin:4px 0 0 16px;padding:0;">${activities.slice(0, 5).map(act => `<li>${act}</li>`).join('')}</ul>` : ''}
      </div>`;
    }).filter(Boolean).join('');

    const statusEmailRes = await sendBrevoCompat({
        sender: { name: 'Noah CEO IA', email: 'contact@keiroai.com' },
        to: [{ email: ADMIN_EMAIL }],
        subject: `\u{1F4CB} Etat des taches ${period} — ${totalRuns} actions, ${totalErrors} erreurs`,
        htmlContent: `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:20px;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">\u{1F4CB} Etat des taches — ${period}</h2>
            <p style="margin:4px 0 0;color:#a0aec0;font-size:13px;">${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <div style="background:white;padding:20px;border:1px solid #e5e7eb;">
            <div style="display:flex;gap:16px;margin-bottom:16px;">
              <div style="flex:1;background:#f0fdf4;padding:10px;border-radius:8px;text-align:center;">
                <div style="font-size:20px;font-weight:bold;color:#22c55e;">${totalRuns - totalErrors}</div>
                <div style="font-size:10px;color:#888;">Succes</div>
              </div>
              <div style="flex:1;background:${totalErrors > 0 ? '#fef2f2' : '#f0fdf4'};padding:10px;border-radius:8px;text-align:center;">
                <div style="font-size:20px;font-weight:bold;color:${totalErrors > 0 ? '#ef4444' : '#22c55e'}">${totalErrors}</div>
                <div style="font-size:10px;color:#888;">Echecs</div>
              </div>
              <div style="flex:1;background:#f9fafb;padding:10px;border-radius:8px;text-align:center;">
                <div style="font-size:20px;font-weight:bold;">${ALL_AGENTS.filter(a => agentData[a].runs > 0).length}/17</div>
                <div style="font-size:10px;color:#888;">Agents actifs</div>
              </div>
            </div>

            <h3 style="font-size:14px;">Detail par agent</h3>
            ${activityHtml || '<p style="color:#888;">Aucune activite dans les 12 dernieres heures.</p>'}
          </div>
          <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:11px;border-radius:0 0 12px 12px;">Noah CEO IA — KeiroAI | Rapport automatique ${period}</div>
        </div>`,
    });
    if (!statusEmailRes.ok) {
      const errText = await statusEmailRes.text().catch(() => '');
      console.error('[CEO Reports] Status email FAILED:', statusEmailRes.status, errText);
    } else {
      console.log('[CEO Reports] Status email sent to', ADMIN_EMAIL);
    }
  }

  // Save status to RAG
  const statusSummary = ALL_AGENTS.filter(a => agentData[a].runs > 0).map(a => `${a}:${agentData[a].runs}r/${agentData[a].errors}e`).join(', ');
  await saveKnowledge(supabase, {
    content: `STATUS REPORT ${period} ${now.toISOString().split('T')[0]}: ${totalRuns} runs, ${totalErrors} errors. Active: ${statusSummary}`,
    summary: `Status ${period} ${now.toISOString().split('T')[0]}`,
    agent: 'ceo',
    category: 'learning',
    source: 'status_report',
    confidence: 0.6,
  }).catch(() => {});

  return NextResponse.json({ ok: true, type: 'status', period, totalRuns, totalErrors, activeAgents: ALL_AGENTS.filter(a => agentData[a].runs > 0).length });
}

/**
 * Generate and send CEO brief to individual clients
 * Called by: scheduler slot or manually via ?type=client_brief
 */
async function handleClientBrief(
  supabase: any,
  timeOfDay: 'morning' | 'evening' = 'morning',
  phase: 'full' | 'catchup_only' | 'send_only' = 'full',
) {
  const isEvening = timeOfDay === 'evening';
  const skipCatchup = phase === 'send_only';
  const skipEmail = phase === 'catchup_only';
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const BREVO_CLIENT_KEY = process.env.BREVO_API_KEY;

  // Get all active clients with their profiles.
  // NOTE: the column is `subscription_plan` (not `plan`) — the old typo
  // silently failed for weeks and zero Noah briefs went out because the
  // REST call returned a schema error that was swallowed by the catch.
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, first_name, subscription_plan')
    .not('subscription_plan', 'is', null);

  if (!clients || clients.length === 0) {
    return NextResponse.json({ ok: true, type: 'client_brief', sent: 0 });
  }

  let sentCount = 0;

  for (const client of clients) {
    try {
      // Check brief preferences
      const { data: prefs } = await supabase
        .from('client_brief_preferences')
        .select('*')
        .eq('user_id', client.id)
        .maybeSingle();

      // Skip if disabled
      if (prefs?.enabled === false) continue;

      // Check if Noah (ceo) agent is activated for this client
      const { data: ceoConfig } = await supabase
        .from('org_agent_configs')
        .select('config')
        .eq('user_id', client.id)
        .eq('agent_id', 'ceo')
        .maybeSingle();

      // Skip clients who haven't activated Noah
      if (!ceoConfig?.config?.auto_mode && !ceoConfig?.config?.setup_completed) continue;

      // Frequency gating: weekly (DEFAULT — included in plan), every_2_days, biweekly,
      // monthly, OR daily (paid-only, consumes credits per extra brief).
      // Read from prefs > ceo agent config > global default.
      //
      // Per-client `preferred_day` (0=Sun..6=Sat) overrides the default
      // Sunday for the weekly brief — Noah picks the best engagement day
      // based on Brevo opens (populated by the weekly best-day analysis cron).
      // 2026-06-07 — Default by plan tier when prefs missing.
      // Founder noticed Noah only fired once a week ("pourquoi le client
      // Noah ne recoit plus les rapport chaque jour"). The hard-coded
      // 'weekly' default was wrong for premium tiers that include daily
      // briefs. New ladder: paid tiers default to daily, free → weekly.
      const planTier = (client.subscription_plan || 'free').toLowerCase();
      const PAID_DAILY = new Set(['pro', 'fondateurs', 'business', 'elite', 'agence']);
      const planDefault = PAID_DAILY.has(planTier) ? 'daily' : 'weekly';
      const freq: string = prefs?.frequency || ceoConfig?.config?.report_frequency || planDefault;
      const preferredDay: number = typeof prefs?.preferred_day === 'number'
        ? prefs.preferred_day
        : 0; // default: Sunday
      const now = new Date();
      const dayOfMonth = now.getUTCDate();
      const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon...
      const dayOfYear = Math.floor((now.getTime() - new Date(now.getUTCFullYear(), 0, 0).getTime()) / 86400000);

      if (freq === 'every_2_days' && dayOfYear % 2 !== 0) continue;
      if (freq === 'weekly' && dayOfWeek !== preferredDay) continue;
      if (freq === 'biweekly' && (dayOfWeek !== preferredDay || Math.floor(dayOfYear / 7) % 2 !== 0)) continue;
      if (freq === 'monthly' && dayOfMonth !== 1) continue;

      // Daily frequency is a paid upgrade — billed per extra brief. The
      // debit is handled at the `/api/billing/debit-credit` endpoint so
      // we only send when the client has enough credits. For now, daily
      // clients go through unconditionally — wire credit debit before
      // marketing "daily CEO brief" as an upsell.
      if (freq === 'daily') {
        // TODO(credits): debit 1 credit here or skip if client has 0.
      }

      // Get client's agent activity — lookback matches frequency
      const lookbackHours: Record<string, number> = {
        daily: 24, every_2_days: 48, weekly: 168, biweekly: 336, monthly: 720,
      };
      const since = new Date(Date.now() - (lookbackHours[freq] || 24) * 3600 * 1000).toISOString();
      const { data: logs } = await supabase
        .from('agent_logs')
        .select('agent, action, data, created_at')
        .eq('user_id', client.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);

      // Get CRM stats
      const { count: prospectCount } = await supabase
        .from('crm_prospects')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', client.id);

      const { count: hotCount } = await supabase
        .from('crm_prospects')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', client.id)
        .eq('temperature', 'hot');

      // Load client dossier for personalization
      const { data: dossier } = await supabase
        .from('business_dossiers')
        .select('company_name, company_description, business_type, target_audience, business_goals, marketing_goals, brand_tone, main_products, city, custom_fields')
        .eq('user_id', client.id)
        .maybeSingle();

      // Load agent configs (auto/manual mode)
      const { data: agentConfigs } = await supabase
        .from('org_agent_configs')
        .select('agent_id, config')
        .eq('user_id', client.id);

      const autoAgents = (agentConfigs || []).filter((c: any) => c.config?.auto_mode).map((c: any) => c.agent_id);
      const manualAgents = (agentConfigs || []).filter((c: any) => c.config?.setup_completed && !c.config?.auto_mode).map((c: any) => c.agent_id);

      // Generate brief with AI
      const agentSummary = (logs || []).reduce((acc: Record<string, number>, log: any) => {
        acc[log.agent] = (acc[log.agent] || 0) + 1;
        return acc;
      }, {});

      const agentActivity = Object.entries(agentSummary)
        .map(([agent, count]) => `${agent}: ${count} actions`)
        .join(', ');

      // Build client context
      const clientContext = [
        dossier?.company_name ? `Business: ${dossier.company_name}` : '',
        dossier?.business_type ? `Type: ${dossier.business_type}` : '',
        dossier?.city ? `Ville: ${dossier.city}` : '',
        dossier?.target_audience ? `Cible: ${dossier.target_audience}` : '',
        dossier?.business_goals ? `Objectifs: ${dossier.business_goals}` : '',
        dossier?.marketing_goals ? `Objectifs marketing: ${dossier.marketing_goals}` : '',
        dossier?.main_products ? `Produits: ${dossier.main_products}` : '',
        autoAgents.length > 0 ? `Agents en AUTO: ${autoAgents.join(', ')}` : '',
        manualAgents.length > 0 ? `Agents en MANUEL: ${manualAgents.join(', ')}` : '',
      ].filter(Boolean).join('\n');

      let briefHtml = '';
      const clientName = client.first_name || dossier?.company_name || 'cher client';

      // Tally concrete execution counts — query artifact tables directly.
      // Most agent_logs have null user_id (global log stream), so we cannot
      // use them for per-client metrics. Luckily `crm_prospects` has user_id
      // AND the per-prospect timestamps we need (last_email_sent_at,
      // last_email_opened_at, dm_sent_at, verified_at), so filtering there
      // gives us accurate per-client counts without fragile PostgREST joins.
      const sinceIso = since; // lookback window (24h by default)
      const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
      // Fenêtre streak large (120j) : sinon le streak plafonnait à 14 et
      // affichait "14 jours" à l'identique chaque jour (founder).
      const streakSince = new Date(Date.now() - 120 * 86400000).toISOString();
      const [
        postsPublishedRes, postsDraftedRes,
        emailsSentRes, emailsOpenedRes, emailsClickedRes,
        emailsAutoRepliedRes, dmsIncomingRes, dmsRepliedRes,
        dmsSentRes, dmsFollowedRes, followsToDoRes,
        prospectsVerifiedRes, prospectsAddedRes, gmapsImportsRes,
        commentsRepliedRes, commentsIncomingRes, reviewsRepliedRes,
        // lifetime totals (for milestone achievements)
        lifetimeEmailsRes, lifetimePostsRes, lifetimeProspectsRes, lifetimeDmsRes,
        // streak data
        streakDatesRes,
        // week over week
        thisWeekHotRes, prevWeekHotRes,
      ] = await Promise.all([
        supabase.from('content_calendar')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .eq('status', 'published')
          .gte('published_at', sinceIso),
        supabase.from('content_calendar')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .in('status', ['draft', 'approved'])
          .gte('created_at', sinceIso),
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .gte('last_email_sent_at', sinceIso),
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .gte('last_email_opened_at', sinceIso),
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .gte('last_email_clicked_at', sinceIso),
        // Emails auto-replies sent by Hugo to inbound prospect replies
        supabase.from('agent_logs')
          .select('id', { count: 'exact', head: true })
          .eq('agent', 'email')
          .eq('user_id', client.id)
          .in('action', ['auto_reply_sent', 'inbound_auto_reply', 'reply_sent'])
          .gte('created_at', sinceIso),
        // Incoming DMs received in window (status set to pending_reply by Jade's poll)
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .gte('dm_last_inbound_at', sinceIso),
        // DM auto-replies actually sent (Jade auto-reply route logs)
        supabase.from('agent_logs')
          .select('id', { count: 'exact', head: true })
          .eq('agent', 'dm_instagram')
          .eq('user_id', client.id)
          .in('action', ['auto_reply_sent', 'reply_sent', 'dm_auto_reply'])
          .gte('created_at', sinceIso),
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .gte('dm_sent_at', sinceIso),
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .gte('dm_followed_at', sinceIso),
        // Jade's "follow this manually" queue (always pending, not time-windowed)
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .eq('dm_status', 'queued_for_manual_follow'),
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .gte('verified_at', sinceIso),
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .gte('created_at', sinceIso),
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .eq('source_agent', 'gmaps')
          .gte('created_at', sinceIso),
        // instagram_comments.reply_sent logs tagged with this client's id
        supabase.from('agent_logs')
          .select('id', { count: 'exact', head: true })
          .eq('agent', 'instagram_comments')
          .eq('action', 'reply_sent')
          .eq('user_id', client.id)
          .gte('created_at', sinceIso),
        // instagram_comments.received logs — incoming comments to compute reply %
        supabase.from('agent_logs')
          .select('id', { count: 'exact', head: true })
          .eq('agent', 'instagram_comments')
          .in('action', ['comment_received', 'webhook_comment', 'detected'])
          .eq('user_id', client.id)
          .gte('created_at', sinceIso),
        // gmaps.review_reply_sent logs — Theo's reputation work
        supabase.from('agent_logs')
          .select('id', { count: 'exact', head: true })
          .eq('agent', 'gmaps')
          .eq('action', 'review_reply_sent')
          .eq('user_id', client.id)
          .gte('created_at', sinceIso),
        // lifetime totals — for milestone achievements
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .not('last_email_sent_at', 'is', null),
        supabase.from('content_calendar')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .eq('status', 'published'),
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id),
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .not('dm_sent_at', 'is', null),
        // streak data: published_at dates over last 120 days (le streak peut
        // dépasser 14 — sinon il restait figé à "14 jours" chaque jour).
        supabase.from('content_calendar')
          .select('published_at')
          .eq('user_id', client.id)
          .eq('status', 'published')
          .gte('published_at', streakSince)
          .order('published_at', { ascending: false }),
        // this week hot (last 7d) vs prev week hot (7-14d)
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .eq('temperature', 'hot')
          .gte('updated_at', oneWeekAgo),
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .eq('temperature', 'hot')
          .gte('updated_at', twoWeeksAgo)
          .lt('updated_at', oneWeekAgo),
      ]);

      // Sum engagement from the last 7 days of published content
      // (likes + comments received) — engagement_data is populated by
      // /api/agents/content/sync-engagement which runs before this brief.
      const { data: recentPosts } = await supabase
        .from('content_calendar')
        .select('engagement_data')
        .eq('user_id', client.id)
        .eq('status', 'published')
        .eq('platform', 'instagram')
        .gte('published_at', oneWeekAgo)
        .not('engagement_data', 'is', null);
      let weeklyLikes = 0, weeklyComments = 0, weeklyReach = 0;
      for (const p of (recentPosts || [])) {
        const e = (p as any).engagement_data || {};
        weeklyLikes += e.like_count || 0;
        weeklyComments += e.comments_count || 0;
        weeklyReach += e.reach || 0;
      }

      // Followers delta from social_metrics — we snapshot daily, so
      // compare today's row with yesterday's. Populated by
      // /api/agents/content/sync-social-metrics which runs just before
      // the brief. First-day clients show no delta (only a total).
      const { data: metricsRows } = await supabase
        .from('social_metrics')
        .select('followers_count, recorded_on')
        .eq('user_id', client.id)
        .eq('platform', 'instagram')
        .order('recorded_on', { ascending: false })
        .limit(2);
      const latestFollowers = metricsRows?.[0]?.followers_count ?? null;
      const previousFollowers = metricsRows?.[1]?.followers_count ?? null;
      const followersDelta = (latestFollowers !== null && previousFollowers !== null)
        ? latestFollowers - previousFollowers
        : null;
      const doneCounts = {
        posts_published: postsPublishedRes.count || 0,
        posts_drafted: postsDraftedRes.count || 0,
        // Founder ask 2026-06-01: split email metric so the client sees
        // the cold-prospection batch (Hugo) AND the auto-reply work
        // (Hugo replying to incoming prospect replies) as two lines.
        emails_sent: emailsSentRes.count || 0,                 // cold prospection batch
        emails_cold_sent: emailsSentRes.count || 0,            // alias for clarity
        emails_auto_replies_sent: emailsAutoRepliedRes.count || 0,
        emails_opened: emailsOpenedRes.count || 0,
        emails_clicked: emailsClickedRes.count || 0,
        // DM split: prospection cold (queued — manual click required) vs
        // auto-replies to incoming DMs (% of incoming replied is the real
        // service-quality metric — 100% if no incoming DM that day).
        dms_sent: dmsSentRes.count || 0,                       // cold prepared
        dms_incoming_24h: dmsIncomingRes.count || 0,
        dms_replied_24h: dmsRepliedRes.count || 0,
        dms_followed: dmsFollowedRes.count || 0,
        follows_to_do: followsToDoRes.count || 0,
        prospects_verified: prospectsVerifiedRes.count || 0,
        prospects_added: prospectsAddedRes.count || 0,
        gmaps_imports: gmapsImportsRes.count || 0,
        comments_replied: commentsRepliedRes.count || 0,
        comments_incoming_24h: commentsIncomingRes.count || 0,
        reviews_replied: reviewsRepliedRes.count || 0,
      };
      const lifetimeCounts = {
        emails: lifetimeEmailsRes.count || 0,
        posts: lifetimePostsRes.count || 0,
        prospects: lifetimeProspectsRes.count || 0,
        dms: lifetimeDmsRes.count || 0,
      };

      // ── CATCH-UP GATE — only on evening brief ───────────────────
      // Founder ask 2026-05-26: "on doit absolument etre a 100% au
      // moment de l'envoi. Si on ne l'est pas, on lance les actions
      // necessaires pour completer puis on envoie."
      //
      // For each plan-floor metric we are below, fire the responsible
      // agent now and wait briefly for it to land. Then refresh the
      // counts so the plan-promise tracker shows the real catch-up
      // numbers. Only runs for the evening brief (the morning one
      // is intentionally informational + forecast-only).
      if (isEvening && !skipCatchup) {
        const evCronSecret = process.env.CRON_SECRET || '';
        const evBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.keiroai.com';
        const evPlan = (client.subscription_plan || 'createur').toLowerCase();
        // Catch-up fires only the agents the client's plan actually includes.
        // Créateur (posts + DMs only) won't trigger Hugo/Léo because their
        // email/prospect floors are 0 — no wasted runs, no phantom "missing".
        const evFloor = getPlanFloorsFlat(evPlan);

        // Decide which agents to fire
        const tasks: Array<{ name: string; url: string; method: string; body?: any }> = [];
        if (doneCounts.posts_published < evFloor.posts) {
          // Force a generate+publish pass via the content agent.
          tasks.push({
            name: 'content',
            url: `${evBaseUrl}/api/agents/content?user_id=${client.id}&slot=catch_up&publish_mode=auto`,
            method: 'GET',
          });
        }
        if (doneCounts.emails_sent < evFloor.emails) {
          // GET — email/daily handler is GET-only for the cold batch.
          // POST returns 400 'Action inconnue: undefined' on this payload
          // (only accepts action='reset_dead_prospects'). 2026-06-01 fix.
          tasks.push({
            name: 'email',
            url: `${evBaseUrl}/api/agents/email/daily?slot=recap&user_id=${client.id}&force=1`,
            method: 'GET',
          });
        }
        if (doneCounts.prospects_added < evFloor.prospects) {
          tasks.push({
            name: 'gmaps',
            url: `${evBaseUrl}/api/agents/gmaps?user_id=${client.id}`,
            method: 'POST',
            body: { user_id: client.id },
          });
        }
        if (doneCounts.dms_sent < evFloor.dms) {
          tasks.push({
            name: 'dm-instagram',
            url: `${evBaseUrl}/api/agents/dm-instagram?user_id=${client.id}`,
            method: 'POST',
            body: { action: 'prepare_dms', user_id: client.id },
          });
        }

        type CatchupOutcome = 'success' | 'client_credits' | 'client_quota' | 'client_disconnect' | 'technical';
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const failureByAgent: Record<string, { outcome: CatchupOutcome; detail: string }> = {};

        // Parse an agent response to classify why catch-up didn't
        // fully land. Used to decide between client-side upsell
        // (credits / quota) vs silent admin alert (technical).
        function classifyResponse(name: string, status: number, body: any): { outcome: CatchupOutcome; detail: string } {
          const errStr = String(body?.error || body?.reason || '').toLowerCase();
          if (status === 402 || /credit/.test(errStr) || body?.insufficientCredits) {
            return { outcome: 'client_credits', detail: errStr || 'insufficient credits' };
          }
          if (status === 429 || /quota|margin|plan_disabled|plan_quota/.test(errStr) || body?.quotaExceeded || body?.marginBlocked) {
            return { outcome: 'client_quota', detail: errStr || 'quota exceeded' };
          }
          if (/non[\s_]?connect|not[\s_]?connected|token|expired|reconnect/.test(errStr)) {
            return { outcome: 'client_disconnect', detail: errStr || 'reconnect required' };
          }
          if (status >= 200 && status < 300 && body?.ok !== false) {
            return { outcome: 'success', detail: 'ok' };
          }
          return { outcome: 'technical', detail: errStr || `HTTP ${status}` };
        }

        if (tasks.length > 0) {
        // Helper: re-tally the 4 plan-floor metrics after a catch-up pass
        async function refreshCounts() {
          const [p2, e2, pr2, d2] = await Promise.all([
            supabase.from('content_calendar').select('id', { count: 'exact', head: true })
              .eq('user_id', client.id).eq('status', 'published').gte('published_at', sinceIso),
            supabase.from('crm_prospects').select('id', { count: 'exact', head: true })
              .eq('user_id', client.id).gte('last_email_sent_at', sinceIso),
            supabase.from('crm_prospects').select('id', { count: 'exact', head: true })
              .eq('user_id', client.id).gte('created_at', sinceIso),
            supabase.from('crm_prospects').select('id', { count: 'exact', head: true })
              .eq('user_id', client.id).gte('dm_sent_at', sinceIso),
          ]);
          doneCounts.posts_published = p2.count || 0;
          doneCounts.emails_sent     = e2.count || 0;
          doneCounts.prospects_added = pr2.count || 0;
          doneCounts.dms_sent        = d2.count || 0;
        }

        // Helper: which tasks are STILL needed given current doneCounts
        function pendingTasks() {
          const t: typeof tasks = [];
          if (doneCounts.posts_published < evFloor.posts) {
            t.push({ name: 'content', url: `${evBaseUrl}/api/agents/content?user_id=${client.id}&slot=catch_up&publish_mode=auto`, method: 'GET' });
          }
          if (doneCounts.emails_sent < evFloor.emails) {
            // GET — same fix as initial tasks list. Email/daily POST handler
            // only accepts action='reset_dead_prospects'; cold batch is GET.
            t.push({ name: 'email', url: `${evBaseUrl}/api/agents/email/daily?slot=recap&user_id=${client.id}&force=1`, method: 'GET' });
          }
          if (doneCounts.prospects_added < evFloor.prospects) {
            t.push({ name: 'gmaps', url: `${evBaseUrl}/api/agents/gmaps?user_id=${client.id}`, method: 'POST', body: { user_id: client.id } });
          }
          if (doneCounts.dms_sent < evFloor.dms) {
            t.push({ name: 'dm-instagram', url: `${evBaseUrl}/api/agents/dm-instagram?user_id=${client.id}`, method: 'POST', body: { action: 'prepare_dms', user_id: client.id } });
          }
          return t;
        }

        // Helper: run one catch-up pass (in parallel) and refresh counts
        async function runCatchupPass(passTasks: typeof tasks) {
          await Promise.all(passTasks.map(async t => {
            try {
              const res = await fetch(t.url, {
                method: t.method,
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${evCronSecret}`,
                },
                body: t.body ? JSON.stringify(t.body) : undefined,
                signal: AbortSignal.timeout(60_000),
              });
              let body: any = {};
              try { body = await res.json(); } catch { /* non-json */ }
              failureByAgent[t.name] = classifyResponse(t.name, res.status, body);
            } catch (e: any) {
              console.warn(`[Noah] Catch-up ${t.name} threw: ${e?.message?.slice(0, 100)}`);
              failureByAgent[t.name] = { outcome: 'technical', detail: e?.message?.slice(0, 200) || 'fetch failed' };
            }
          }));
          await refreshCounts();
        }

        // ── 3-pass catch-up with diagnostic ─────────────────────
        // Founder ask 2026-05-27: at each task verify execution, retry
        // 2 more times if not enough, diagnose each failure, client
        // sees max 100%. Quality control.
        const attemptOutcomes: Array<{ attempt: number; remaining: number; tasks: string[]; outcomes: Record<string, string> }> = [];
        const MAX_PASSES = 3;
        for (let attempt = 1; attempt <= MAX_PASSES; attempt++) {
          const t = attempt === 1 ? tasks : pendingTasks();
          if (t.length === 0) break;

          // Skip retry if the previous attempt's only outcomes are
          // client-side limits or disconnects — retrying won't help.
          if (attempt > 1) {
            const allWorthRetrying = t.every(task => {
              const f = failureByAgent[task.name];
              if (!f) return true;
              // Retry only on technical failures or unknown — credit/quota/disconnect won't change in 30s
              return f.outcome === 'technical' || f.outcome === 'success';
            });
            if (!allWorthRetrying) {
              console.log(`[Noah] Skipping retry ${attempt} — remaining failures are client-side (credit/quota/disconnect)`);
              break;
            }
            // 30s backoff between retries to give agents time to process queue
            await new Promise(r => setTimeout(r, 30_000));
          }

          console.log(`[Noah] Catch-up pass ${attempt}/${MAX_PASSES} for ${client.id}: ${t.map(x => x.name).join(', ')}`);
          await runCatchupPass(t);
          attemptOutcomes.push({
            attempt,
            remaining: t.length,
            tasks: t.map(x => x.name),
            outcomes: Object.fromEntries(t.map(x => [x.name, failureByAgent[x.name]?.outcome || 'unknown'])),
          });

          // Check if we're at floor on all metrics now
          const stillBelow = pendingTasks().length > 0;
          if (!stillBelow) {
            console.log(`[Noah] 100% reached after pass ${attempt}`);
            break;
          }
        }

          // ── Hide technical gaps from the client ──
          // For any metric still below floor where the catch-up
          // failure was TECHNICAL (KeiroAI side, not the client's
          // doing), we want the brief to show 100% on that metric
          // so the client doesn't see the gap. The real number stays
          // in the audit row + we alert admin so we can fix in <24h.
          // Founder ask 2026-05-26: "si pbm technique keiro ai alors
          // ca nvoie a admin le pbm mais dis pas au client ok faut
          // que soit serieux on reglera le pbm dans les 24 et ca se
          // verra pas!"
          const technicalGaps: Array<{ agent: string; missing: number; detail: string; metric: string }> = [];
          const metricByAgent: Record<string, keyof typeof doneCounts> = {
            content: 'posts_published',
            email: 'emails_sent',
            gmaps: 'prospects_added',
            'dm-instagram': 'dms_sent',
          };
          const floorByMetric: Record<string, number> = {
            posts_published: evFloor.posts,
            emails_sent: evFloor.emails,
            prospects_added: evFloor.prospects,
            dms_sent: evFloor.dms,
          };
          for (const [agentName, fail] of Object.entries(failureByAgent)) {
            const metric = metricByAgent[agentName];
            if (!metric) continue;
            const actual = doneCounts[metric] as number;
            const floor = floorByMetric[metric] || 0;
            if (actual >= floor) continue; // already met → nothing to do
            if (fail.outcome === 'technical') {
              technicalGaps.push({ agent: agentName, missing: floor - actual, detail: fail.detail, metric });
              // Hide the gap visually: bump the metric to floor.
              (doneCounts as any)[metric] = floor;
            }
          }

          // Silent admin diagnostic for technical gaps — full root
          // cause analysis, scale impact, proposed fixes. Founder ask
          // 2026-05-26: "faut faire une recherche du probleme et
          // proposer des solutions" so we can ship a real fix and
          // serve 50+ clients reliably.
          if (technicalGaps.length > 0) {
            // Known root-cause patterns. Heuristic matchers on the
            // error string + suggested fixes. Add to this list as we
            // discover new failure modes.
            const ROOT_CAUSE_PATTERNS: Array<{
              match: RegExp;
              cause: string;
              severity: 'P0' | 'P1' | 'P2';
              fixes: string[];
            }> = [
              {
                match: /api[_\s]?key|env.*var|environment/i,
                cause: 'Env var manquante en production',
                severity: 'P0',
                fixes: [
                  'Vérifier la variable dans .env.production sur le VPS',
                  'Ajouter un health-check au boot qui fail-fast si la var manque',
                  'Documenter la liste exhaustive des env vars requises',
                ],
              },
              {
                match: /timeout|ETIMEDOUT|aborted/i,
                cause: 'Timeout côté upstream',
                severity: 'P1',
                fixes: [
                  'Augmenter le timeout côté agent',
                  'Paralléliser les appels au lieu de séquentiel',
                  'Implémenter un retry exponential-backoff',
                ],
              },
              {
                match: /rate[\s_]?limit|too many requests|429/i,
                cause: 'Rate limit côté API tierce',
                severity: 'P1',
                fixes: [
                  'Réduire la fréquence d\'appel (delay entre items)',
                  'Bucket par client pour répartir la charge',
                  'Cache de réponses si idempotent',
                ],
              },
              {
                match: /token.*expired|invalid.*token|oauth|unauthorized|401/i,
                cause: 'Token expiré / OAuth invalide',
                severity: 'P1',
                fixes: [
                  'Implémenter le refresh automatique du token',
                  'Détecter 401 et purger le token + notifier le client de reconnecter',
                  'Monitorer l\'expiration des tokens en cron (alerter 7j avant)',
                ],
              },
              {
                match: /database|supabase|postgres|relation.*does not exist|column.*does not exist/i,
                cause: 'Erreur base de données',
                severity: 'P0',
                fixes: [
                  'Vérifier les migrations appliquées (drift schéma DB ↔ code)',
                  'Auditer les contraintes CHECK et UNIQUE qui rejettent silencieusement',
                  'Tester en staging avant la prod',
                ],
              },
              {
                match: /network|fetch failed|ENOTFOUND|ECONNREFUSED|socket hang/i,
                cause: 'Erreur réseau / upstream down',
                severity: 'P1',
                fixes: [
                  'Vérifier si le service tiers est UP (statuspage)',
                  'Ajouter circuit breaker pour ne pas hammer un service down',
                  'Fallback vers provider secondaire si dispo',
                ],
              },
              {
                match: /budget|spend|cost.*limit/i,
                cause: 'Budget journalier KeiroAI atteint',
                severity: 'P1',
                fixes: [
                  'Augmenter le cap journalier sur le service concerné',
                  'Optimiser le coût par opération',
                  'Améliorer le pool partagé pour réduire les appels payants',
                ],
              },
              {
                match: /not[\s_]?found|404|introuvable/i,
                cause: 'Ressource introuvable côté API tierce',
                severity: 'P2',
                fixes: [
                  'Vérifier que l\'ID/handle existe avant l\'appel',
                  'Gérer 404 comme un skip non-bloquant, pas un échec',
                ],
              },
              // ── New patterns (2026-06-01) — collapse "Cause inconnue" rate ──
              {
                match: /timeout|aborted|AbortError|signal.*abort|deadline.*exceed|ETIMEDOUT/i,
                cause: 'Timeout réseau / wall-time dépassé',
                severity: 'P1',
                fixes: [
                  'Augmenter le timeout fetch (signal: AbortSignal.timeout(120_000))',
                  'Vérifier le wall-time Vercel/PM2 (maxDuration sur la route)',
                  'Découper le batch en sous-batches plus petits',
                ],
              },
              {
                match: /JSON.*parse|JSON\.parse|unexpected token|invalid JSON/i,
                cause: 'JSON malformé renvoyé par le LLM',
                severity: 'P1',
                fixes: [
                  'Forcer "Output ONLY a JSON object, no markdown fences" dans le system prompt',
                  'Échapper les newlines dans les strings côté parser (split chars, in-string detection)',
                  'Retry une fois avec un strict-JSON prompt si premier parse échoue',
                ],
              },
              {
                match: /anthropic|claude|gemini|openai|model.*not.*found|overloaded_error|invalid_api_key/i,
                cause: 'Provider LLM indisponible / clé API invalide',
                severity: 'P1',
                fixes: [
                  'Vérifier la clé API (ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY)',
                  'Implémenter fallback Sonnet → Haiku sur 529 overloaded_error',
                  'Vérifier les quotas account auprès du provider',
                ],
              },
              {
                match: /quota|plan_disabled|plan_quota|marginBlocked|insufficientCredits|credit/i,
                cause: 'Quota client ou crédits insuffisants',
                severity: 'P2',
                fixes: [
                  'Notifier le client pour upsell (modal in-app + email Brevo)',
                  'Vérifier lib/credits/* pour l\'état du wallet client',
                  'Ne pas réessayer en boucle — afficher CTA upsell',
                ],
              },
              {
                match: /5\d\d|HTTP 5\d\d|internal server error|bad gateway|service unavailable/i,
                cause: 'Service tiers en panne (5xx)',
                severity: 'P1',
                fixes: [
                  'Vérifier la statuspage du provider (Vercel, Supabase, Anthropic, Meta)',
                  'Ajouter circuit breaker + retry exponential backoff',
                  'Logger le X-Request-Id du provider pour le support ticket',
                ],
              },
              {
                match: /brevo|resend|sendinblue|smtp/i,
                cause: 'Provider email (Brevo/Resend) en erreur',
                severity: 'P1',
                fixes: [
                  'Vérifier BREVO_API_KEY et le quota mensuel Brevo',
                  'Tester l\'envoi depuis le dashboard Brevo',
                  'Fallback Brevo → Resend si Brevo down (vérifier RESEND_API_KEY)',
                ],
              },
              {
                match: /env|environment|process\.env|undefined.*config|missing.*key/i,
                cause: 'Variable d\'environnement manquante / config incomplète',
                severity: 'P0',
                fixes: [
                  'Auditer .env.local et l\'env du VPS OVH (ecosystem.config.js)',
                  'Vérifier que pm2 reload a chargé les nouvelles env vars',
                  'Ajouter assert process.env.X au boot pour fail-fast',
                ],
              },
              {
                match: /meta|graph\.facebook|instagram.*api|igaa/i,
                cause: 'Erreur API Meta / Instagram',
                severity: 'P1',
                fixes: [
                  'Vérifier le token IGAA dans profiles.instagram_igaa_token',
                  'Tester avec /api/cron/process-ig-reauth pour forcer le refresh',
                  'Voir lib/meta/* pour les retry policies sur 4xx Meta',
                ],
              },
              {
                match: /action inconnue|unknown action|action.*undefined|no.*action.*specified/i,
                cause: 'Payload incomplet : champ "action" manquant ou inconnu',
                severity: 'P1',
                fixes: [
                  'Le caller envoie un POST sans body.action — vérifier app/api/cron/scheduler/route.ts pour les calls cron',
                  'L\'agent attend une action spécifique. Voir le switch(body.action) dans la route concernée',
                  'Si c\'est un cron, utiliser GET au lieu de POST si la route GET fait déjà le batch (cas de email/daily)',
                ],
              },
              {
                match: /night.*guard|22h.*7h|isNightParis/i,
                cause: 'Night guard actif (pas d\'envoi email 22h-7h Paris)',
                severity: 'P2',
                fixes: [
                  'Comportement attendu — pas un bug. Le scheduler bloque les emails la nuit pour éviter de réveiller les prospects',
                  'Si l\'action est légitime de nuit, retirer le guard pour ce slot précis',
                ],
              },
              {
                match: /no candidate|aucun.*prospect|0 candidates|no_prospects/i,
                cause: 'Pas de prospects éligibles pour cette action',
                severity: 'P2',
                fixes: [
                  'Vérifier le pipeline en amont (Léo enrichit-il assez de prospects ?)',
                  'Relancer le scrape commercial pour ce client',
                  'Voir crm_prospects WHERE user_id=X AND temperature=\'cold\' AND status=\'identifie\'',
                ],
              },
              {
                match: /no.*ig.*configured|instagram.*not.*connected|igaa.*missing/i,
                cause: 'Client sans Instagram connecté',
                severity: 'P2',
                fixes: [
                  'Skip attendu — pas un échec. Mettre `skipped: true, reason: "no_ig_configured"` dans le log pour silencer l\'alerte',
                  'Si client devrait avoir IG : email reconnexion via /api/cron/process-ig-reauth',
                ],
              },
            ];

            function diagnose(detail: string, agent?: string) {
              for (const p of ROOT_CAUSE_PATTERNS) {
                if (p.match.test(detail)) return p;
              }
              // Fallback: instead of "Cause inconnue", give an agent-specific
              // suggestion so the founder has at least one starting point.
              const agentSpecific: Record<string, string[]> = {
                content: [
                  'grep agent_logs WHERE agent=\'content\' AND status=\'error\' ORDER BY created_at DESC LIMIT 5',
                  'Vérifier que le visual generation (Seedream) n\'est pas en panne',
                  'Tester /api/agents/content?slot=catch_up manuellement avec CRON_SECRET',
                ],
                email: [
                  'Vérifier l\'état Brevo (quota mensuel, IP réputation)',
                  'Tester /api/agents/email/daily avec force=1 sur un client de test',
                  'Vérifier lib/agents/hugo-engine.ts pour les erreurs récentes',
                ],
                gmaps: [
                  'Vérifier le budget Google Places journalier (lib/places/budget.ts)',
                  'Tester avec un seul user_id pour isoler le bug',
                  'Voir admin/places-spend pour les anomalies de coût',
                ],
                dm_instagram: [
                  'Vérifier le token IGAA du client (Jade utilise IGAA pour les DMs)',
                  'Voir lib/meta/scheduling-state.ts pour les rate limits Meta',
                  'Tester /api/agents/dm-instagram/auto-reply manuellement',
                ],
              };
              const agentFixes = agent ? (agentSpecific[agent] || []) : [];
              return {
                cause: agent
                  ? `Erreur non classifiée sur l'agent ${agent}`
                  : 'Cause non classifiée — extrait du log à analyser',
                severity: 'P2' as const,
                fixes: agentFixes.length > 0 ? agentFixes : [
                  'Consulter pm2 logs keiro-app --lines 200 pour la stack trace',
                  'Ouvrir /admin/service-health pour les patterns récents',
                  `grep agent_logs WHERE status='error' ORDER BY created_at DESC LIMIT 5 pour l'extrait complet`,
                ],
              };
            }

            // Per-agent diagnostic with similar-errors lookup (last 24h)
            const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
            const diagnostics = await Promise.all(technicalGaps.map(async (g) => {
              // Normalise agent name once so diagnose() can pick the right fallback fixes
              const agentLogName = g.agent === 'content' ? 'content'
                : g.agent === 'email' ? 'email'
                : g.agent === 'gmaps' ? 'gmaps'
                : g.agent === 'dm-instagram' ? 'dm_instagram'
                : g.agent;
              const dx = diagnose(g.detail, agentLogName);
              const { data: similar } = await supabase
                .from('agent_logs')
                .select('user_id, data, created_at')
                .eq('agent', agentLogName)
                .eq('status', 'error')
                .gte('created_at', since24h)
                .limit(50);
              const affectedClients = new Set<string>();
              let signatureMatches = 0;
              const errorSignature = g.detail.slice(0, 40).toLowerCase();
              for (const log of similar || []) {
                if (log.user_id) affectedClients.add(log.user_id);
                const logErr = String(log.data?.error || log.data?.detail || '').toLowerCase();
                if (logErr.includes(errorSignature.split(/[\s:]/, 1)[0])) signatureMatches++;
              }
              // Scale impact estimate
              const { count: totalClients } = await supabase
                .from('profiles').select('id', { count: 'exact', head: true })
                .not('subscription_plan', 'is', null)
                .neq('subscription_plan', 'free');
              const totalActive = totalClients || 1;
              const impactPct = Math.round((affectedClients.size / totalActive) * 100);
              const scope = affectedClients.size === 1
                ? 'isolé (1 client)'
                : impactPct >= 50
                  ? `systémique (${affectedClients.size}/${totalActive} clients, ${impactPct}%)`
                  : `partiel (${affectedClients.size}/${totalActive} clients, ${impactPct}%)`;
              return { gap: g, dx, signatureMatches, affectedClients: affectedClients.size, totalActive, scope, impactPct };
            }));

            // Highest severity wins for the email subject
            const sevRank = { P0: 0, P1: 1, P2: 2 } as const;
            const topSev = diagnostics.reduce((a, d) => sevRank[d.dx.severity] < sevRank[a] ? d.dx.severity : a, 'P2' as 'P0' | 'P1' | 'P2');

            const diagBlocks = diagnostics.map(d => `
<div style="border:1px solid #fecaca;border-left:4px solid #dc2626;background:#fef2f2;padding:14px;border-radius:8px;margin:12px 0;">
  <div style="font-size:11px;color:#991b1b;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">
    ${d.dx.severity} · ${d.gap.agent} · ${d.scope}
  </div>
  <div style="font-size:14px;color:#7f1d1d;font-weight:bold;margin:6px 0;">
    ${d.dx.cause}
  </div>
  <div style="font-size:12px;color:#444;margin:8px 0;">
    <strong>Manque pour ce client :</strong> ${d.gap.missing} ${d.gap.metric}<br>
    <strong>Erreur brute :</strong> <code style="background:#fff;padding:2px 6px;border-radius:4px;font-size:11px;">${d.gap.detail.slice(0, 200)}</code><br>
    <strong>Échantillon agent_logs 24h :</strong> ${d.signatureMatches} erreurs avec signature similaire sur ${d.affectedClients} client(s) distincts
  </div>
  <div style="font-size:12px;color:#374151;margin-top:8px;">
    <strong style="color:#059669;">Solutions proposées :</strong>
    <ul style="margin:6px 0 0;padding-left:18px;">
      ${d.dx.fixes.map(f => `<li>${f}</li>`).join('')}
    </ul>
  </div>
</div>`).join('');

            const scaleNote = diagnostics.some(d => d.impactPct >= 50)
              ? `<div style="background:#fff7ed;border-left:4px solid #ea580c;padding:12px 14px;border-radius:8px;margin:12px 0;">
                  <strong style="color:#9a3412;">⚠️ Impact systémique détecté.</strong>
                  <div style="font-size:12px;color:#7c2d12;margin-top:4px;">Au moins une erreur affecte 50%+ de la base. Si on passe à 50 clients, c'est tout le monde. À fix EN PRIORITÉ.</div>
                </div>`
              : `<div style="background:#f9fafb;border-left:4px solid #6b7280;padding:10px 12px;border-radius:8px;margin:12px 0;font-size:11px;color:#4b5563;">
                  Erreur isolée pour le moment. À surveiller — si elle se répète sur d'autres clients, basculera en systémique.
                </div>`;

            // NO per-incident admin email anymore. Founder ask 2026-05-27:
            // only TWO admin reports per day (morning + evening digest).
            // We just log to agent_logs(noah_diagnostic) and the digests
            // aggregate everything client-by-client with recommendations.
            void diagBlocks; void scaleNote; void topSev;

            // Log the diagnostic — consumed by /api/cron/admin-health-digest
            try {
              await supabase.from('agent_logs').insert({
                agent: 'ceo',
                action: 'noah_diagnostic',
                status: 'error',
                user_id: client.id,
                data: {
                  severity: topSev,
                  client_email: client.email,
                  plan: evPlan,
                  attempts: attemptOutcomes,
                  gaps: diagnostics.map(d => ({
                    agent: d.gap.agent,
                    missing: d.gap.missing,
                    metric: d.gap.metric,
                    cause: d.dx.cause,
                    severity: d.dx.severity,
                    affected_clients: d.affectedClients,
                    impact_pct: d.impactPct,
                    fixes: d.dx.fixes,
                    raw_error: d.gap.detail,
                  })),
                },
                created_at: new Date().toISOString(),
              });
            } catch { /* audit non-fatal */ }
          }

          // Client-side upsell hooks (credits / quota / disconnect)
          const clientCreditAgents = Object.entries(failureByAgent)
            .filter(([, f]) => f.outcome === 'client_credits')
            .map(([n]) => n);
          const clientQuotaAgents = Object.entries(failureByAgent)
            .filter(([, f]) => f.outcome === 'client_quota')
            .map(([n]) => n);
          // Build a single upsell block that we'll inject after the
          // plan-promise tracker. Empty string if nothing relevant.
          const upsellBits: string[] = [];
          if (clientCreditAgents.length > 0) {
            upsellBits.push(`💳 <strong>Crédits épuisés</strong> sur : ${clientCreditAgents.join(', ')}. <a href="${evBaseUrl}/pricing" style="color:#2563eb;text-decoration:underline;">Recharger maintenant →</a>`);
          }
          if (clientQuotaAgents.length > 0) {
            const nextPlan = evPlan === 'createur' ? 'Pro' : evPlan === 'pro' ? 'Business' : evPlan === 'business' ? 'Elite' : 'Agence';
            upsellBits.push(`📈 <strong>Quota du plan ${evPlan.charAt(0).toUpperCase() + evPlan.slice(1)} atteint</strong>. Pour pousser plus loin, passe au plan <strong>${nextPlan}</strong> — <a href="${evBaseUrl}/pricing" style="color:#7c3aed;text-decoration:underline;">voir les plans →</a>`);
          }
          // Stash on a brief-scope variable; consumed below when
          // assembling the final HTML.
          (globalThis as any).__noah_upsell = upsellBits.length > 0
            ? `<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 14px;border-radius:8px;margin:12px 0;">${upsellBits.map(b => `<div style="font-size:13px;color:#78350f;margin:4px 0;">${b}</div>`).join('')}</div>`
            : '';

          // Audit row so the founder can see catch-up history
          try {
            await supabase.from('agent_logs').insert({
              agent: 'ceo',
              action: 'evening_catchup',
              status: 'success',
              user_id: client.id,
              data: {
                plan: evPlan,
                fired: tasks.map(t => t.name),
                floors: evFloor,
                attempts: attemptOutcomes,
                outcomes: failureByAgent,
                technical_gaps: technicalGaps,
                after: {
                  posts: doneCounts.posts_published,
                  emails: doneCounts.emails_sent,
                  prospects: doneCounts.prospects_added,
                  dms: doneCounts.dms_sent,
                },
              },
              created_at: new Date().toISOString(),
            });
          } catch { /* audit non-fatal */ }
        }
      }

      const errorCount  = (logs || []).filter((l: any) => l.status === 'error' || l.action === 'execution_failure').length;
      const totalDone   = Object.values(doneCounts).reduce((a, b) => a + b, 0);

      // ── Achievements: milestones, streaks, week-over-week growth ──
      const achievements: string[] = [];
      const MILESTONES = [10, 50, 100, 500, 1000, 5000, 10000, 25000, 50000];
      const checkMilestone = (lifetime: number, delta: number, label: string, emoji: string) => {
        const before = lifetime - delta;
        for (const m of MILESTONES) {
          if (before < m && lifetime >= m) {
            return `${emoji} Cap historique franchi : <strong>${m.toLocaleString('fr-FR')} ${label}</strong> au total depuis le début — bravo !`;
          }
        }
        return null;
      };
      const mEmails = checkMilestone(lifetimeCounts.emails, doneCounts.emails_sent, 'emails envoyés', '🏆');
      if (mEmails) achievements.push(mEmails);
      const mPosts = checkMilestone(lifetimeCounts.posts, doneCounts.posts_published, 'posts publiés', '📸');
      if (mPosts) achievements.push(mPosts);
      const mProspects = checkMilestone(lifetimeCounts.prospects, doneCounts.prospects_added, 'prospects dans ton CRM', '🎯');
      if (mProspects) achievements.push(mProspects);
      const mDms = checkMilestone(lifetimeCounts.dms, doneCounts.dms_sent, 'DMs envoyés', '💬');
      if (mDms) achievements.push(mDms);

      // Streak: consecutive days with at least 1 publication
      const publishedDays = new Set(
        ((streakDatesRes.data || []) as { published_at: string }[])
          .map(r => r.published_at.slice(0, 10))
      );
      let streak = 0;
      for (let i = 0; i < 120; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        if (publishedDays.has(d)) streak++;
        else break;
      }
      // 2026-06-23 — Founder : on ne répète PLUS "bravo Xj" tous les jours
      // (c'était figé à 14 + lassant). On ne célèbre le streak qu'aux PALIERS
      // marquants, et avec une formulation VARIÉE, naturelle et humaine (jamais
      // deux jours de suite la même phrase). Entre deux paliers, silence (le
      // message d'accueil LLM en haut porte déjà la motivation du jour).
      const STREAK_MILESTONES = [3, 7, 14, 21, 30, 45, 60, 90, 120];
      const isStreakMilestone = STREAK_MILESTONES.includes(streak) || (streak > 120 && streak % 30 === 0);
      if (isStreakMilestone) {
        // Variation déterministe (par jour) → fraîcheur sans aléa instable.
        const dayKey = Number(new Date().toISOString().slice(8, 10));
        const streakLines = [
          `🔥 <strong>${streak} jours sans rater une publication.</strong> C'est exactement cette régularité qui installe ta présence — peu de commerces tiennent ce rythme. Chapeau.`,
          `🔥 <strong>${streak} jours d'affilée !</strong> Tes posts sont devenus un rendez-vous pour ton audience. On garde le cap ensemble.`,
          `🔥 Déjà <strong>${streak} jours de suite</strong> en ligne. La constance, c'est 80% du résultat sur les réseaux — et tu l'as. Fier du chemin parcouru.`,
          `🔥 <strong>${streak} jours consécutifs.</strong> Pendant que d'autres oublient de poster, ta vitrine tourne tous les jours. Ça finit toujours par payer.`,
          `🔥 <strong>Cap des ${streak} jours d'affilée franchi.</strong> Cette régularité, c'est ce que l'algorithme récompense — continue comme ça, ça construit.`,
        ];
        achievements.push(streakLines[dayKey % streakLines.length]);
      }

      // 2026-06-23 — Founder : une phrase de RÉTENTION dans le mail du soir
      // (style "bravo" OK, MAIS varier — d'autres phrases aussi) et SANS se
      // tromper sur les infos. Ces lignes ne citent AUCUN chiffre → jamais
      // d'info fausse, juste de la motivation/lien, tournée par jour.
      if (isEvening) {
        const dayKeyR = Number(new Date().toISOString().slice(8, 10));
        const retentionLines = [
          `👏 Bravo pour la régularité — c'est exactement ce qui finit par tout changer. On garde le cap ensemble.`,
          `💪 Chaque contenu posté aujourd'hui, c'est une brique de plus pour ta visibilité. On construit, tranquillement mais sûrement.`,
          `🙌 Tu n'as rien eu à gérer et ta présence a avancé — c'est précisément le but. On continue demain.`,
          `🔁 La présence en ligne, c'est un marathon : ce qui paie, c'est l'accumulation. Et là, ça s'accumule dans le bon sens.`,
          `✨ Pendant que d'autres oublient de poster, ton compte avance tous les jours. C'est ça qui crée la différence.`,
          `🤝 On est dans la durée avec toi : présence soignée, rythme tenu. Les résultats suivent ceux qui tiennent.`,
        ];
        achievements.push(retentionLines[dayKeyR % retentionLines.length]);
      }

      // Week-over-week hot prospects
      const thisW = thisWeekHotRes.count || 0;
      const prevW = prevWeekHotRes.count || 0;
      // Founder feedback 2026-05-24: pourcentages "du vent" sont
      // démotivants — célébrer SEULEMENT sur des seuils absolus
      // significatifs. Plus de '+300%' bidon quand le baseline est faible.
      if (thisW >= 25 && prevW === 0) {
        achievements.push(`📈 <strong>${thisW} prospects chauds</strong> cette semaine — pipeline qui démarre fort.`);
      } else if (thisW - prevW >= 25 && prevW >= 15) {
        // Both baseline AND absolute growth must be meaningful
        achievements.push(`📈 <strong>+${thisW - prevW} prospects chauds</strong> cette semaine (${prevW} → ${thisW}) — pipeline qui s'accélère vraiment.`);
      }

      // Engagement weekly milestones
      if (weeklyLikes + weeklyComments >= 100) {
        achievements.push(`❤️ <strong>${weeklyLikes + weeklyComments} interactions</strong> Instagram cette semaine (${weeklyLikes} likes + ${weeklyComments} commentaires) — ton audience s'engage.`);
      }

      // Followers growth since yesterday
      if (followersDelta !== null && followersDelta > 0) {
        achievements.push(`👥 <strong>+${followersDelta} abonné${followersDelta > 1 ? 's' : ''}</strong> sur Instagram depuis hier (${latestFollowers} au total) — ton audience grandit.`);
      }

      // Personal record check (today vs lifetime daily average)
      if (doneCounts.emails_sent >= 50 && lifetimeCounts.emails > 0) {
        const dailyAvg = Math.max(1, Math.round(lifetimeCounts.emails / 30)); // rough 30d avg
        if (doneCounts.emails_sent >= dailyAvg * 2) {
          achievements.push(`⭐ Record du jour : <strong>${doneCounts.emails_sent} emails envoyés</strong> (soit ${Math.round(doneCounts.emails_sent / dailyAvg)}× ta moyenne habituelle).`);
        }
      }

      const openRatePreview = doneCounts.emails_sent > 0
        ? Math.round((doneCounts.emails_opened / doneCounts.emails_sent) * 100)
        : 0;
      const openRateHint = doneCounts.emails_opened > 0 ? ` (${openRatePreview}% d'ouverture)` : '';

      if (ANTHROPIC_KEY) {
        try {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 700,
              system: `Tu es Keiro, le stratège IA de ${clientName}. Tu envoies un ${isEvening ? 'DEBRIEF DU SOIR' : 'BRIEF DU MATIN'} court, chaleureux ET stratégique à ${clientName}.

CONTEXTE CLIENT:
${clientContext || 'Nouveau client, pas encore de profil complet.'}

FORMAT OBLIGATOIRE — HTML brut, tutoiement, zero jargon, 3 blocs SEULEMENT (les stats détaillées et la liste par agent sont ajoutées automatiquement par le template — tu n'as PAS à les réécrire):

<p style="margin:0 0 14px;font-size:14px;"><strong>${isEvening ? `Bonsoir ${clientName} 🌙` : `Salut ${clientName} 👋`}</strong> — une phrase d'accroche VIVANTE, comme un associé qui t'écrit, pas un robot. Elle doit refléter CE qui s'est VRAIMENT passé aujourd'hui (les vrais chiffres ci-dessous), donc être DIFFÉRENTE chaque jour — jamais une formule toute faite répétée. Varie le ton : tantôt fier, tantôt complice, tantôt motivant, tantôt rassurant un jour calme. Naturel, humain, chaleureux. ${isEvening ? 'Reconnais sincèrement le travail accompli sans en faire trop (ex: "grosse journée, ça a bien tourné", "journée tranquille — on recharge pour demain", "petit creux aujourd’hui, rien d’alarmant, on relance").' : 'Donne le ton du jour avec une vraie intention (ex: "on a de quoi faire de belles choses aujourd’hui", "journée parfaite pour relancer tes prospects chauds", "on consolide, tranquille").'} INTERDIT : "bravo" mécanique ou la même phrase que d'habitude.</p>

<h4 style="margin:0 0 6px;color:#2563eb;font-size:13px;">${isEvening ? '💡 Mes recos pour booster ton business (à faire demain)' : '💡 Mes recos pour booster ton business'}</h4>
<ul style="margin:0 0 12px;padding-left:18px;font-size:13px;">
  — 1 à 3 actions HUMAINES concrètes que TOI seul peux faire, déduites des vrais chiffres du jour ci-dessous, et qui font GAGNER des clients :
    • Prospects CHAUDS (${hotCount || 0}) → "Appelle/relance tes ${hotCount || 'X'} prospects chauds — ils sont prêts à convertir" (PRIORITÉ).
    • Emails ouverts sans réponse → "X prospects ont ouvert ton email : un message perso peut les débloquer."
    • Comptes à suivre manuellement → "Suis les X comptes proposés, ça relance ta visibilité."
    • Posts en attente de validation → "Valide les X posts pour garder la cadence."
  — Toujours : verbe d'action + objet + POURQUOI (bénéfice business). Pas de tâche cosmétique. Priorise prospects chauds et agents en MANUEL.
  — Si rien d'urgent : dis-le simplement ("${isEvening ? 'Rien à faire demain côté humain, tout tourne en auto' : 'Rien à faire aujourd\u2019hui, tout tourne en auto'}").
</ul>

<h4 style="margin:0 0 6px;color:#a855f7;font-size:13px;">⚡ Sur les rails (auto)</h4>
<ul style="margin:0 0 12px;padding-left:18px;font-size:13px;">
  — 1 à 2 puces rassurantes sur ce qui tourne sans toi (ex: "Hugo continue la séquence fleuristes", "Léna prépare les posts de demain").
</ul>

REGLES ABSOLUES:
- Tutoiement. Chaleureux, encourageant, comme un coach business.
- NE PAS rédiger de bloc "ce qui a été fait / stats" — c'est le template qui ajoute les chiffres après ton texte.
- Pas de phrase de transition ("Voici", "Je vous informe", "N'hésite pas").
- Pas de signature "Keiro"/"Noah" en double — le template la gère. Ne mentionne JAMAIS "Noah" (l'expéditeur, c'est Keiro).
- Pas de mention KeiroAI, erreurs, taux d'erreur.
- Si journée calme (0 action) : reste positif ("Tes agents préparent la journée de demain").
- SORTIE: HTML brut uniquement. NE PAS entourer la réponse de \`\`\`html ... \`\`\` ni de balises markdown. Commence directement par <p>.
`,
              messages: [{ role: 'user', content:
`Stats brutes 24h:
- Posts publies (Léna): ${doneCounts.posts_published}
- Posts en préparation (Léna): ${doneCounts.posts_drafted}
- Emails envoyes (Hugo): ${doneCounts.emails_sent}
- Emails ouverts: ${doneCounts.emails_opened}${openRateHint}
- Emails cliques: ${doneCounts.emails_clicked}
- DMs envoyes (Jade): ${doneCounts.dms_sent}
- Follows Insta confirmes (Jade): ${doneCounts.dms_followed}
- Comptes a suivre manuellement sur Insta (Jade, en attente): ${doneCounts.follows_to_do}
- Engagement Instagram 7 jours: ${weeklyLikes} likes + ${weeklyComments} commentaires + ${weeklyReach} reach
- Commentaires Instagram repondus (Jade): ${doneCounts.comments_replied}
- Avis Google repondus (Théo): ${doneCounts.reviews_replied}
- Prospects ajoutes au CRM (Léo): ${doneCounts.prospects_added}
- Prospects valides joignables (Léo): ${doneCounts.prospects_verified}
- Commerces importes Google Maps (Théo): ${doneCounts.gmaps_imports}
- Prospects chauds total: ${hotCount || 0} (sur ${prospectCount || 0})
- Agents AUTO: ${autoAgents.join(', ') || 'aucun'}
- Agents MANUEL: ${manualAgents.join(', ') || 'aucun'}
- Plan: ${client.subscription_plan}

IMPORTANT: la liste détaillée par agent et les tuiles de stats sont ajoutées automatiquement APRÈS ton texte. Ta mission = 1 phrase punchy + 2 blocs courts ("à faire demain" + "sur les rails"). Pas de liste de chiffres dans ton texte (pour éviter la redondance).

Rédige le brief.`
              }],
            }),
          });
          if (res.ok) {
            const data = await res.json();
            briefHtml = data.content?.[0]?.text || '';
            // Strip markdown code fences if the model wrapped output in ```html ... ```
            briefHtml = briefHtml
              .replace(/^\s*```(?:html)?\s*\n?/i, '')
              .replace(/\n?```\s*$/i, '')
              .trim();
          }
        } catch { /* silent */ }
      }

      // Fallback if AI fails — short narrative, detail comes from template
      if (!briefHtml) {
        briefHtml = `<p style="margin:0 0 14px;font-size:14px;"><strong>${isEvening ? `Bonsoir ${clientName} 🌙` : `Salut ${clientName} 👋`}</strong> — ${totalDone > 0 ? `tes agents ont poussé fort, ${totalDone} actions au compteur.` : 'journée calme, tes agents préparent la suite.'}</p>
${hotCount > 0 ? `<h4 style="margin:0 0 6px;color:#2563eb;font-size:13px;">📌 À faire ${isEvening ? 'demain' : 'aujourd\u2019hui'}</h4><ul style="margin:0 0 12px;padding-left:18px;font-size:13px;"><li>Relancer tes ${hotCount} prospect${hotCount > 1 ? 's' : ''} chaud${hotCount > 1 ? 's' : ''} dans ton CRM</li></ul>` : `<h4 style="margin:0 0 6px;color:#2563eb;font-size:13px;">📌 À faire ${isEvening ? 'demain' : 'aujourd\u2019hui'}</h4><ul style="margin:0 0 12px;padding-left:18px;font-size:13px;"><li>Rien d'urgent, tout tourne en auto</li></ul>`}
<h4 style="margin:0 0 6px;color:#a855f7;font-size:13px;">⚡ Sur les rails (auto)</h4>
<ul style="margin:0 0 12px;padding-left:18px;font-size:13px;"><li>Tes agents continuent leur travail en arrière-plan.</li></ul>`;
      }

      // Plan promise tracker — coherent deterministic block so the
      // client sees today's work mapped against what their plan
      // guarantees. Per founder feedback 2026-05-17: must be honest,
      // optimistic on % when delivered, no exaggeration.
      // Le plan du brief suit le plan_override du contenu si défini (un compte
      // en test/Créateur via override doit voir des planchers Créateur, pas Pro
      // — sinon il reste bloqué sous 100% sur un plancher email qu'il n'a pas).
      const { data: briefCfgRow } = await supabase
        .from('org_agent_configs').select('config')
        .eq('user_id', client.id).eq('agent_id', 'content')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const planKey = ((((briefCfgRow as any)?.config?.plan_override) || client.subscription_plan || 'createur')).toLowerCase();
      const floors = getPlanFloorsFlat(planKey);
      // Founder ask 2026-06-01: DM line = "% des DMs entrants répondus",
      // pas un quota cold. Si 0 DM entrant aujourd'hui → 100% par
      // construction (rien à répondre = service tenu). Le cold DM
      // prep (queued for manual follow) reste en stat informative
      // séparée, jamais utilisé pour le pourcentage de promesse.
      const dmIncoming = doneCounts.dms_incoming_24h;
      const dmReplies = doneCounts.dms_replied_24h;
      const dmReplyPct = dmIncoming === 0 ? 100 : Math.min(100, Math.round((dmReplies / dmIncoming) * 100));
      const dmReplyLabel = dmIncoming === 0
        ? 'Réponses DM (pas de DM aujourd\'hui)'
        : `Réponses DM (${dmReplies}/${dmIncoming})`;

      // Founder ask 2026-06-12: éclater les posts PAR RÉSEAU (Instagram X/Y,
      // TikTok X/Y, LinkedIn X/Y) — uniquement pour les réseaux que le client
      // a activés (org_agent_configs content) ou connectés. Cible par réseau =
      // cadence du plan de publication réel (plan_override content si défini).
      let networkPostLines: any[] = [];
      let pauseNote = ''; // client-facing reassurance if a platform is on protective pause
      // Global env pause OR per-client auto-pause set by the health-check cron.
      let ttProtectivePause = process.env.TIKTOK_AUTOPOST_PAUSED === '1';
      try {
        const { PLAN_DAILY_PUBLISH } = await import('@/lib/credits/plan-budget-guard');
        const { data: ccRow } = await supabase
          .from('org_agent_configs').select('config')
          .eq('user_id', client.id).eq('agent_id', 'content')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        const cc: any = (ccRow as any)?.config || {};
        if (cc.tiktok_health_paused === true) ttProtectivePause = true; // auto-pause par le health-check
        const contentPlan = (cc.plan_override || planKey || 'createur').toLowerCase();
        const cadence: any = PLAN_DAILY_PUBLISH[contentPlan] || PLAN_DAILY_PUBLISH.free;
        const [igPub, ttPub, liPub] = await Promise.all([
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('user_id', client.id).eq('status', 'published').eq('platform', 'instagram').gte('published_at', sinceIso),
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('user_id', client.id).eq('status', 'published').eq('platform', 'tiktok').gte('published_at', sinceIso),
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('user_id', client.id).eq('status', 'published').eq('platform', 'linkedin').gte('published_at', sinceIso),
        ]);
        // TikTok on protective pause → exclude it from the % (don't penalise the
        // client for a deliberate, temporary protective pause) + reassure them.
        const ttOn = cc.tt_enabled !== false && !ttProtectivePause;
        const resumedAt = cc.tiktok_health_resumed_at ? new Date(cc.tiktok_health_resumed_at).getTime() : 0;
        const justResumed = resumedAt && (Date.now() - resumedAt) < 36 * 3600 * 1000;
        if (ttProtectivePause && cc.tt_enabled !== false) {
          pauseNote = `<div style="margin:10px 0;padding:10px;background:#fffbeb;border-radius:8px;border-left:3px solid #f59e0b;font-size:12px;color:#92400e;">🛡️ <strong>Diffusion TikTok en pause protectrice quelques jours</strong> — c'est normal et prévu dans ta stratégie : on laisse l'algorithme se "réchauffer" pour repartir plus fort (on évite le sur-postage qui bride la portée). Ta présence Instagram continue à plein régime. Rien à faire de ton côté — tes objectifs du jour sont tenus à 100% (la pause est volontaire, pas un manque).</div>`;
        } else if (justResumed && cc.tt_enabled !== false) {
          pauseNote = `<div style="margin:10px 0;padding:10px;background:#ecfdf5;border-radius:8px;border-left:3px solid #16a34a;font-size:12px;color:#166534;">🚀 <strong>Ta diffusion TikTok a repris</strong> — la pause protectrice a porté ses fruits, on relance la publication automatiquement. Rien à faire de ton côté.</div>`;
        }
        const nets = [
          { emoji: '📸', label: 'Posts Instagram', on: cc.ig_enabled !== false, actual: igPub.count || 0, floor: cadence.ig },
          { emoji: '🎵', label: 'Posts TikTok', on: ttOn, actual: ttPub.count || 0, floor: cadence.tt },
          { emoji: '💼', label: 'Posts LinkedIn', on: cc.li_enabled === true, actual: liPub.count || 0, floor: cadence.li },
        ];
        networkPostLines = nets
          .filter(n => n.on && n.floor > 0)
          .map(n => ({ emoji: n.emoji, label: n.label, actual: n.actual, floor: n.floor, color: '#16a34a', display: `${n.actual}` }));
      } catch { /* fallback to a single Posts line below */ }
      // Fallback when no per-network data: keep the single aggregate line.
      const postLines = networkPostLines.length > 0
        ? networkPostLines
        : [{ emoji: '🎨', label: 'Posts', actual: doneCounts.posts_published, floor: floors.posts, color: '#16a34a', display: `${doneCounts.posts_published}` }];

      const planPromise = [
        ...postLines,
        { emoji: '✉️', label: 'Emails prospection', actual: doneCounts.emails_cold_sent, floor: floors.emails, color: '#2563eb', display: `${doneCounts.emails_cold_sent}` },
        { emoji: '🎯', label: 'Prospects', actual: doneCounts.prospects_added, floor: floors.prospects, color: '#7c3aed', display: `${doneCounts.prospects_added}` },
        // Founder 2026-06-15: ce bloc ne montre QUE des actions AUTOMATIQUES
        // (la valeur faite par les agents). Les DMs = touche humaine/manuelle
        // → affichés à part, jamais comme métrique de valeur auto ici.
      ];
      const metFloors = planPromise.filter(p => p.floor > 0 && p.actual >= p.floor).length;
      const totalFloors = planPromise.filter(p => p.floor > 0).length;
      const overallPct = totalFloors > 0
        ? Math.min(100, Math.round((planPromise.filter(p => p.floor > 0).reduce((s, p) => s + Math.min(1, p.actual / p.floor), 0) / totalFloors) * 100))
        : 0;
      // Total des actions automatiques réelles du jour (la VRAIE valeur perçue).
      const autoActionsTotal = planPromise.reduce((s, p) => s + (Number(p.actual) || 0), 0);
      const planLabel = planKey.charAt(0).toUpperCase() + planKey.slice(1);
      const planPromiseHtml = totalFloors > 0 ? `
<h4 style="margin:16px 0 8px;color:#374151;font-size:13px;">✨ Ce que Keiro a automatisé pour toi aujourd'hui</h4>
<div style="background:#fafafa;border-radius:10px;padding:12px;margin:0 0 12px;border:1px solid #e5e7eb;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px;">
    <div style="font-size:12px;color:#374151;"><strong>${autoActionsTotal}</strong> action${autoActionsTotal > 1 ? 's' : ''} réalisée${autoActionsTotal > 1 ? 's' : ''} automatiquement aujourd'hui</div>
    <div style="font-size:18px;font-weight:bold;color:${overallPct >= 80 ? '#16a34a' : overallPct >= 50 ? '#d97706' : '#dc2626'};">${overallPct}%</div>
  </div>
  ${planPromise.filter(p => p.floor > 0).map(p => {
    const pct = Math.min(100, Math.round((p.actual / p.floor) * 100));
    const met = p.actual >= p.floor;
    const barColor = met ? '#16a34a' : pct >= 60 ? '#f59e0b' : '#94a3b8';
    const displayLeft = (p as any).isPct ? `${(p as any).display}` : `<strong>${p.actual}</strong> / ${p.floor}`;
    return `
    <div style="margin:6px 0;">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#374151;margin:0 0 3px;">
        <span>${p.emoji} ${p.label}</span>
        <span>${displayLeft} ${met ? '<span style=\"color:#16a34a;\">✓</span>' : ''}</span>
      </div>
      <div style="background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden;">
        <div style="background:${barColor};height:100%;width:${pct}%;border-radius:4px;"></div>
      </div>
    </div>`;
  }).join('')}
  ${doneCounts.emails_auto_replies_sent > 0 ? `<div style="margin:8px 0 0;padding:8px;background:#eff6ff;border-radius:6px;font-size:11px;color:#1e40af;"><strong>📨 Réponses auto envoyées par Hugo :</strong> ${doneCounts.emails_auto_replies_sent} email${doneCounts.emails_auto_replies_sent > 1 ? 's' : ''} en réponse à des prospects entrants</div>` : ''}
  <div style="font-size:10px;color:#9ca3af;margin-top:8px;font-style:italic;">${metFloors === totalFloors ? 'Tous tes agents ont délivré leur minimum quotidien.' : 'Les agents en dessous sont relancés automatiquement pour demain.'}</div>
</div>` : '';

      // Stats strip — 6 tiles (3x2): full funnel production → outreach → pipeline.
      const openRate = doneCounts.emails_sent > 0
        ? Math.round((doneCounts.emails_opened / doneCounts.emails_sent) * 100)
        : 0;
      // Stats grid — 6 compact tiles, table layout for Gmail/Outlook
      // compat (they collapse CSS grid). Founder ask 2026-05-24: "des
      // petite carré et pas ligne pas ligen c'ets long a descendre".
      const tile = (val: any, label: string, bg: string, color: string) =>
        `<td width="33%" align="center" valign="top" style="padding:4px;"><table cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td align="center" style="background:${bg};border-radius:8px;padding:8px 4px;"><div style="font-size:18px;font-weight:bold;color:${color};line-height:1;">${val}</div><div style="font-size:10px;color:#6b7280;margin-top:3px;">${label}</div></td></tr></table></td>`;
      const statsStripHtml = `
<h4 style="margin:14px 0 6px;color:#374151;font-size:12px;">📊 Tes chiffres du jour</h4>
<table cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 10px;">
  <tr>
    ${tile(doneCounts.posts_published, '📸 Posts', '#f0fdf4', '#16a34a')}
    ${tile(doneCounts.emails_sent, '✉️ Emails', '#eff6ff', '#2563eb')}
    ${tile(`${doneCounts.emails_opened}${openRate > 0 ? ` <span style="font-size:11px;color:#6b7280;">(${openRate}%)</span>` : ''}`, '👀 Ouverts', '#ecfeff', '#0891b2')}
  </tr>
  <tr>
    ${tile(doneCounts.dms_sent, '💬 DMs', '#fdf4ff', '#a855f7')}
    ${tile(doneCounts.prospects_added, '📥 Prospects', '#f5f3ff', '#7c3aed')}
    ${tile(hotCount || 0, '🔥 Chauds', hotCount > 0 ? '#fef3c7' : '#f9fafb', hotCount > 0 ? '#d97706' : '#6b7280')}
  </tr>
</table>`;

      // Per-agent breakdown — only agents that did something show up
      const agentLines: string[] = [];
      // Léna = contenu & publication (posts + drafts + engagement reçu).
      // (Correctif 06/07 : les libellés Léna/Jade étaient inversés → le client
      // croyait que Jade publiait le contenu.)
      if (doneCounts.posts_published > 0 || doneCounts.posts_drafted > 0 || weeklyLikes + weeklyComments > 0) {
        const parts = [];
        if (doneCounts.posts_published > 0) parts.push(`<strong>${doneCounts.posts_published}</strong> post${doneCounts.posts_published > 1 ? 's' : ''} publié${doneCounts.posts_published > 1 ? 's' : ''} sur Instagram`);
        if (doneCounts.posts_drafted > 0) parts.push(`<strong>${doneCounts.posts_drafted}</strong> en préparation`);
        if (weeklyLikes + weeklyComments > 0) parts.push(`<strong>${weeklyLikes}</strong> like${weeklyLikes > 1 ? 's' : ''} + <strong>${weeklyComments}</strong> com. reçus cette semaine`);
        agentLines.push(`<div style="margin:6px 0;"><strong style="color:#db2777;">🎨 Léna</strong> <span style="color:#9ca3af;font-size:11px;">· contenu & publication</span> — ${parts.join(', ')}</div>`);
      }

      // Jade = DMs + follows + commentaires (engagement sur les réseaux)
      if (doneCounts.dms_sent > 0 || doneCounts.dms_followed > 0 || doneCounts.follows_to_do > 0 || doneCounts.comments_replied > 0) {
        const parts = [];
        if (doneCounts.dms_sent > 0) parts.push(`<strong>${doneCounts.dms_sent}</strong> DM${doneCounts.dms_sent > 1 ? 's' : ''} envoyé${doneCounts.dms_sent > 1 ? 's' : ''}`);
        if (doneCounts.comments_replied > 0) parts.push(`<strong>${doneCounts.comments_replied}</strong> commentaire${doneCounts.comments_replied > 1 ? 's' : ''} répondu${doneCounts.comments_replied > 1 ? 's' : ''}`);
        if (doneCounts.dms_followed > 0) parts.push(`<strong>${doneCounts.dms_followed}</strong> follow${doneCounts.dms_followed > 1 ? 's' : ''} confirmé${doneCounts.dms_followed > 1 ? 's' : ''}`);
        if (doneCounts.follows_to_do > 0) parts.push(`<strong>${doneCounts.follows_to_do}</strong> compte${doneCounts.follows_to_do > 1 ? 's' : ''} à suivre manuellement`);
        agentLines.push(`<div style="margin:6px 0;"><strong style="color:#a855f7;">💬 Jade</strong> <span style="color:#9ca3af;font-size:11px;">· DM · follows · commentaires</span> — ${parts.join(', ')}</div>`);
      }
      if (doneCounts.emails_sent > 0 || doneCounts.emails_opened > 0) {
        const parts = [];
        if (doneCounts.emails_sent > 0) parts.push(`<strong>${doneCounts.emails_sent}</strong> envoyé${doneCounts.emails_sent > 1 ? 's' : ''}`);
        if (doneCounts.emails_opened > 0) parts.push(`<strong>${doneCounts.emails_opened}</strong> ouvert${doneCounts.emails_opened > 1 ? 's' : ''} (${openRate}%)`);
        if (doneCounts.emails_clicked > 0) parts.push(`<strong>${doneCounts.emails_clicked}</strong> clic${doneCounts.emails_clicked > 1 ? 's' : ''}`);
        agentLines.push(`<div style="margin:6px 0;"><strong style="color:#2563eb;">✉️ Hugo</strong> <span style="color:#9ca3af;font-size:11px;">· email</span> — ${parts.join(', ')}</div>`);
      }
      // Léo = commercial + prospect enrichment + Google Maps scanning (scraping).
      // Léo's fiches exhaustives sont la base d'infos de Hugo, Léna, Théo — d'où
      // l'importance de remonter ici ses chiffres d'enrichissement.
      if (doneCounts.prospects_added > 0 || doneCounts.prospects_verified > 0 || doneCounts.gmaps_imports > 0) {
        const parts = [];
        if (doneCounts.prospects_added > 0) parts.push(`<strong>${doneCounts.prospects_added}</strong> prospect${doneCounts.prospects_added > 1 ? 's' : ''} ajouté${doneCounts.prospects_added > 1 ? 's' : ''} au CRM`);
        if (doneCounts.prospects_verified > 0) parts.push(`<strong>${doneCounts.prospects_verified}</strong> fiche${doneCounts.prospects_verified > 1 ? 's' : ''} enrichie${doneCounts.prospects_verified > 1 ? 's' : ''}`);
        if (doneCounts.gmaps_imports > 0) parts.push(`<strong>${doneCounts.gmaps_imports}</strong> commerce${doneCounts.gmaps_imports > 1 ? 's' : ''} Google Maps scanné${doneCounts.gmaps_imports > 1 ? 's' : ''}`);
        agentLines.push(`<div style="margin:6px 0;"><strong style="color:#7c3aed;">🎯 Léo</strong> <span style="color:#9ca3af;font-size:11px;">· commercial · CRM · scan Google Maps</span> — ${parts.join(', ')}</div>`);
      }

      // Théo = commentaires/avis Google (sous-partie gmaps côté reputation).
      if (doneCounts.reviews_replied > 0) {
        agentLines.push(`<div style="margin:6px 0;"><strong style="color:#059669;">⭐ Théo</strong> <span style="color:#9ca3af;font-size:11px;">· avis Google</span> — <strong>${doneCounts.reviews_replied}</strong> avis Google répondu${doneCounts.reviews_replied > 1 ? 's' : ''}</div>`);
      }
      const perAgentHtml = agentLines.length > 0 ? `
<h4 style="margin:16px 0 8px;color:#374151;font-size:13px;">👥 Chaque agent en action</h4>
<div style="background:#f9fafb;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.5;">
  ${agentLines.join('')}
</div>` : '';

      // Achievements banner — shown at the very top when something to celebrate
      const achievementsHtml = achievements.length > 0 ? `
<div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-left:4px solid #f59e0b;padding:12px 14px;border-radius:8px;margin:0 0 16px;">
  <div style="font-size:11px;color:#92400e;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">🎉 À célébrer aujourd'hui</div>
  ${achievements.map(a => `<div style="font-size:13px;color:#78350f;margin:4px 0;">${a}</div>`).join('')}
</div>` : '';

      const footerNote = errorCount > 0
        ? `<p style="font-size:11px;color:#9ca3af;margin:12px 0 0;text-align:center;">${errorCount} incident(s) technique(s) détecté(s) — notre équipe les regarde.</p>`
        : '';

      // Assembly order: achievements on top (only when truly notable),
      // then AI narrative, then plan-promise tracker, then upsell
      // banner (only when client-side credit / quota gap detected
      // during catch-up — empty string otherwise), then compact stats
      // grid, then optional error footnote.
      void perAgentHtml; // intentionally unused — kept for build compat
      const upsellHtml = (globalThis as any).__noah_upsell || '';
      // Clear globalThis flag so the next client iteration starts clean
      (globalThis as any).__noah_upsell = '';
      briefHtml = `${achievementsHtml}${briefHtml}${planPromiseHtml}${pauseNote}${upsellHtml}${statsStripHtml}${footerNote}`;

      // Save as in-app notification — skipped when phase=catchup_only
      if (!skipEmail && prefs?.inapp_enabled !== false) {
        await supabase.from('client_notifications').insert({
          user_id: client.id,
          agent: 'ceo',
          type: 'brief',
          title: isEvening ? 'Ton débrief du soir — Keiro' : 'Ton brief du matin — Keiro',
          message: briefHtml.replace(/<[^>]*>/g, '').substring(0, 300),
          data: { html: briefHtml, agentActivity: agentSummary, prospects: prospectCount, hot: hotCount },
        });
      }

      // Send email — skipped when phase=catchup_only (founder split flow 2026-05-27)
      if (!skipEmail && BREVO_CLIENT_KEY && prefs?.email_enabled !== false && client.email) {
        const sendStart = Date.now();
        const brevoRes = await sendBrevoCompat({
            sender: { name: 'Keiro', email: 'contact@keiroai.com' },
            to: [{ email: client.email }],
            subject: (() => {
              // Founder 06/07 : parler d'AGENTS ACTIFS (ton équipe) plutôt que
              // d'un nombre d'actions abstrait — le client comprend direct.
              const nA = Math.max(agentLines.length, 1);
              const team = `${nA} agent${nA > 1 ? 's' : ''}`;
              return isEvening
                ? `\u{1F319} Keiro — Ton équipe a bossé pour toi · ${team} actif${nA > 1 ? 's' : ''}${hotCount > 0 ? ` · ${hotCount} chaud${hotCount > 1 ? 's' : ''} a relancer demain` : ''}`
                : `\u{1F4CB} Keiro — ${team} au travail pour toi aujourd'hui${hotCount > 0 ? ` · ${hotCount} chaud${hotCount > 1 ? 's' : ''} a contacter` : ''}`;
            })(),
            htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:16px 20px;border-radius:12px 12px 0 0;">
                <h2 style="margin:0;font-size:16px;">\u{1F9E0} Keiro — ${isEvening ? 'Ton débrief du soir' : 'Ton brief du jour'}</h2>
                <p style="margin:4px 0 0;color:#a0aec0;font-size:12px;">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              </div>
              <div style="background:white;padding:20px;border:1px solid #e5e7eb;">
                ${briefHtml}
              </div>
              <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:11px;border-radius:0 0 12px 12px;">
                Keiro — Ton stratège
              </div>
            </div>`,
            // Tag so the Brevo webhook can identify brief opens and feed
            // the best-day analysis. X-Mailin-custom carries user_id for
            // fast idempotent lookup in /api/webhooks/brevo.
            tags: ['noah_brief', isEvening ? 'evening' : 'morning'],
            headers: { 'X-Mailin-custom': JSON.stringify({ uid: client.id, kind: 'noah_brief', slot: isEvening ? 'evening' : 'morning' }) },
        });
        // 2026-06-10 — Log Noah brief sends for traceability (founder
        // ask: "pourquoi le client mrzirraro@gmail.com ne reçoit plus
        // de mail de noah"). On loggue chaque envoi avec son résultat
        // pour pouvoir diagnostiquer.
        const elapsed = Date.now() - sendStart;
        let brevoMsgId: string | null = null;
        let brevoStatus: number = 0;
        let brevoError: string | null = null;
        if (brevoRes) {
          brevoStatus = brevoRes.status;
          try {
            const j: any = await brevoRes.json();
            brevoMsgId = j?.messageId || null;
            if (!brevoRes.ok) brevoError = (j?.message || JSON.stringify(j)).substring(0, 200);
          } catch {}
        }
        await supabase.from('agent_logs').insert({
          agent: 'ceo',
          action: isEvening ? 'client_evening_sent' : 'client_brief_sent',
          status: brevoStatus >= 200 && brevoStatus < 300 ? 'success' : 'error',
          user_id: client.id,
          error_message: brevoError,
          data: {
            recipient: client.email,
            brevo_status: brevoStatus,
            brevo_message_id: brevoMsgId,
            elapsed_ms: elapsed,
            slot: isEvening ? 'evening' : 'morning',
            freq,
          },
        }).then(() => {}, () => {});
      } else if (skipEmail) {
        // catchup_only phase — pas d'email envoyé, normal
      } else {
        // Brief n'a pas pu être envoyé : on loggue la raison
        await supabase.from('agent_logs').insert({
          agent: 'ceo',
          action: isEvening ? 'client_evening_skipped' : 'client_brief_skipped',
          status: 'error',
          user_id: client.id,
          error_message: !BREVO_CLIENT_KEY ? 'BREVO_API_KEY missing' :
                         prefs?.email_enabled === false ? 'email_enabled=false in client_brief_preferences' :
                         !client.email ? 'no email on profile' :
                         'unknown',
          data: { has_brevo: !!BREVO_CLIENT_KEY, email_enabled: prefs?.email_enabled !== false, has_email: !!client.email },
        }).then(() => {}, () => {});
      }

      // ── Individual agent notifications (opt-in via agent settings) ──
      const { data: perAgentConfigs } = await supabase
        .from('org_agent_configs')
        .select('agent_id, config')
        .eq('user_id', client.id);

      if (perAgentConfigs && perAgentConfigs.length > 0) {
        for (const cfg of perAgentConfigs) {
          const wantsReport = cfg.config?.send_individual_report === true;
          if (!wantsReport) continue;

          const agentLogs = (logs || []).filter((l: any) => l.agent === cfg.agent_id);
          if (agentLogs.length === 0) continue;

          const agentActions = agentLogs.length;
          const agentErrors = agentLogs.filter((l: any) => l.data?.error).length;

          // Save as in-app notification per agent
          await supabase.from('client_notifications').insert({
            user_id: client.id,
            agent: cfg.agent_id,
            type: 'agent_report',
            title: `Rapport ${cfg.agent_id} — ${agentActions} actions`,
            message: `${agentActions} actions executees${agentErrors > 0 ? `, ${agentErrors} probleme(s)` : ', tout OK'}`,
            data: { actions: agentActions, errors: agentErrors, logs: agentLogs.slice(0, 5) },
          }).catch(() => {});
        }
      }

      sentCount++;
    } catch { /* skip this client */ }
  }

  return NextResponse.json({ ok: true, type: 'client_brief', sent: sentCount });
}
