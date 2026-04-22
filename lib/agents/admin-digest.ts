/**
 * Unified admin daily digest.
 *
 * Replaces the two separate reports the admin used to receive
 * (`CEO Group — Reco code` + `CEO Improvement Report`) with a single
 * actionable email. Problem with the old flow:
 *   - two emails per slot, same inbox
 *   - one said "tout est passé" and the other listed generic
 *     pattern-based recommendations ("[TIMEOUT] agent X timeout 3×")
 *     without explaining WHAT went wrong or WHERE to fix it
 *
 * This digest asks Claude Sonnet to read every recent failure log, group
 * them by root cause, explain each class plainly, and produce concrete
 * code-level recommendations pointing to specific files / functions /
 * agents.
 *
 * Called from the scheduler's `ceo` slot instead of the two previous
 * calls. Sent via Brevo to the admin (contact@keiroai.com).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { saveKnowledge } from './knowledge-rag';

interface FailureSnapshot {
  agent: string;
  action: string;
  error: string;
  data_preview: string;
  created_at: string;
  user_id: string | null;
}

interface AgentRun {
  agent: string;
  runs: number;
  errors: number;
  last_action: string;
  last_ts: string;
}

interface ClaudeDigest {
  headline: string;             // 1-line verdict, goes into subject
  health_summary: string;       // 2-3 sentences, overview
  top_issues: Array<{
    title: string;              // "Meta API: stale IGAA token"
    agents: string[];           // ["dm_instagram", "instagram_comments"]
    impact: string;             // "N client(s), X errors in 24h"
    explanation: string;        // plain-English cause
    fix: string;                // concrete code-level recommendation
    affected_files?: string[];  // likely paths
  }>;
  quick_wins: string[];          // non-urgent polish recos
  nothing_to_fix?: boolean;
}

export async function buildAdminDigest(
  supabase: SupabaseClient,
  periodHours: number = 24,
): Promise<{
  stats: {
    total_runs: number;
    total_errors: number;
    success_rate: number;
    agents_active: number;
    failures: FailureSnapshot[];
    agent_runs: AgentRun[];
  };
  digest: ClaudeDigest | null;
}> {
  const since = new Date(Date.now() - periodHours * 3600 * 1000).toISOString();

  const { data: logs } = await supabase
    .from('agent_logs')
    .select('agent, action, status, data, created_at, user_id')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000);

  const list = logs || [];

  const failuresRaw = list.filter(l => l.status === 'error' || l.action === 'execution_failure');
  const runs = list.length;
  const errors = failuresRaw.length;

  const perAgent: Record<string, AgentRun> = {};
  for (const l of list) {
    const a = l.agent || 'unknown';
    if (!perAgent[a]) perAgent[a] = { agent: a, runs: 0, errors: 0, last_action: '', last_ts: '' };
    perAgent[a].runs++;
    if (l.status === 'error' || l.action === 'execution_failure') perAgent[a].errors++;
    if (!perAgent[a].last_ts) {
      perAgent[a].last_action = l.action;
      perAgent[a].last_ts = l.created_at;
    }
  }
  const agentRuns = Object.values(perAgent).sort((a, b) => b.runs - a.runs);

  const failures: FailureSnapshot[] = failuresRaw.slice(0, 40).map(f => ({
    agent: f.agent,
    action: f.action,
    error: String(f.data?.error || f.data?.action || '').substring(0, 300),
    data_preview: JSON.stringify(f.data || {}).substring(0, 400),
    created_at: f.created_at,
    user_id: f.user_id || null,
  }));

  const stats = {
    total_runs: runs,
    total_errors: errors,
    success_rate: runs > 0 ? Math.round(((runs - errors) / runs) * 100) : 100,
    agents_active: Object.keys(perAgent).length,
    failures,
    agent_runs: agentRuns,
  };

  // No failures → short digest with no AI call needed.
  if (failures.length === 0) {
    return {
      stats,
      digest: {
        headline: 'Tout tourne nickel',
        health_summary: `${runs} exécutions sur ${periodHours}h, 0 erreur, ${stats.agents_active} agents actifs. Rien à faire.`,
        top_issues: [],
        quick_wins: [],
        nothing_to_fix: true,
      },
    };
  }

  // Feed the failures + agent summary to Claude for rich diagnosis.
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return { stats, digest: null };

  const prompt = `Période : dernières ${periodHours}h.
Exécutions totales : ${runs} · Erreurs : ${errors} · Taux de succès : ${stats.success_rate}%.

=== Runs par agent (top 15) ===
${agentRuns.slice(0, 15).map(a => `- ${a.agent}: ${a.runs} runs, ${a.errors} errors, dernier: ${a.last_action}`).join('\n')}

=== Échecs (${failures.length} visibles) ===
${failures.slice(0, 25).map((f, i) => `${i + 1}. [${f.agent} / ${f.action}] ${f.error}\n   data: ${f.data_preview.substring(0, 200)}`).join('\n')}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: `Tu es le CEO technique de KeiroAI, tu rédiges le brief quotidien pour le fondateur qui va exécuter les fixes lui-même. Il n'a pas besoin de reco génériques — il a besoin de SAVOIR ce qui a cassé et OÙ corriger dans le code.

Le projet est une app Next.js avec des agents sous /app/api/agents/<agent_id>/route.ts :
  - ceo, commercial, email, content, dm_instagram, instagram_comments, gmaps,
    google-reviews, seo, onboarding, retention, marketing, ads, comptable,
    rh, whatsapp, ops

Le worker per-client vit dans /worker/scheduler.mjs. Les libs partagées
sont sous /lib/agents/ (ceo-group, hugo-engine, hugo-reply, theo-review-reply,
visual-analyzer, knowledge-rag, client-context, shared-context, etc.)

Tu dois produire un JSON STRICT de cette forme :

{
  "headline": "1 phrase punchy sur l'état global (max 12 mots)",
  "health_summary": "2-3 phrases : ce qui tourne bien, ce qui coince",
  "top_issues": [
    {
      "title": "titre court (max 8 mots) — root cause",
      "agents": ["agent_id", ...],
      "impact": "combien de clients/runs/erreurs touchés",
      "explanation": "1 paragraphe clair sur POURQUOI ça casse — en français simple",
      "fix": "recommandation CODE précise et actionnable (fichier(s), fonction(s), changement à faire)",
      "affected_files": ["app/api/agents/.../route.ts", "lib/agents/....ts"]
    }
  ],
  "quick_wins": ["reco mineure 1", "reco mineure 2"]
}

RÈGLES :
- Groupe les erreurs identiques en UN SEUL issue (même root cause).
- top_issues trié par impact décroissant, max 5.
- Chaque 'fix' DOIT citer un fichier ou une fonction précise — jamais "investiguer" ou "monitorer".
- Si tu identifies une meilleure approche (ex: refacto, lib à changer, pattern à utiliser), propose-la dans fix — n'hésite pas, tu es expert.
- Si les logs sont trop vagues pour un root cause, dis "Logs insuffisants — ajoute console.log(...) dans X" comme fix.
- Pas de blabla corporate. Ton direct, technique, français.

Output : JSON seul, zéro markdown, zéro intro.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return { stats, digest: null };
    const data = await res.json();
    let txt = (data.content?.[0]?.text || '').trim();
    txt = txt.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(txt);

    const digest: ClaudeDigest = {
      headline: String(parsed.headline || '').substring(0, 200),
      health_summary: String(parsed.health_summary || '').substring(0, 1000),
      top_issues: Array.isArray(parsed.top_issues) ? parsed.top_issues.slice(0, 5).map((i: any) => ({
        title: String(i.title || '').substring(0, 120),
        agents: Array.isArray(i.agents) ? i.agents.slice(0, 5).map(String) : [],
        impact: String(i.impact || '').substring(0, 200),
        explanation: String(i.explanation || '').substring(0, 1200),
        fix: String(i.fix || '').substring(0, 1500),
        affected_files: Array.isArray(i.affected_files) ? i.affected_files.slice(0, 6).map(String) : undefined,
      })) : [],
      quick_wins: Array.isArray(parsed.quick_wins) ? parsed.quick_wins.slice(0, 5).map((s: any) => String(s).substring(0, 300)) : [],
    };

    return { stats, digest };
  } catch (e: any) {
    console.error('[AdminDigest] Claude call failed:', String(e?.message || e).substring(0, 200));
    return { stats, digest: null };
  }
}

export async function sendAdminDailyDigest(
  supabase: SupabaseClient,
  periodHours: number = 24,
): Promise<void> {
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_KEY) return;

  const { stats, digest } = await buildAdminDigest(supabase, periodHours);

  const now = new Date();
  const issues = digest?.top_issues || [];
  const healthIcon = stats.total_errors === 0 ? '\u2705' : stats.success_rate >= 90 ? '\u2705' : stats.success_rate >= 70 ? '\u26A0\uFE0F' : '\u{1F6A8}';

  const issuesHtml = issues.length > 0
    ? issues.map((iss, i) => `
      <div style="background:#fff;border:1px solid #e5e7eb;border-left:4px solid #ef4444;border-radius:8px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="background:#fef2f2;color:#ef4444;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">${i + 1}</span>
          <strong style="font-size:14px;color:#111;">${esc(iss.title)}</strong>
        </div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:10px;">
          Impact : ${esc(iss.impact)} · Agents : ${iss.agents.map(a => `<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;">${esc(a)}</code>`).join(' ')}
        </div>
        <p style="font-size:12px;color:#374151;line-height:1.55;margin:0 0 10px;"><strong>Cause :</strong> ${esc(iss.explanation)}</p>
        <div style="background:#f9fafb;border-radius:6px;padding:10px;">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:bold;margin-bottom:4px;">Fix</div>
          <p style="font-size:12px;color:#111;line-height:1.55;margin:0;white-space:pre-wrap;">${esc(iss.fix)}</p>
          ${iss.affected_files && iss.affected_files.length > 0 ? `<div style="margin-top:8px;font-size:10px;color:#6b7280;">Fichiers : ${iss.affected_files.map(f => `<code style="background:#fff;padding:1px 4px;border-radius:3px;border:1px solid #e5e7eb;">${esc(f)}</code>`).join(' ')}</div>` : ''}
        </div>
      </div>
    `).join('')
    : '<p style="color:#22c55e;font-weight:bold;">Aucune alerte — tout est passé sans erreur.</p>';

  const quickWinsHtml = (digest?.quick_wins || []).length > 0
    ? `<h3 style="color:#111;font-size:14px;margin:20px 0 8px;">Quick wins</h3><ul style="font-size:12px;color:#374151;">${(digest?.quick_wins || []).map(q => `<li>${esc(q)}</li>`).join('')}</ul>`
    : '';

  const agentRunsHtml = stats.agent_runs.slice(0, 10).map(a =>
    `<tr><td style="padding:4px 8px;font-size:11px;">${esc(a.agent)}</td><td style="padding:4px 8px;font-size:11px;text-align:right;">${a.runs}</td><td style="padding:4px 8px;font-size:11px;text-align:right;color:${a.errors > 0 ? '#ef4444' : '#22c55e'};">${a.errors}</td><td style="padding:4px 8px;font-size:10px;color:#6b7280;">${esc(a.last_action).substring(0, 30)}</td></tr>`
  ).join('');

  const subject = `${healthIcon} ${digest?.headline || 'Digest admin KeiroAI'} (${stats.success_rate}% · ${stats.total_errors} erreurs)`;

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': BREVO_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Noah — Digest technique', email: 'contact@keiroai.com' },
      to: [{ email: 'contact@keiroai.com' }],
      subject,
      htmlContent: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;background:#f9fafb;">
        <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:24px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;font-size:18px;">${healthIcon} Digest technique — ${esc(digest?.headline || 'KeiroAI')}</h2>
          <p style="margin:4px 0 0;color:#a0aec0;font-size:12px;">${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — ${periodHours}h précédentes</p>
        </div>

        <div style="background:#fff;padding:20px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">
            <div style="background:#f0fdf4;padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:20px;font-weight:bold;color:#22c55e;">${stats.success_rate}%</div>
              <div style="font-size:10px;color:#888;">Succès</div>
            </div>
            <div style="background:${stats.total_errors > 0 ? '#fef2f2' : '#f0fdf4'};padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:20px;font-weight:bold;color:${stats.total_errors > 0 ? '#ef4444' : '#22c55e'};">${stats.total_errors}</div>
              <div style="font-size:10px;color:#888;">Erreurs</div>
            </div>
            <div style="background:#eff6ff;padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:20px;font-weight:bold;color:#3b82f6;">${stats.total_runs}</div>
              <div style="font-size:10px;color:#888;">Exécutions</div>
            </div>
            <div style="background:#f5f3ff;padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:20px;font-weight:bold;color:#7c3aed;">${stats.agents_active}</div>
              <div style="font-size:10px;color:#888;">Agents actifs</div>
            </div>
          </div>

          <p style="font-size:13px;color:#374151;line-height:1.6;margin:0 0 16px;padding:12px 16px;background:#f9fafb;border-radius:8px;border-left:3px solid #3b82f6;">
            ${esc(digest?.health_summary || '')}
          </p>

          <h3 style="color:#111;font-size:14px;margin:20px 0 12px;">${issues.length > 0 ? `À corriger (${issues.length})` : 'Aucune alerte'}</h3>
          ${issuesHtml}

          ${quickWinsHtml}

          <h3 style="color:#111;font-size:14px;margin:24px 0 8px;">Runs par agent (top 10)</h3>
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead><tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Agent</th><th style="padding:6px 8px;text-align:right;">Runs</th><th style="padding:6px 8px;text-align:right;">Erreurs</th><th style="padding:6px 8px;text-align:left;">Dernière action</th></tr></thead>
            <tbody>${agentRunsHtml}</tbody>
          </table>
        </div>
        <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:10px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
          Noah — Digest technique · ${now.toISOString().slice(0, 10)}
        </div>
      </div>`,
    }),
  }).catch(() => {});

  // Persist the digest summary in the RAG so future sessions can recall
  // the state of the system without scanning agent_logs.
  if (digest) {
    const ragSummary = `ADMIN DIGEST ${now.toISOString().slice(0, 10)}: ${digest.headline}. Success ${stats.success_rate}%, ${stats.total_errors}/${stats.total_runs} errors. Top issues: ${digest.top_issues.map(i => i.title).join(' | ')}`;
    await saveKnowledge(supabase, {
      content: ragSummary,
      summary: `Digest ${now.toISOString().slice(0, 10)} ${stats.success_rate}%`,
      agent: 'ceo',
      category: 'learning',
      source: 'admin_digest',
      confidence: 0.7,
      org_id: undefined,
    }).catch(() => {});
  }

  await supabase.from('agent_logs').insert({
    agent: 'ceo',
    action: 'admin_digest_sent',
    status: 'ok',
    data: {
      period_hours: periodHours,
      success_rate: stats.success_rate,
      total_errors: stats.total_errors,
      issues_count: digest?.top_issues.length || 0,
      quick_wins_count: digest?.quick_wins.length || 0,
    },
    created_at: now.toISOString(),
  }).throwOnError?.();
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
