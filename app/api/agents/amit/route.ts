import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { callGemini } from '@/lib/agents/gemini';
import { getAmitSystemPrompt, getAmitAnalysisPrompt } from '@/lib/agents/amit-prompt';
import { saveLearning, saveAgentFeedback, getAllAgentLearnings, getAgentFeedbacks } from '@/lib/agents/learning';
import { loadContextWithAvatar } from '@/lib/agents/shared-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const FOUNDER_EMAILS = ['contact@keiroai.com'];

/**
 * Helper: verify admin auth or CRON_SECRET.
 */
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
    // Auth failed
  }

  return { authorized: false };
}

/**
 * GET /api/agents/amit
 * Returns the last AMIT strategic report.
 */
export async function GET(request: NextRequest) {
  const { authorized, isCron } = await verifyAuth(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Cron trigger: generate a new analysis
  // Optional org_id passthrough for multi-tenant support
  const orgId = request.nextUrl.searchParams.get('org_id') || null;

  if (isCron) {
    console.log('[AMIT] Cron triggered — generating strategic analysis');
    return runStrategicAnalysis(orgId);
  }

  // Admin UI: return the last report
  try {
    const supabase = getSupabaseAdmin();
    const { data: report, error } = await supabase
      .from('agent_logs')
      .select('*')
      .eq('agent', 'amit')
      .eq('action', 'strategic_analysis')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !report) {
      return NextResponse.json({ ok: false, error: 'Aucun rapport AMIT disponible' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, report: report.data, created_at: report.created_at });
  } catch (error: any) {
    console.error('[AMIT] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST /api/agents/amit
 * action=analyze: Manually trigger a strategic analysis
 */
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configuree' }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const postOrgId = body?.org_id || null;
    if (body.action === 'analyze' || !body.action) {
      return runStrategicAnalysis(postOrgId);
    }

    return NextResponse.json({ ok: false, error: `Action inconnue: ${body.action}` }, { status: 400 });
  } catch (error: any) {
    console.error('[AMIT] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * Core AMIT analysis pipeline.
 */
async function runStrategicAnalysis(orgId: string | null = null): Promise<NextResponse> {
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  try {
    // ── 1. Load ALL learnings from ALL agents (score >= 40) ──
    const allLearnings = await getAllAgentLearnings(supabase);
    const learningsText = allLearnings.length > 0
      ? allLearnings.map(l =>
          `[${l.agent}/${l.category}] (score: ${l.confidence}, ${l.tier}) ${l.learning} — Evidence: ${l.evidence}`
        ).join('\n')
      : 'Aucun learning disponible (score >= 40).';

    // ── 2. Load ALL recent feedbacks (last 7 days) ──
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: allFeedbackLogs } = await supabase
      .from('agent_logs')
      .select('agent, data, created_at')
      .eq('action', 'agent_feedback')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(100);

    const feedbacksText = (allFeedbackLogs || []).length > 0
      ? (allFeedbackLogs || []).map((f: any) =>
          `[${f.data?.from_agent} → ${f.agent}] ${f.data?.feedback}`
        ).join('\n')
      : 'Aucun feedback inter-agents cette semaine.';

    // ── 3. Load CRM stats ──
    const { data: crmProspects } = await supabase
      .from('crm_prospects')
      .select('status, temperature, type')
      .limit(5000);

    const crmStats: Record<string, number> = {};
    for (const p of crmProspects || []) {
      crmStats[p.status || 'unknown'] = (crmStats[p.status || 'unknown'] || 0) + 1;
    }

    const tempStats: Record<string, number> = {};
    for (const p of crmProspects || []) {
      tempStats[p.temperature || 'unknown'] = (tempStats[p.temperature || 'unknown'] || 0) + 1;
    }

    const typeStats: Record<string, number> = {};
    for (const p of crmProspects || []) {
      typeStats[p.type || 'unknown'] = (typeStats[p.type || 'unknown'] || 0) + 1;
    }

    const crmStatsText = [
      `Total prospects: ${(crmProspects || []).length}`,
      `Par statut: ${Object.entries(crmStats).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
      `Par température: ${Object.entries(tempStats).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
      `Par type: ${Object.entries(typeStats).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
    ].join('\n');

    // ── 4. Load recent agent performance (last 7 days) ──
    const { data: agentPerf } = await supabase
      .from('agent_logs')
      .select('agent, action, status, created_at')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(500);

    const perfByAgent: Record<string, { runs: number; successes: number; failures: number }> = {};
    for (const log of agentPerf || []) {
      if (!perfByAgent[log.agent]) perfByAgent[log.agent] = { runs: 0, successes: 0, failures: 0 };
      perfByAgent[log.agent].runs++;
      if (log.status === 'success' || log.status === 'ok') perfByAgent[log.agent].successes++;
      else if (log.status === 'error' || log.status === 'failed') perfByAgent[log.agent].failures++;
    }

    const perfText = Object.entries(perfByAgent).length > 0
      ? Object.entries(perfByAgent).map(([agent, stats]) =>
          `${agent}: ${stats.runs} runs (${stats.successes} OK, ${stats.failures} erreurs, ${stats.runs - stats.successes - stats.failures} autres)`
        ).join('\n')
      : 'Aucune activité agent cette semaine.';

    // ── 5. Call Gemini with AMIT prompt ──
    const systemPrompt = getAmitSystemPrompt();
    const analysisPrompt = getAmitAnalysisPrompt({
      allLearnings: learningsText,
      agentFeedbacks: feedbacksText,
      crmStats: crmStatsText,
      recentPerformance: perfText,
    });

    console.log('[AMIT] Calling Gemini for strategic analysis...');
    const rawResponse = await callGemini({
      system: systemPrompt,
      message: analysisPrompt,
      maxTokens: 4000,
    });

    // ── 6. Parse JSON response ──
    let report: any;
    try {
      // Strip markdown backticks if present
      const cleaned = rawResponse
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      report = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[AMIT] JSON parse error, attempting salvage...');
      // Try to extract JSON from response
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          report = JSON.parse(jsonMatch[0]);
        } catch {
          console.error('[AMIT] JSON salvage failed');
          report = { raw_response: rawResponse, parse_error: true };
        }
      } else {
        report = { raw_response: rawResponse, parse_error: true };
      }
    }

    // ── 7. Save AMIT's own learnings from predictions ──
    if (report.predictions) {
      for (const pred of report.predictions.slice(0, 3)) {
        await saveLearning(supabase, {
          agent: 'amit',
          category: 'general',
          learning: pred.prediction,
          evidence: pred.basis,
          confidence: Math.min(pred.probability || 30, 50), // AMIT starts conservative
        }, orgId);
      }
    }

    // ── 8. Send strategic recommendations as feedbacks to relevant agents ──
    if (report.strategic_recommendations) {
      for (const rec of report.strategic_recommendations.slice(0, 5)) {
        if (rec.target_agent && rec.target_agent !== 'all') {
          await saveAgentFeedback(supabase, {
            from_agent: 'amit',
            to_agent: rec.target_agent,
            feedback: `[AMIT Strategic] ${rec.recommendation} (priorité: ${rec.priority}/10, impact: ${rec.expected_impact})`,
            category: 'general',
          }, orgId);
        }
      }
    }

    // ── 9. Save full report to agent_logs ──
    const durationMs = Date.now() - startTime;
    await supabase.from('agent_logs').insert({
      agent: 'amit',
      action: 'strategic_analysis',
      status: 'ok',
      target: 'all',
      data: {
        report,
        learnings_analyzed: allLearnings.length,
        feedbacks_analyzed: (allFeedbackLogs || []).length,
        prospects_total: (crmProspects || []).length,
        agents_active: Object.keys(perfByAgent).length,
        duration_ms: durationMs,
        generated_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    });

    console.log(`[AMIT] Strategic analysis complete in ${durationMs}ms`);

    // ── 10. Email report to founder via Resend ──
    await emailReportToFounder(report);

    return NextResponse.json({
      ok: true,
      report,
      meta: {
        learnings_analyzed: allLearnings.length,
        feedbacks_analyzed: (allFeedbackLogs || []).length,
        prospects_total: (crmProspects || []).length,
        agents_active: Object.keys(perfByAgent).length,
        duration_ms: durationMs,
      },
    });
  } catch (error: any) {
    console.error('[AMIT] Analysis error:', error);

    // Log the failure
    try {
      await supabase.from('agent_logs').insert({
        agent: 'amit',
        action: 'strategic_analysis',
        status: 'error',
        target: 'all',
        data: { error: error.message, stack: error.stack?.substring(0, 500) },
        created_at: new Date().toISOString(),
      });
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json({ ok: false, error: error.message || 'Erreur analyse AMIT' }, { status: 500 });
  }
}

/**
 * Send AMIT strategic report to founder via Resend (with Brevo fallback).
 */
async function emailReportToFounder(report: any): Promise<void> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  // Build a readable summary
  const trends = report.market_intelligence?.trends_detected || [];
  const opportunities = report.market_intelligence?.opportunities || [];
  const risks = report.market_intelligence?.risks || [];
  const recommendations = report.strategic_recommendations || [];
  const predictions = report.predictions || [];

  const sections: string[] = [];

  if (trends.length > 0) {
    sections.push('<h3>Tendances detectees</h3><ul>' +
      trends.map((t: any) => `<li><strong>${t.trend}</strong> (confiance: ${t.confidence}%, impact: ${t.impact})</li>`).join('') +
      '</ul>');
  }

  if (opportunities.length > 0) {
    sections.push('<h3>Opportunites</h3><ul>' +
      opportunities.map((o: any) => `<li><strong>${o.opportunity}</strong> — CA potentiel: ${o.potential_revenue} (effort: ${o.effort})</li>`).join('') +
      '</ul>');
  }

  if (risks.length > 0) {
    sections.push('<h3>Risques</h3><ul>' +
      risks.map((r: any) => `<li><strong>[${r.severity}]</strong> ${r.risk} — Mitigation: ${r.mitigation}</li>`).join('') +
      '</ul>');
  }

  if (recommendations.length > 0) {
    sections.push('<h3>Recommandations strategiques</h3><ol>' +
      recommendations.map((r: any) => `<li><strong>${r.recommendation}</strong> → ${r.target_agent} (priorite: ${r.priority}/10)</li>`).join('') +
      '</ol>');
  }

  if (predictions.length > 0) {
    sections.push('<h3>Predictions</h3><ul>' +
      predictions.map((p: any) => `<li>${p.prediction} (proba: ${p.probability}%, horizon: ${p.timeframe})</li>`).join('') +
      '</ul>');
  }

  const emailHtml = `
<!DOCTYPE html>
<html>
<head><style>body{font-family:Arial,sans-serif;color:#333;line-height:1.6;}h2{color:#0c1a3a;}.container{max-width:640px;margin:0 auto;padding:20px;}h3{color:#0c1a3a;margin-top:16px;}li{margin:4px 0;}</style></head>
<body>
<div class="container">
  <h2>AMIT — Rapport Strategique du ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
  ${sections.join('\n') || '<p>Pas assez de donnees pour generer un rapport complet.</p>'}
  <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;"/>
  <p style="color:#6b7280;font-size:12px;">Genere automatiquement par AMIT (Agent Marketing Intelligence & Trends) a ${new Date().toLocaleTimeString('fr-FR')}</p>
</div>
</body>
</html>`;

  const emailSubject = `AMIT Strategic — ${new Date().toLocaleDateString('fr-FR')}`;
  let emailSent = false;

  if (RESEND_API_KEY) {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'KeiroAI AMIT <contact@keiroai.com>',
          to: FOUNDER_EMAILS,
          subject: emailSubject,
          html: emailHtml,
        }),
      });

      if (resendRes.ok) {
        emailSent = true;
        console.log(`[AMIT] Report email sent via Resend to ${FOUNDER_EMAILS.join(', ')}`);
      } else {
        const errText = await resendRes.text();
        console.error('[AMIT] Resend email failed:', errText);
      }
    } catch (e: any) {
      console.error('[AMIT] Resend email error:', e.message);
    }
  }

  // Fallback: Brevo
  if (!emailSent && process.env.BREVO_API_KEY) {
    try {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'KeiroAI AMIT', email: 'contact@keiroai.com' },
          to: FOUNDER_EMAILS.map(e => ({ email: e })),
          subject: emailSubject,
          htmlContent: emailHtml,
        }),
      });

      if (brevoRes.ok) {
        console.log(`[AMIT] Report email sent via Brevo to ${FOUNDER_EMAILS.join(', ')}`);
      } else {
        const errText = await brevoRes.text();
        console.error('[AMIT] Brevo email failed:', errText);
      }
    } catch (e: any) {
      console.error('[AMIT] Brevo email error:', e.message);
    }
  }
}
