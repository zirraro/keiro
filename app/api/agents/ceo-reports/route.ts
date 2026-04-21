import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { saveLearning } from '@/lib/agents/learning';
import { saveKnowledge } from '@/lib/agents/knowledge-rag';

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

  // ─── Client brief: separate flow ─────────────────────
  // ?type=client_brief   — morning brief (7h Paris): today's plan
  // ?type=client_evening — evening debrief (20h Paris): what ran today
  if (reportType === 'client_brief' || reportType === 'client_evening') {
    return handleClientBrief(supabase, reportType === 'client_evening' ? 'evening' : 'morning');
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
    if (ANTHROPIC_KEY && failures.length > 0) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2000,
            system: `Tu es Noah, CEO IA de KeiroAI. Tu analyses les echecs des agents et proposes des ameliorations CODE concretes.
Pour chaque probleme, donne:
1. Agent concerne
2. Probleme identifie
3. Impact business
4. Solution code concrete (snippet ou modification precise)
5. Priorite (P0/P1/P2)

Format HTML pour email. Sois direct et actionable.`,
            messages: [{ role: 'user', content: `Echecs des dernieres 24h:\n${failures.map((f: any) => `${f.agent}: ${f.data?.error || f.data?.action || 'unknown'}`).join('\n')}\n\nSucces: ${successes.length}\nTotal runs: ${totalRuns}\nError rate: ${errorRate}%` }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          aiAnalysis = data.content?.[0]?.text || '';
        }
      } catch { /* silent */ }
    }

    // Send email
    if (BREVO_KEY) {
      const agentStatusRows = ALL_AGENTS.map(a => {
        const d = agentData[a];
        const icon = d.runs === 0 ? '\u274C' : d.errors > 0 ? '\u26A0\uFE0F' : '\u2705';
        return `<tr><td style="padding:4px 8px;">${icon} ${a}</td><td style="padding:4px 8px;">${d.runs}</td><td style="padding:4px 8px;color:${d.errors > 0 ? '#ef4444' : '#22c55e'}">${d.errors}</td><td style="padding:4px 8px;font-size:11px;color:#888;">${d.lastAction}</td></tr>`;
      }).join('');

      const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': BREVO_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
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
        }),
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

    const statusEmailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': BREVO_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
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
      }),
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
async function handleClientBrief(supabase: any, timeOfDay: 'morning' | 'evening' = 'morning') {
  const isEvening = timeOfDay === 'evening';
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

      // Frequency gating: daily (default), every_2_days, weekly, biweekly, monthly
      // Read from prefs or from ceo agent config
      const freq: string = prefs?.frequency || ceoConfig?.config?.report_frequency || 'daily';
      const now = new Date();
      const dayOfMonth = now.getUTCDate();
      const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon...
      const dayOfYear = Math.floor((now.getTime() - new Date(now.getUTCFullYear(), 0, 0).getTime()) / 86400000);

      if (freq === 'every_2_days' && dayOfYear % 2 !== 0) continue;
      if (freq === 'weekly' && dayOfWeek !== 1) continue;       // Monday only
      if (freq === 'biweekly' && (dayOfWeek !== 1 || Math.floor(dayOfYear / 7) % 2 !== 0)) continue;
      if (freq === 'monthly' && dayOfMonth !== 1) continue;      // 1st of month

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

      // Tally concrete execution counts — query artifact tables directly
      // because most agent_logs are inserted without user_id (global log
      // stream) so counting from `logs` filtered by client.id would
      // undercount drastically. Counting published posts / dm queue rows /
      // prospects gives the real per-client picture.
      const sinceIso = since; // lookback window (24h by default)
      const [postsPublishedRes, postsDraftedRes, dmsSentRes, dmsPreparedRes, prospectsAddedRes, emailsSentRes] = await Promise.all([
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
        supabase.from('dm_queue')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .eq('status', 'sent')
          .gte('updated_at', sinceIso),
        supabase.from('dm_queue')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .in('status', ['ready', 'pending'])
          .gte('created_at', sinceIso),
        supabase.from('crm_prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .gte('created_at', sinceIso),
        supabase.from('crm_activities')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'email')
          .contains('data', { direction: 'outbound' })
          .gte('created_at', sinceIso),
      ]);
      const doneCounts = {
        posts_published: postsPublishedRes.count || 0,
        posts_drafted: postsDraftedRes.count || 0,
        emails_sent: emailsSentRes.count || 0,
        dms_prepared: dmsPreparedRes.count || 0,
        dms_sent: dmsSentRes.count || 0,
        comments_replied: (logs || []).filter((l: any) => l.agent === 'instagram_comments' && l.action === 'reply_sent').length,
        prospects_added: prospectsAddedRes.count || 0,
      };
      const errorCount  = (logs || []).filter((l: any) => l.status === 'error' || l.action === 'execution_failure').length;
      const totalDone   = Object.values(doneCounts).reduce((a, b) => a + b, 0);

      if (ANTHROPIC_KEY) {
        try {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 600,
              system: `Tu es Noah (stratege KeiroAI). Tu envoies un ${isEvening ? 'DEBRIEF DU SOIR' : 'BRIEF DU MATIN'} SCANNABLE a ${clientName}.

CONTEXTE CLIENT:
${clientContext || 'Nouveau client, pas encore de profil complet.'}

FORMAT OBLIGATOIRE (HTML strict, tutoiement, zero jargon) — 4 blocs courts:

<p style="margin:0 0 12px;font-size:14px;"><strong>${isEvening ? `Bonsoir ${clientName} 🌙` : `Salut ${clientName} 👋`}</strong> — une phrase punchy qui dit en 1 ligne ${isEvening ? 'si la journee a ete productive ou calme, et si quelque chose necessite ton attention demain' : 'si la journee est productive, a surveiller, ou calme'}.</p>

<h4 style="margin:0 0 6px;color:#16a34a;font-size:13px;">✅ ${isEvening ? 'Ce qui a ete execute aujourd\u2019hui' : 'Ce que tes agents ont fait (24h)'}</h4>
<ul style="margin:0 0 12px;padding-left:18px;font-size:13px;">
  — 3 a 5 puces ULTRA COURTES (une ligne chacune).
  — Preference: actions mesurables ("12 emails envoyes", "2 posts IG publies", "5 prospects chauds detectes").
  — Si rien cote agent X, ne liste pas X — pas de "0 posts" inutile.
</ul>

<h4 style="margin:0 0 6px;color:#2563eb;font-size:13px;">${isEvening ? '📌 A lancer demain (tache humaine)' : '📌 Ce que tu dois faire aujourd\u2019hui'}</h4>
<ul style="margin:0 0 12px;padding-left:18px;font-size:13px;">
  — 1 a 3 actions humaines concretes.
  — Chaque action = 1 verbe d'action + lien mental (ex: "Valide les 3 posts en attente dans Léna").
  — Si agent en MANUEL ou prospects chauds, priorise-les ici.
  — Si rien d'urgent cote humain, dis-le: "${isEvening ? 'Rien a faire demain cote humain, tout tourne en auto' : 'Rien a faire aujourd\u2019hui, tout tourne en auto'}".
</ul>

<h4 style="margin:0 0 6px;color:#a855f7;font-size:13px;">⚡ Sur les rails (auto)</h4>
<ul style="margin:0 0 12px;padding-left:18px;font-size:13px;">
  — 1 a 2 puces qui rassurent sur ce qui tourne en automatique sans intervention.
  — Ex: "Hugo envoie la sequence fleuristes en Ile-de-France", "Léna publie demain 3 posts IG".
</ul>

REGLES ABSOLUES:
- Tutoiement. Chaleureux.
- Pas de phrase de transition ("Voici", "Je vous informe", "N'hesite pas").
- Pas de bloc "Stats" — les stats sont ajoutees par le template.
- Pas de signature finale ("Noah", "A demain") — le template la gere.
- Pas de mention KeiroAI, erreurs, taux d'erreur.
- Si la journee est calme (0 action): reste positif ("Tes agents preparent la journee de demain").
- SORTIE: HTML brut uniquement. NE PAS entourer la reponse de \`\`\`html ... \`\`\` ni de balises markdown. Commence directement par <p>.
`,
              messages: [{ role: 'user', content:
`Stats brutes 24h:
- Posts publies: ${doneCounts.posts_published}
- Posts en brouillon: ${doneCounts.posts_drafted}
- Emails envoyes: ${doneCounts.emails_sent}
- DMs prepares: ${doneCounts.dms_prepared}
- DMs envoyes: ${doneCounts.dms_sent}
- Commentaires repondus: ${doneCounts.comments_replied}
- Prospects ajoutes: ${doneCounts.prospects_added}
- Prospects chauds: ${hotCount || 0} (sur ${prospectCount || 0})
- Agents AUTO: ${autoAgents.join(', ') || 'aucun'}
- Agents MANUEL: ${manualAgents.join(', ') || 'aucun'}
- Plan: ${client.subscription_plan}

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

      // Fallback if AI fails — still scannable + structured
      if (!briefHtml) {
        briefHtml = `<p style="margin:0 0 12px;"><strong>Salut ${clientName} 👋</strong> — ${totalDone > 0 ? `tes agents ont realise ${totalDone} actions ces dernieres 24h.` : 'journee calme, tes agents preparent la suite.'}</p>
${totalDone > 0 ? `<h4 style="margin:0 0 6px;color:#16a34a;">✅ Ce qui a ete fait</h4><ul style="margin:0 0 12px;padding-left:18px;">
  ${doneCounts.posts_published > 0 ? `<li>${doneCounts.posts_published} post(s) publie(s)</li>` : ''}
  ${doneCounts.emails_sent > 0 ? `<li>${doneCounts.emails_sent} email(s) envoye(s)</li>` : ''}
  ${doneCounts.dms_sent > 0 ? `<li>${doneCounts.dms_sent} DM(s) envoye(s)</li>` : ''}
  ${doneCounts.dms_prepared > 0 ? `<li>${doneCounts.dms_prepared} DM(s) prepare(s) — a valider</li>` : ''}
  ${doneCounts.prospects_added > 0 ? `<li>${doneCounts.prospects_added} nouveau(x) prospect(s)</li>` : ''}
</ul>` : ''}
${hotCount > 0 ? `<h4 style="margin:0 0 6px;color:#2563eb;">📌 A faire aujourd'hui</h4><ul style="margin:0 0 12px;padding-left:18px;"><li>Contacter ${hotCount} prospect(s) chaud(s) dans ton CRM</li></ul>` : ''}`;
      }

      // Stats strip — same data but as big tiles, always appended after the
      // AI-authored body so the client sees numbers at a glance
      const statsStripHtml = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0 8px;">
  <div style="background:#f0fdf4;border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:#16a34a;">${doneCounts.posts_published}</div>
    <div style="font-size:10px;color:#6b7280;">Posts publies</div>
  </div>
  <div style="background:#eff6ff;border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:#2563eb;">${doneCounts.emails_sent}</div>
    <div style="font-size:10px;color:#6b7280;">Emails envoyes</div>
  </div>
  <div style="background:#fdf4ff;border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:#a855f7;">${doneCounts.dms_sent + doneCounts.dms_prepared}</div>
    <div style="font-size:10px;color:#6b7280;">DMs (envoyes + prets)</div>
  </div>
  <div style="background:${hotCount > 0 ? '#fef3c7' : '#f9fafb'};border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:${hotCount > 0 ? '#d97706' : '#6b7280'};">${hotCount || 0}</div>
    <div style="font-size:10px;color:#6b7280;">Prospects chauds</div>
  </div>
</div>
${errorCount > 0 ? `<p style="font-size:11px;color:#9ca3af;margin:4px 0 0;">${errorCount} incident(s) technique(s) detecte(s) — notre equipe les regarde.</p>` : ''}`;
      briefHtml = `${briefHtml}${statsStripHtml}`;

      // Save as in-app notification
      if (prefs?.inapp_enabled !== false) {
        await supabase.from('client_notifications').insert({
          user_id: client.id,
          agent: 'ceo',
          type: 'brief',
          title: isEvening ? 'Debrief du soir — Noah' : 'Brief du matin — Noah',
          message: briefHtml.replace(/<[^>]*>/g, '').substring(0, 300),
          data: { html: briefHtml, agentActivity: agentSummary, prospects: prospectCount, hot: hotCount },
        });
      }

      // Send email
      if (BREVO_CLIENT_KEY && prefs?.email_enabled !== false && client.email) {
        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'accept': 'application/json', 'api-key': BREVO_CLIENT_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'Noah CEO IA', email: 'contact@keiroai.com' },
            to: [{ email: client.email }],
            subject: isEvening
              ? `\u{1F319} Noah — Debrief du soir · ${totalDone} actions${hotCount > 0 ? ` · ${hotCount} chaud${hotCount > 1 ? 's' : ''} a relancer demain` : ''}`
              : `\u{1F4CB} Noah — ${totalDone} actions aujourd'hui${hotCount > 0 ? ` · ${hotCount} chaud${hotCount > 1 ? 's' : ''} a contacter` : ''}`,
            htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:16px 20px;border-radius:12px 12px 0 0;">
                <h2 style="margin:0;font-size:16px;">\u{1F9E0} Noah — ${isEvening ? 'Debrief du soir' : 'Brief du jour'}</h2>
                <p style="margin:4px 0 0;color:#a0aec0;font-size:12px;">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              </div>
              <div style="background:white;padding:20px;border:1px solid #e5e7eb;">
                ${briefHtml}
              </div>
              <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:11px;border-radius:0 0 12px 12px;">
                Noah — Ton stratège chez KeiroAI
              </div>
            </div>`,
          }),
        }).catch(() => {});
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
