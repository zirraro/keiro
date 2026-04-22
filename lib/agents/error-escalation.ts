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

  const supabase = getSupabase();
  const now = new Date().toISOString();

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
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': process.env.BREVO_API_KEY || '', 'content-type': 'application/json' },
        body: JSON.stringify({
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
        }),
      }).catch(() => {});
    }

    console.log(`[ErrorEscalation] ${report.agent}/${report.action} escalated: logged + RAG + solution + email`);
  } catch (err: any) {
    console.error(`[ErrorEscalation] Failed to escalate: ${err.message}`);
  }
}
