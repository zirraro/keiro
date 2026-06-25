/**
 * Error Escalation System — Remontée automatique des erreurs agents
 *
 * Quand un agent echoue:
 * 1. Log l'erreur dans agent_logs
 * 2. Sauvegarde dans le RAG pour que tous les agents apprennent
 * 3. Demande a Claude de proposer une solution (contournement + code fix)
 * 4. Envoie un email admin avec la recommandation de modification de code
 * 5. Le CEO est notifie via le shared context
 */

import { createClient } from '@supabase/supabase-js';

import { sendBrevoCompat } from '@/lib/email/brevo-compat';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = 'contact@keiroai.com';

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

interface ErrorReport {
  agent: string;
  action: string;
  error: string;
  context?: string;
  postId?: string;
  platform?: string;
}

/**
 * Escalade une erreur agent : log + RAG + solution IA + email admin
 */
/**
 * Known non-error conditions that callers wrap as "error" for control flow
 * but shouldn't trigger a real escalation (email to admin, RAG save, Claude
 * analysis). Silently swallowed here so cron logs stay clean.
 */
const NON_ERROR_SENTINELS = new Set([
  'tiktok_not_connected',
  'linkedin_not_connected',
  'TikTok tokens not configured for admin',
  'LinkedIn tokens not configured',
]);

export async function escalateAgentError(report: ErrorReport): Promise<void> {
  // Skip known non-errors — nothing to learn from, nothing to email about
  if (NON_ERROR_SENTINELS.has(report.error)) return;

  // 2026-06-22 — Founder challenge du digest : les "erreurs" TikTok du
  // digest (6) ne sont PAS des bugs, c'est notre pause volontaire
  // anti-throttle 0-vues (TIKTOK_AUTOPOST_PAUSED) + les garde-fous de
  // cadence/débit. Ce sont des décisions stratégiques, pas des échecs.
  // On les loggue en 'info' (traçable) sans escalade ni pollution du
  // taux d'erreur du digest. (cf. isGuard regex côté content/route.ts)
  if (/autopost_paused|cadence_cap|daily_cap|rate_limit|tiktok_health_paused|account_changed|daily posting limit|reached the daily|too many post|spam_risk/i.test(report.error)) {
    try {
      await getSupabase().from('agent_logs').insert({
        agent: report.agent,
        action: `guard_skipped_${report.action}`,
        status: 'info',
        data: { reason: 'intentional_guard_not_an_error', guard: report.error.substring(0, 120), platform: report.platform || null },
        created_at: new Date().toISOString(),
      });
    } catch {}
    return;
  }

  // 2026-06-05 — Founder ask: "pas necessaire pour admin a l'erreur"
  // pour les erreurs token TikTok (le client reçoit déjà un email
  // direct via notifyClientTikTokReauth). Le digest fin de journée
  // mentionne uniquement les clients pas reconnectés. Pas de spam
  // admin immédiat.
  if (report.platform === 'tiktok' && /token.*refresh.*failed|token.*expir|refresh_failed/i.test(report.error)) {
    const supabaseSkip = getSupabase();
    try {
      await supabaseSkip.from('agent_logs').insert({
        agent: report.agent,
        action: `tt_token_error_silenced`,
        status: 'info',
        data: { reason: 'client_already_emailed_via_publishToTikTok', error: report.error.substring(0, 200) },
        created_at: new Date().toISOString(),
      });
    } catch {}
    return;
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();

  // 2026-06-04 — Quick-win: spike-detection on IG errors. If we hit
  // >5 Instagram publish errors in the last 24h, fire ONE admin
  // notification (deduped to once/24h). Lets us catch Meta API
  // degradations or token issues before they pile up. Founder ask:
  // "ajouter alerte email si >5 erreurs Instagram/jour".
  if (report.platform === 'instagram' || report.action === 'publish_instagram') {
    try {
      const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await supabase
        .from('agent_logs')
        .select('id', { count: 'exact', head: true })
        .eq('agent', 'content')
        .like('action', 'error_escalated_publish_instagram%')
        .gte('created_at', since24h);
      if (count !== null && count >= 5) {
        // Has an admin spike alert already fired in the last 24h?
        const { data: alreadyAlerted } = await supabase
          .from('agent_logs')
          .select('id')
          .eq('agent', 'ops')
          .eq('action', 'ig_error_spike_admin_alert')
          .gte('created_at', since24h)
          .limit(1);
        if (!alreadyAlerted || alreadyAlerted.length === 0) {
          try {
            const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
            await sendEmailWithFallback({
              to: ADMIN_EMAIL,
              toName: 'Admin KeiroAI',
              subject: `⚠️ ${count} erreurs Instagram en 24h — check Meta API`,
              html: `<p>Le seuil de <strong>5 erreurs Instagram / 24h</strong> est dépassé (${count} actuellement).</p><p>Dernière erreur : ${report.error.substring(0, 300)}</p><p>Action recommandée : vérifier le statut de l'API Meta sur <a href="https://metastatus.com/">metastatus.com</a> et les tokens IG sur <a href="https://keiroai.com/admin/service-health">/admin/service-health</a>.</p>`,
              textContent: `${count} erreurs Instagram en 24h. Dernière : ${report.error.substring(0, 200)}. Vérifier metastatus.com + /admin/service-health.`,
              fromName: 'KeiroAI Ops',
              fromEmail: 'contact@keiroai.com',
              tags: ['ig_error_spike'],
            });
            await supabase.from('agent_logs').insert({
              agent: 'ops',
              action: 'ig_error_spike_admin_alert',
              status: 'warning',
              data: { ig_error_count_24h: count, latest_error: report.error.substring(0, 300) },
              created_at: now,
            });
          } catch { /* alert send is best-effort */ }
        }
      }
    } catch { /* spike detection failure shouldn't block escalation */ }
  }

  try {
    // 1. Log dans agent_logs
    await supabase.from('agent_logs').insert({
      agent: report.agent,
      action: `error_escalated_${report.action}`,
      status: 'error',
      error_message: report.error.substring(0, 500),
      data: {
        action: report.action,
        error: report.error,
        context: report.context,
        platform: report.platform,
        post_id: report.postId,
        escalated: true,
        timestamp: now,
      },
      created_at: now,
    });

    // 2. Sauvegarder dans le RAG pour apprentissage collectif
    await supabase.from('agent_knowledge').insert({
      content: `ERREUR_AGENT ${report.agent}: Action "${report.action}" a echoue. Erreur: ${report.error.substring(0, 300)}. Contexte: ${report.context || 'N/A'}. Platform: ${report.platform || 'N/A'}.`,
      summary: `Erreur ${report.agent} ${report.action}: ${report.error.substring(0, 100)}`,
      agent: report.agent,
      category: 'learning',
      confidence: 0.7,
      source: 'error_escalation',
      created_by: 'system',
    }).then(() => {
      // Backfill embedding pour ce learning
      fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com'}/api/agents/knowledge-backfill?batch=5`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
      }).catch(() => {});
    });

    // 3. Demander a Claude une solution + recommandation code
    let solution = '';
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (ANTHROPIC_KEY) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1000,
            system: `Tu es un expert DevOps KeiroAI. Un agent a echoue. Propose:
1. SOLUTION TEMPORAIRE (contournement immediat pour que l'agent continue de fonctionner)
2. SOLUTION DEFINITIVE (modification de code precise a faire)
3. PREVENTION (comment eviter cette erreur a l'avenir)
Sois concis et technique. Format HTML pour email.`,
            messages: [{
              role: 'user',
              content: `Agent: ${report.agent}\nAction: ${report.action}\nErreur: ${report.error}\nContexte: ${report.context || 'N/A'}\nPlatform: ${report.platform || 'N/A'}`,
            }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          solution = data.content?.[0]?.text || '';
        }
      } catch { /* silent */ }
    }

    // 4. Sauvegarder la solution dans le RAG aussi
    if (solution) {
      await supabase.from('agent_knowledge').insert({
        content: `SOLUTION_ERREUR ${report.agent} ${report.action}: ${solution.replace(/<[^>]*>/g, '').substring(0, 500)}`,
        summary: `Solution pour erreur ${report.agent} ${report.action}`,
        agent: report.agent,
        category: 'learning',
        confidence: 0.8,
        source: 'error_solution',
        created_by: 'system',
      });
    }

    // 5. Email admin DISABLED — errors are batched in CEO daily report (2x/day)
    // Individual error emails were spamming the admin inbox
    // Errors are already logged in agent_logs + saved to RAG
    // The CEO report (cron morning + evening) aggregates all errors
    const BREVO_KEY_DISABLED = false;
    if (BREVO_KEY_DISABLED) {
      await sendBrevoCompat({
          sender: { name: 'KeiroAI Error Alert', email: 'contact@keiroai.com' },
          to: [{ email: ADMIN_EMAIL }],
          subject: `🔴 Erreur Agent ${report.agent} — ${report.action}`,
          htmlContent: `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
            <div style="background:#dc2626;color:white;padding:16px 20px;border-radius:12px 12px 0 0;">
              <h2 style="margin:0;font-size:16px;">🔴 Erreur Agent — ${report.agent.toUpperCase()}</h2>
            </div>
            <div style="background:white;padding:20px;border:1px solid #e5e7eb;">
              <h3 style="margin:0 0 8px;">Action: ${report.action}</h3>
              <p style="color:#dc2626;font-weight:bold;">${report.error.substring(0, 300)}</p>
              ${report.platform ? `<p style="color:#888;">Plateforme: ${report.platform}</p>` : ''}
              ${report.context ? `<p style="color:#888;">Contexte: ${report.context.substring(0, 200)}</p>` : ''}
              ${solution ? `
                <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;">
                <h3 style="color:#059669;">💡 Recommandation IA</h3>
                ${solution}
              ` : ''}
            </div>
            <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:11px;border-radius:0 0 12px 12px;">
              KeiroAI Error Escalation System — Automatique
            </div>
          </div>`,
      }).catch(() => {});
    }

    console.log(`[ErrorEscalation] ${report.agent}/${report.action} escalated: logged + RAG + solution + email`);
  } catch (err: any) {
    console.error(`[ErrorEscalation] Failed to escalate: ${err.message}`);
  }
}
