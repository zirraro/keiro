/**
 * Unified admin daily digest.
 *
 * 2026-06-01 — Single email replacing the trio the founder used to get:
 *   - "Service Health — Digest 24h" (admin-health-digest)
 *   - "Ops Agent — Problemes detectes" (ops route)
 *   - "Noah — Digest technique" (this file)
 *
 * Both senders now persist data (admin_health_snapshot, health_check_report)
 * and let this function build ONE email with three sections:
 *   1. Service Health (Noah catch-up diagnostics, P0/P1/P2)
 *   2. Agents DOWN / DEGRADED (Ops scheduled-agent uptime check)
 *   3. Root-cause failure analysis (Claude over agent_logs failures)
 *
 * Sent via Brevo to contact@keiroai.com.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { saveKnowledge } from './knowledge-rag';
import { callLlmWithFallback } from './llm-fallback';

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
  delivered: number;   // livrable RÉEL (emails envoyés, posts publiés, DMs…) — pas juste des runs
  unit: string;        // libellé du livrable
  last_action: string;
  last_ts: string;
}

// Livrable réel d'un log (founder 06/07 : cohérence — le digest montrait 88
// "tâches" email pour 14 envois car il comptait les ENTRÉES DE LOG, pas les
// livrables). On extrait le vrai chiffre selon l'agent.
function deliveredOf(l: any): number {
  const d = l?.data || {};
  const a = l?.agent;
  if (a === 'email') return Number(d.success ?? d.sent ?? 0);
  if (a === 'content') return Number(d.posts_published ?? d.published ?? d.published_count ?? 0);
  if (a === 'dm_instagram') return Number(d.dms_sent ?? d.sent ?? d.dms_prepared ?? d.replied ?? 0);
  if (a === 'gmaps' || a === 'reviews') return Number(d.reviews_answered ?? d.answered ?? 0);
  if (a === 'commercial') return Number(d.prospects_added ?? d.added ?? d.discovered ?? 0);
  return 0;
}
const UNIT_OF: Record<string, string> = {
  email: 'emails envoyés', content: 'posts publiés', dm_instagram: 'DMs',
  gmaps: 'avis répondus', reviews: 'avis répondus', commercial: 'prospects ajoutés',
};

interface ClaudeDigest {
  headline: string;
  health_summary: string;
  top_issues: Array<{
    title: string;
    agents: string[];
    impact: string;
    explanation: string;
    fix: string;
    affected_files?: string[];
  }>;
  quick_wins: string[];
  nothing_to_fix?: boolean;
}

interface HealthCause {
  cause: string;
  severity: 'P0' | 'P1' | 'P2';
  incidents: number;
  clients: string[];
  agents: string[];
  fixes: string[];
  sample_error: string;
}

interface AgentDownSnapshot {
  agent: string;
  status: 'down' | 'degraded';
  reason: string;
  last_success: string | null;
  success_rate: number;
  total_runs_24h: number;
  suggested_fix: string;
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
  healthCauses: HealthCause[];
  agentsDown: AgentDownSnapshot[];
}> {
  const since = new Date(Date.now() - periodHours * 3600 * 1000).toISOString();

  const { data: logs } = await supabase
    .from('agent_logs')
    .select('agent, action, status, data, created_at, user_id')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000);

  const list = logs || [];

  // True failures only: exclude rows that are explicitly marked as
  // "expected skip" (e.g. a client without IG connected — that's a
  // configuration state, not a system error).
  const isExpectedSkip = (l: any): boolean => {
    const d = l?.data;
    if (!d) return false;
    if (d.skipped === true) return true;
    const reason = String(d.reason || d.detail || '').toLowerCase();
    if (reason.includes('no_ig_configured')) return true;
    if (reason.includes('not connected') && reason.includes('expected')) return true;
    return false;
  };
  const isRealFailure = (l: any): boolean => {
    if (isExpectedSkip(l)) return false;
    return l.status === 'error' || l.action === 'execution_failure';
  };

  const failuresRaw = list.filter(isRealFailure);
  const runs = list.length;
  const errors = failuresRaw.length;

  const perAgent: Record<string, AgentRun> = {};
  for (const l of list) {
    const a = l.agent || 'unknown';
    if (!perAgent[a]) perAgent[a] = { agent: a, runs: 0, errors: 0, delivered: 0, unit: UNIT_OF[a] || 'actions', last_action: '', last_ts: '' };
    perAgent[a].runs++;
    perAgent[a].delivered += deliveredOf(l);
    if (isRealFailure(l)) perAgent[a].errors++;
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

  // ── Section 1: Service Health (latest admin_health_snapshot) ────────
  const { data: latestSnapshot } = await supabase
    .from('agent_logs')
    .select('data, created_at')
    .eq('agent', 'ceo')
    .eq('action', 'admin_health_snapshot')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const healthCauses: HealthCause[] = ((latestSnapshot?.data?.top_causes || []) as any[]).map(c => ({
    cause: String(c.cause || 'Cause inconnue'),
    severity: (c.severity === 'P0' || c.severity === 'P1') ? c.severity : 'P2',
    incidents: Number(c.incidents || 0),
    clients: Array.isArray(c.clients) ? c.clients.slice(0, 10) : [],
    agents: Array.isArray(c.agents) ? c.agents.slice(0, 5) : [],
    fixes: Array.isArray(c.fixes) ? c.fixes.slice(0, 5) : [],
    sample_error: String(c.sample_error || '').slice(0, 220),
  }));

  // ── Section 2: Agents DOWN (latest ops health_check_report) ─────────
  const { data: latestOps } = await supabase
    .from('agent_logs')
    .select('data, created_at')
    .eq('agent', 'ops')
    .eq('action', 'health_check_report')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const opsDown = (latestOps?.data?.downAgents || []) as any[];
  const opsDegraded = (latestOps?.data?.degradedAgents || []) as any[];

  const buildFix = (a: any): string => {
    if (!a.last_success) {
      return `Vérifier que '${a.agent}' est bien dans worker/scheduler.mjs GLOBAL_SCHEDULE ou AGENT_ENDPOINTS, puis \`pm2 restart keiro-worker\`. Tester /api/agents/${a.agent.replace(/_/g, '-')} manuellement avec CRON_SECRET.`;
    }
    if (a.total_runs_24h === 0) {
      return `'${a.agent}' n'a tourné AUCUNE fois en 24h alors qu'il l'a fait en 48h. Soit la cadence est espacée (Mon/Wed/Fri pour SEO par exemple), soit le cron est cassé. Voir \`pm2 logs keiro-worker --lines 200\`.`;
    }
    if (a.success_rate >= 0 && a.success_rate < 30) {
      return `Taux d'erreur ${100 - a.success_rate}% sur '${a.agent}'. Filter \`agent_logs\` WHERE agent='${a.agent}' AND status='error' ORDER BY created_at DESC LIMIT 10 pour le pattern dominant.`;
    }
    return `Analyser les ${a.error_count_24h || 0} erreur(s) récentes de '${a.agent}' dans agent_logs pour identifier la root cause.`;
  };

  const agentsDown: AgentDownSnapshot[] = [
    ...opsDown.map((a: any) => ({
      agent: String(a.agent),
      status: 'down' as const,
      reason: String(a.reason || 'down'),
      last_success: a.last_success || null,
      success_rate: typeof a.success_rate === 'number' ? a.success_rate : -1,
      total_runs_24h: Number(a.total_runs_24h || 0),
      suggested_fix: buildFix(a),
    })),
    ...opsDegraded.map((a: any) => ({
      agent: String(a.agent),
      status: 'degraded' as const,
      reason: String(a.reason || 'degraded'),
      last_success: a.last_success || null,
      success_rate: typeof a.success_rate === 'number' ? a.success_rate : -1,
      total_runs_24h: Number(a.total_runs_24h || 0),
      suggested_fix: buildFix(a),
    })),
  ];

  // ── Section 3: Claude root-cause analysis (only if there are failures) ─
  if (failures.length === 0 && healthCauses.length === 0 && agentsDown.length === 0) {
    return {
      stats,
      digest: {
        headline: 'Tout tourne nickel',
        health_summary: `${runs} exécutions sur ${periodHours}h, 0 erreur, ${stats.agents_active} agents actifs. Rien à faire.`,
        top_issues: [],
        quick_wins: [],
        nothing_to_fix: true,
      },
      healthCauses,
      agentsDown,
    };
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return { stats, digest: null, healthCauses, agentsDown };

  // 2026-06-02 — admin RAG: load past digest summaries + admin learnings
  // so each report builds on what worked / didn't work last time.
  // Founder ask: "tu peux lui apprendre aussi quand tu optimise pour qu'il
  // soit encore meilleur en recommandation les prochaines fois".
  let pastContext = '';
  try {
    const { getActiveLearnings, formatLearningsForPrompt } = await import('./learning');
    const adminLearnings = await getActiveLearnings(supabase, 'ceo', undefined, undefined);
    // Also pull the last 5 admin_digest_sent rows so we know what we
    // already flagged + what fixes were applied.
    const { data: pastDigests } = await supabase
      .from('agent_logs')
      .select('data, created_at')
      .eq('agent', 'ceo')
      .eq('action', 'admin_digest_sent')
      .order('created_at', { ascending: false })
      .limit(5);
    const learningsBlock = (adminLearnings || []).length > 0
      ? '\n\n=== APPRENTISSAGES PRÉCÉDENTS (admin RAG) ===\n' + formatLearningsForPrompt(adminLearnings || [], [])
      : '';
    const digestsBlock = (pastDigests || []).length > 0
      ? '\n\n=== DIGESTS RÉCENTS ===\n' + (pastDigests || []).slice(0, 5).map((d: any, i) => {
          const dd = d.data || {};
          return `${i + 1}. ${d.created_at.slice(0, 10)} — ${dd.success_rate || 0}% succès, ${dd.total_errors || 0} erreurs, ${dd.issues_count || 0} issues, ${dd.agents_down || 0} DOWN`;
        }).join('\n')
      : '';
    pastContext = learningsBlock + digestsBlock;
  } catch { /* RAG load best-effort */ }

  const prompt = `Période : dernières ${periodHours}h.
Exécutions totales : ${runs} · Erreurs : ${errors} · Taux de succès : ${stats.success_rate}%.

=== Runs par agent (top 15) ===
${agentRuns.slice(0, 15).map(a => `- ${a.agent}: ${a.delivered} ${a.unit} (${a.runs} runs, ${a.errors} errors), dernier: ${a.last_action}`).join('\n')}

=== Échecs (${failures.length} visibles) ===
${failures.slice(0, 25).map((f, i) => `${i + 1}. [${f.agent} / ${f.action}] ${f.error}\n   data: ${f.data_preview.substring(0, 200)}`).join('\n')}${pastContext}`;

  try {
    const systemPrompt = `Tu es le CEO technique de KeiroAI, tu rédiges le brief quotidien pour le fondateur qui va exécuter les fixes lui-même.

INFRA DÉPLOIEMENT :
- AUCUN cron Vercel — vercel.json.crons = []. NE JAMAIS suggérer "vérifier vercel.json".
- Tous les crons tournent sur un VPS OVH (Gravelines) via PM2 :
    - keiro-app    : Next.js, port 3000
    - keiro-worker : /opt/keiro/worker/scheduler.mjs (le vrai cron)
- Slots fixes (UTC) : ceo 05:00, morning_batch 07:00, midday_batch 10:00,
  afternoon_batch 13:30, evening_batch 17:00, ceo_daily 18:30,
  ig_comments_reply :15, weekly-trends Mon 07:00.
- Pour un agent "DOWN" ou "Aucun run" : le fix à suggérer est
  d'abord "vérifier l'agentId dans GLOBAL_SCHEDULE / AGENT_ENDPOINTS
  du worker, puis pm2 restart keiro-worker".

Le projet est une app Next.js avec des agents sous /app/api/agents/<agent_id>/route.ts
(ceo, commercial, email, content, dm_instagram, instagram_comments, gmaps,
google-reviews, seo, onboarding, retention, marketing, ads, comptable,
rh, whatsapp, ops). Libs partagées sous /lib/agents/.

AGENTS DÉSACTIVÉS (lib/agents/feature-flags.ts DISABLED_AGENTS) :
ads, rh, comptable, whatsapp, tiktok_comments, tiktok_dm, linkedin.
0 run sur ces agents = NORMAL — mentionner "désactivé".

CADENCE SPÉCIALE :
- seo : Mon/Wed/Fri seulement (3x/semaine). 48h sans run = peut être normal.
- weekly-trends : Mon 07:00 seulement.
- monthly-recap : 1er du mois.

P2 "Cause inconnue" : si tu vois cette catégorie, lis le sample_error
inclus et essaie d'identifier le pattern (TIMEOUT, 401, JSON_PARSE,
SUPABASE_RLS, OPENAI_RATE_LIMIT, etc.). Donne un fix précis, pas
"investiguer manuellement".

CHANNELS DE NOTIFICATION DISPONIBLES (2026-06-02) :
- ❌ PAS de Slack — le founder n'en a pas. Ne JAMAIS suggérer "ajouter
  alerte Slack" / "webhook Slack" / "notification Slack" comme reco.
- ✅ Email admin (contact@keiroai.com via Brevo) — utilisé pour ce digest
  + admin-morning-digest. Suggérer "ajouter alerte email" si besoin.
- ✅ In-app notification (client_notifications table) — utilisée pour le
  client final dans /assistant. Suggérer "envoyer notification in-app"
  pour les alertes côté client.
- ✅ PM2 + console (admin/service-health) — visibilité interne, pas de
  push.

FALLBACK LLM (ordre de préférence) :
- Claude (Anthropic) = qualité top, plus cher
- Gemini Pro 1.5 (Google) = 2-3x MOINS cher que Claude, qualité très bonne,
  meilleur choix de fallback. Le projet utilise déjà callGemini dans
  lib/agents/gemini.ts pour les agents Hugo, Jade, DM. Suggérer "fallback
  Gemini" pas "fallback OpenAI" (OpenAI = qualité similaire mais prix
  proche de Claude, pas un vrai gain).
- OpenAI seulement en dernier recours (qualité OK, prix proche Claude).

Tu dois produire un JSON STRICT de cette forme :

{
  "headline": "1 phrase punchy sur l'état global (max 12 mots)",
  "health_summary": "2-3 phrases : ce qui tourne bien, ce qui coince",
  "top_issues": [
    {
      "title": "titre court (max 8 mots) — root cause",
      "agents": ["agent_id", ...],
      "impact": "combien de clients/runs/erreurs touchés",
      "explanation": "1 paragraphe clair sur POURQUOI ça casse — français simple",
      "fix": "recommandation CODE précise et actionnable (fichier(s), fonction(s), changement à faire)",
      "affected_files": ["app/api/agents/.../route.ts", "lib/agents/....ts"]
    }
  ],
  "quick_wins": ["reco mineure 1", "reco mineure 2"]
}

RÈGLES :
- Groupe les erreurs identiques en UN SEUL issue.
- top_issues trié par impact décroissant, max 5.
- Chaque 'fix' DOIT citer un fichier/fonction précis — jamais "investiguer".
- Si tu identifies un refacto/lib meilleur, propose-le dans fix.
- Si logs vagues, dis "Logs insuffisants — ajoute console.log(...) dans X" comme fix.
- Pas de blabla corporate. Direct, technique, français.

Output : JSON seul, zéro markdown, zéro intro.`;

    // 2026-06-02: use Claude → Gemini fallback so the digest still ships
    // when Anthropic credits are exhausted or the API is overloaded.
    const llmResult = await callLlmWithFallback({
      system: systemPrompt,
      message: prompt,
      maxTokens: 3000,
      claudeModel: 'claude-sonnet-4-6',
      callTag: 'admin-digest',
    });

    if (llmResult.fallbackReason) {
      console.warn(`[AdminDigest] Used Gemini fallback: ${llmResult.fallbackReason}`);
    }

    let txt = llmResult.text;
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

    return { stats, digest, healthCauses, agentsDown };
  } catch (e: any) {
    console.error('[AdminDigest] Claude call failed:', String(e?.message || e).substring(0, 200));
    return { stats, digest: null, healthCauses, agentsDown };
  }
}

/**
 * 2026-06-22 — Remédiation autonome AVANT l'envoi du digest.
 *
 * Founder : "si il peut régler l'erreur avant envoi du digest en toute
 * autonomie c'est mieux — le digest sert à régler des problèmes". On ne
 * touche PAS au code (ça, c'est une session Claude Code), mais on applique
 * les self-heals SÛRS et RÉVERSIBLES sur l'état (content_calendar) pour les
 * patterns connus. Chaque action est tracée + partagée dans le RAG pool pour
 * que tous les agents en bénéficient. Retourne la liste de ce qui a été réglé.
 */
export async function autoRemediateIssues(
  supabase: SupabaseClient,
): Promise<Array<{ issue: string; action: string; count: number }>> {
  const fixed: Array<{ issue: string; action: string; count: number }> = [];
  const nowIso = new Date().toISOString();

  // 1. Publications en échec TRANSITOIRE (timeout/5xx/réseau) → re-mises en
  //    file (approved) pour le prochain slot. Une seule fois par post
  //    (marqueur [auto_requeued]). Les échecs PERMANENTS (compte non
  //    connecté, média invalide, token révoqué) ne sont PAS retentés.
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: failed } = await supabase
      .from('content_calendar')
      .select('id, publish_diagnostic')
      .eq('status', 'publish_failed')
      .gte('updated_at', since)
      .limit(100);
    const RETRYABLE = /timeout|fetch failed|econn|socket|\b5\d\d\b|rate.?limit|temporar|try again|overload|network|ETIMEDOUT|ECONNRESET/i;
    const PERMANENT = /not connect|non connect|invalid|unsupported|media|expired|revoked|permission|duplicate|policy|disabled/i;
    const toRequeue = (failed || []).filter((p: any) => {
      const d = String(p.publish_diagnostic || '');
      if (d.includes('[auto_requeued]')) return false;
      return RETRYABLE.test(d) && !PERMANENT.test(d);
    });
    for (const p of toRequeue) {
      await supabase.from('content_calendar').update({
        status: 'approved',
        publish_diagnostic: (String(p.publish_diagnostic || '').slice(0, 300)) + ' [auto_requeued]',
        updated_at: nowIso,
      }).eq('id', p.id);
    }
    if (toRequeue.length) fixed.push({ issue: 'Publications en échec transitoire (timeout/5xx/réseau)', action: 'Re-mises en file (approved) pour le prochain slot de publication', count: toRequeue.length });
  } catch { /* non-fatal */ }

  // 2. Montages reels bloqués : sentinelle video_job_id 'montage_*' posée
  //    depuis >90 min mais toujours sans vidéo → purge la sentinelle pour
  //    que le prochain passage régénère (le montage avait échoué/timeout).
  try {
    const staleBefore = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const { data: stuck } = await supabase
      .from('content_calendar')
      .select('id')
      .like('video_job_id', 'montage_%')
      .is('video_url', null)
      .neq('status', 'published')
      .lt('updated_at', staleBefore)
      .limit(100);
    for (const p of (stuck || [])) {
      await supabase.from('content_calendar').update({ video_job_id: null, updated_at: nowIso }).eq('id', p.id);
    }
    if ((stuck || []).length) fixed.push({ issue: 'Montages reels bloqués (sentinelle orpheline)', action: 'Sentinelle video_job_id purgée → régénération au prochain passage', count: (stuck || []).length });
  } catch { /* non-fatal */ }

  // Trace + partage RAG (toujours) — tous les agents apprennent du self-heal.
  if (fixed.length) {
    try {
      await supabase.from('agent_logs').insert({
        agent: 'ceo', action: 'auto_remediated', status: 'ok',
        data: { fixed, at: nowIso }, created_at: nowIso,
      });
    } catch { /* non-fatal */ }
    for (const f of fixed) {
      await saveKnowledge(supabase, {
        content: `AUTO-REMÉDIATION ${nowIso.slice(0, 10)} : "${f.issue}" → ${f.action} (${f.count} élément(s)). Réglé en autonomie avant le digest admin.`,
        summary: `Auto-fix: ${f.issue.slice(0, 60)} (${f.count})`,
        agent: 'ceo', category: 'learning', source: 'auto_remediation', confidence: 0.75, org_id: undefined,
      }).catch(() => {});
    }
  }
  return fixed;
}

export async function sendAdminDailyDigest(
  supabase: SupabaseClient,
  periodHours: number = 24,
): Promise<void> {
  // 2026-06-03 — Use multi-provider fallback (Brevo API → Resend → Brevo SMTP)
  // so admin digest never silently drops when one key is revoked.
  const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');

  // Remédiation autonome AVANT de bâtir le digest : on règle ce qui est
  // sûrement auto-réparable, puis on rapporte ce qui reste + ce qui a été
  // réglé. (Founder : régler en autonomie avant l'envoi.)
  const autoFixed = await autoRemediateIssues(supabase).catch(() => [] as Array<{ issue: string; action: string; count: number }>);

  const { stats, digest, healthCauses, agentsDown } = await buildAdminDigest(supabase, periodHours);

  const now = new Date();
  const issues = digest?.top_issues || [];
  const healthIcon = (agentsDown.length === 0 && stats.total_errors === 0 && healthCauses.filter(c => c.severity === 'P0').length === 0)
    ? '✅'
    : stats.success_rate >= 90 && agentsDown.filter(a => a.status === 'down').length === 0
      ? '✅'
      : stats.success_rate >= 70
        ? '⚠️'
        : '\u{1F6A8}';

  // ─── Section: Service Health (P0/P1/P2) ──────────────────────────
  const SEV_COLOR: Record<string, { bg: string; border: string; label: string }> = {
    P0: { bg: '#fef2f2', border: '#dc2626', label: 'P0 — bloquant' },
    P1: { bg: '#fff7ed', border: '#ea580c', label: 'P1 — important' },
    P2: { bg: '#f9fafb', border: '#6b7280', label: 'P2 — mineur' },
  };

  const healthBlocks = healthCauses.length > 0
    ? healthCauses.map(c => {
        const sev = SEV_COLOR[c.severity] || SEV_COLOR.P2;
        const clientList = c.clients.slice(0, 5).join(', ') + (c.clients.length > 5 ? ` (+${c.clients.length - 5})` : '');
        return `<div style="background:${sev.bg};border-left:4px solid ${sev.border};border-radius:8px;padding:12px;margin:8px 0;">
          <div style="font-size:11px;color:${sev.border};font-weight:bold;text-transform:uppercase;">${sev.label} · ${c.agents.join(', ')}</div>
          <div style="font-size:13px;color:#111;font-weight:bold;margin:4px 0;">${esc(c.cause)}</div>
          <div style="font-size:11px;color:#4b5563;"><strong>${c.incidents}</strong> incident(s) · clients : ${esc(clientList || 'n/a')}</div>
          ${c.sample_error ? `<div style="font-size:10px;color:#6b7280;font-family:monospace;background:#fff;padding:6px;border-radius:4px;margin:6px 0;border:1px solid #e5e7eb;">${esc(c.sample_error)}</div>` : ''}
          ${c.fixes.length > 0 ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:11px;color:#374151;">${c.fixes.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        </div>`;
      }).join('')
    : '';

  // ─── Section: Agents DOWN / DEGRADED ─────────────────────────────
  const agentsDownBlocks = agentsDown.length > 0
    ? agentsDown.map(a => {
        const color = a.status === 'down' ? '#dc2626' : '#d97706';
        const bg = a.status === 'down' ? '#fef2f2' : '#fff7ed';
        return `<div style="background:${bg};border-left:4px solid ${color};border-radius:8px;padding:12px;margin:8px 0;">
          <div style="font-size:11px;color:${color};font-weight:bold;text-transform:uppercase;">${a.status === 'down' ? 'AGENT DOWN' : 'AGENT DEGRADED'} · ${esc(a.agent)}</div>
          <div style="font-size:13px;color:#111;margin:4px 0;">${esc(a.reason)}</div>
          <div style="font-size:11px;color:#4b5563;">Dernier succès : ${a.last_success ? new Date(a.last_success).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais en 48h'} · ${a.total_runs_24h} runs 24h${a.success_rate >= 0 ? ` · ${a.success_rate}% succès` : ''}</div>
          <div style="background:#fff;border-radius:6px;padding:8px;margin-top:6px;border:1px solid #e5e7eb;">
            <div style="font-size:10px;font-weight:bold;color:#059669;text-transform:uppercase;letter-spacing:0.3px;">Fix</div>
            <div style="font-size:11px;color:#374151;margin-top:3px;">${esc(a.suggested_fix)}</div>
          </div>
        </div>`;
      }).join('')
    : '';

  // ─── Section: Root-cause (Claude analysis) ────────────────────────
  const issuesHtml = issues.length > 0
    ? issues.map((iss, i) => `
      <div style="background:#fff;border:1px solid #e5e7eb;border-left:4px solid #ef4444;border-radius:8px;padding:14px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="background:#fef2f2;color:#ef4444;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">${i + 1}</span>
          <strong style="font-size:13px;color:#111;">${esc(iss.title)}</strong>
        </div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:8px;">
          Impact : ${esc(iss.impact)} · Agents : ${iss.agents.map(a => `<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;">${esc(a)}</code>`).join(' ')}
        </div>
        <p style="font-size:12px;color:#374151;line-height:1.5;margin:0 0 8px;"><strong>Cause :</strong> ${esc(iss.explanation)}</p>
        <div style="background:#f9fafb;border-radius:6px;padding:8px;">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:bold;margin-bottom:3px;">Fix</div>
          <p style="font-size:12px;color:#111;line-height:1.5;margin:0;white-space:pre-wrap;">${esc(iss.fix)}</p>
          ${iss.affected_files && iss.affected_files.length > 0 ? `<div style="margin-top:6px;font-size:10px;color:#6b7280;">Fichiers : ${iss.affected_files.map(f => `<code style="background:#fff;padding:1px 4px;border-radius:3px;border:1px solid #e5e7eb;">${esc(f)}</code>`).join(' ')}</div>` : ''}
        </div>
      </div>
    `).join('')
    : '<p style="color:#22c55e;font-weight:bold;font-size:12px;">Aucune root cause d\'échec à analyser.</p>';

  const quickWinsHtml = (digest?.quick_wins || []).length > 0
    ? `<h3 style="color:#111;font-size:13px;margin:20px 0 6px;">Quick wins</h3><ul style="font-size:11px;color:#374151;margin:0;padding-left:18px;">${(digest?.quick_wins || []).map(q => `<li>${esc(q)}</li>`).join('')}</ul>`
    : '';

  const agentRunsHtml = stats.agent_runs.slice(0, 10).map(a =>
    `<tr><td style="padding:4px 8px;font-size:11px;">${esc(a.agent)}</td><td style="padding:4px 8px;font-size:11px;text-align:right;font-weight:bold;">${a.delivered > 0 ? `${a.delivered} <span style="color:#6b7280;font-weight:normal;">${esc(a.unit)}</span>` : '—'}</td><td style="padding:4px 8px;font-size:11px;text-align:right;color:#9ca3af;">${a.runs}</td><td style="padding:4px 8px;font-size:11px;text-align:right;color:${a.errors > 0 ? '#ef4444' : '#22c55e'};">${a.errors}</td><td style="padding:4px 8px;font-size:10px;color:#6b7280;">${esc(a.last_action).substring(0, 30)}</td></tr>`
  ).join('');

  const downCount = agentsDown.filter(a => a.status === 'down').length;
  const p0Count = healthCauses.filter(c => c.severity === 'P0').length;
  const p1Count = healthCauses.filter(c => c.severity === 'P1').length;
  const summaryBadge = p0Count > 0
    ? `🚨 ${p0Count} P0 + ${downCount} DOWN`
    : downCount > 0
      ? `⚠️ ${downCount} agent(s) DOWN`
      : p1Count > 0
        ? `⚠️ ${p1Count} P1`
        : stats.total_errors > 0
          ? `${stats.total_errors} erreurs`
          : 'RAS';

  const subject = `${healthIcon} KeiroAI Admin — ${digest?.headline || summaryBadge} (${stats.success_rate}% · ${stats.total_errors} err)`;

  const htmlContent = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;background:#f9fafb;">
        <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:24px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;font-size:18px;">${healthIcon} Digest admin unifié — ${esc(digest?.headline || summaryBadge)}</h2>
          <p style="margin:4px 0 0;color:#a0aec0;font-size:12px;">${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — ${periodHours}h précédentes</p>
        </div>

        <div style="background:#fff;padding:20px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;">
            <div style="background:#f0fdf4;padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:18px;font-weight:bold;color:#22c55e;">${stats.success_rate}%</div>
              <div style="font-size:9px;color:#888;">Succès</div>
            </div>
            <div style="background:${stats.total_errors > 0 ? '#fef2f2' : '#f0fdf4'};padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:18px;font-weight:bold;color:${stats.total_errors > 0 ? '#ef4444' : '#22c55e'};">${stats.total_errors}</div>
              <div style="font-size:9px;color:#888;">Erreurs</div>
            </div>
            <div style="background:#eff6ff;padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:18px;font-weight:bold;color:#3b82f6;">${stats.total_runs}</div>
              <div style="font-size:9px;color:#888;">Exécutions</div>
            </div>
            <div style="background:${downCount > 0 ? '#fef2f2' : '#f0fdf4'};padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:18px;font-weight:bold;color:${downCount > 0 ? '#dc2626' : '#22c55e'};">${downCount}</div>
              <div style="font-size:9px;color:#888;">DOWN</div>
            </div>
            <div style="background:${p0Count > 0 ? '#fef2f2' : '#f0fdf4'};padding:10px;border-radius:8px;text-align:center;">
              <div style="font-size:18px;font-weight:bold;color:${p0Count > 0 ? '#dc2626' : '#22c55e'};">${p0Count}/${p1Count}</div>
              <div style="font-size:9px;color:#888;">P0/P1</div>
            </div>
          </div>

          <p style="font-size:13px;color:#374151;line-height:1.6;margin:0 0 16px;padding:12px 16px;background:#f9fafb;border-radius:8px;border-left:3px solid #3b82f6;">
            ${esc(digest?.health_summary || '')}
          </p>

          ${autoFixed.length > 0 ? `
            <h3 style="color:#111;font-size:14px;margin:20px 0 8px;">✅ Réglé automatiquement (${autoFixed.reduce((n, f) => n + f.count, 0)})</h3>
            <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:8px;padding:12px;margin:8px 0;">
              <div style="font-size:11px;color:#166534;margin-bottom:4px;">Remédiation autonome avant l'envoi — aucune action requise.</div>
              <ul style="margin:6px 0 0;padding-left:18px;font-size:11px;color:#14532d;">
                ${autoFixed.map(f => `<li><strong>${esc(f.issue)}</strong> — ${esc(f.action)} <em>(${f.count})</em></li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${agentsDownBlocks ? `
            <h3 style="color:#111;font-size:14px;margin:20px 0 8px;">🔴 Agents DOWN / DEGRADED (${agentsDown.length})</h3>
            ${agentsDownBlocks}
          ` : ''}

          ${healthBlocks ? `
            <h3 style="color:#111;font-size:14px;margin:20px 0 8px;">📊 Service Health — causes racines clients (${healthCauses.length})</h3>
            ${healthBlocks}
          ` : ''}

          <h3 style="color:#111;font-size:14px;margin:20px 0 8px;">🔧 Root-cause analyse code (${issues.length})</h3>
          ${issuesHtml}

          ${quickWinsHtml}

          <h3 style="color:#111;font-size:14px;margin:24px 0 8px;">Runs par agent (top 10)</h3>
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead><tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Agent</th><th style="padding:6px 8px;text-align:right;">Livré</th><th style="padding:6px 8px;text-align:right;">Runs</th><th style="padding:6px 8px;text-align:right;">Erreurs</th><th style="padding:6px 8px;text-align:left;">Dernière action</th></tr></thead>
            <tbody>${agentRunsHtml}</tbody>
          </table>

          <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px;border-radius:8px;margin-top:18px;">
            <strong style="color:#166534;font-size:12px;">📋 Workflow</strong>
            <ol style="font-size:11px;color:#14532d;margin:6px 0 0;padding-left:18px;">
              <li>Reviewer la liste, choisir les fix prioritaires</li>
              <li>Demander à Claude d'implémenter les solutions</li>
              <li>Console détaillée : <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.keiroai.com'}/admin/service-health" style="color:#059669;">/admin/service-health</a></li>
            </ol>
          </div>
        </div>
        <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:10px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
          KeiroAI Admin · Digest unifié quotidien · ${now.toISOString().slice(0, 10)}
        </div>
      </div>`;

  const sendResult = await sendEmailWithFallback({
    to: 'contact@keiroai.com',
    subject,
    html: htmlContent,
    fromName: 'KeiroAI Admin Digest',
    fromEmail: 'contact@keiroai.com',
    tags: ['admin_digest'],
  });
  if (!sendResult.ok) {
    console.error('[AdminDigest] All email providers failed:', sendResult.error);
  } else {
    console.log(`[AdminDigest] Sent via ${sendResult.provider}`);
  }

  if (digest) {
    const autoFixedSummary = autoFixed.length > 0 ? ` Auto-réglé: ${autoFixed.map(f => `${f.issue} (${f.count})`).join(', ')}.` : '';
    const ragSummary = `ADMIN DIGEST ${now.toISOString().slice(0, 10)}: ${digest.headline}. Success ${stats.success_rate}%, ${stats.total_errors}/${stats.total_runs} errors. Agents DOWN: ${downCount}. P0: ${p0Count}, P1: ${p1Count}.${autoFixedSummary} Top issues: ${digest.top_issues.map(i => i.title).join(' | ')}`;
    await saveKnowledge(supabase, {
      content: ragSummary,
      summary: `Digest ${now.toISOString().slice(0, 10)} ${stats.success_rate}%`,
      agent: 'ceo',
      category: 'learning',
      source: 'admin_digest',
      confidence: 0.7,
      org_id: undefined,
    }).catch(() => {});

    // 2026-06-02 — Save each top_issue as its own learning so future digests
    // recognize recurring issues and propose escalating fixes instead of
    // re-suggesting the same one. Confidence boosted when issue repeats.
    for (const iss of digest.top_issues) {
      try {
        // Look for the SAME issue title in past 14d learnings.
        const since14d = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
        const { data: priorMatch } = await supabase
          .from('knowledge')
          .select('id, confidence, content')
          .eq('agent', 'ceo')
          .eq('source', 'admin_issue_recurring')
          .ilike('summary', `%${iss.title.slice(0, 40)}%`)
          .gte('created_at', since14d)
          .limit(1)
          .maybeSingle();
        const recurrence = priorMatch ? Math.min(0.95, (priorMatch.confidence || 0.5) + 0.1) : 0.5;
        const escalation = priorMatch
          ? `RÉCURRENT (vu ${priorMatch.content?.slice(0, 60) || 'récemment'}). Si ce fix n'a pas marché 2x, ESCALADER : changer de provider, désactiver l'agent en attendant, ou contacter le support.`
          : 'PREMIÈRE OCCURRENCE.';
        await saveKnowledge(supabase, {
          content: `ISSUE: ${iss.title}\nAGENTS: ${iss.agents.join(',')}\nFIX SUGGÉRÉ: ${iss.fix.slice(0, 300)}\nSTATUT: ${escalation}`,
          summary: `Recurring: ${iss.title.slice(0, 80)}`,
          agent: 'ceo',
          category: 'learning',
          source: 'admin_issue_recurring',
          confidence: recurrence,
          org_id: undefined,
        }).catch(() => {});
      } catch { /* non-fatal */ }
    }
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
      agents_down: downCount,
      p0_count: p0Count,
      p1_count: p1Count,
      auto_fixed_count: autoFixed.reduce((n, f) => n + f.count, 0),
      auto_fixed: autoFixed,
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
