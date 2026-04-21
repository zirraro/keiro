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

      // Tally concrete execution counts — query artifact tables directly.
      // Most agent_logs have null user_id (global log stream), so we cannot
      // use them for per-client metrics. Luckily `crm_prospects` has user_id
      // AND the per-prospect timestamps we need (last_email_sent_at,
      // last_email_opened_at, dm_sent_at, verified_at), so filtering there
      // gives us accurate per-client counts without fragile PostgREST joins.
      const sinceIso = since; // lookback window (24h by default)
      const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
      const [
        postsPublishedRes, postsDraftedRes,
        emailsSentRes, emailsOpenedRes, emailsClickedRes,
        dmsSentRes, dmsFollowedRes, followsToDoRes,
        prospectsVerifiedRes, prospectsAddedRes, gmapsImportsRes,
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
        // streak data: published_at dates over last 14 days
        supabase.from('content_calendar')
          .select('published_at')
          .eq('user_id', client.id)
          .eq('status', 'published')
          .gte('published_at', twoWeeksAgo)
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
        emails_sent: emailsSentRes.count || 0,
        emails_opened: emailsOpenedRes.count || 0,
        emails_clicked: emailsClickedRes.count || 0,
        dms_sent: dmsSentRes.count || 0,
        dms_followed: dmsFollowedRes.count || 0,
        follows_to_do: followsToDoRes.count || 0,
        prospects_verified: prospectsVerifiedRes.count || 0,
        prospects_added: prospectsAddedRes.count || 0,
        gmaps_imports: gmapsImportsRes.count || 0,
      };
      const lifetimeCounts = {
        emails: lifetimeEmailsRes.count || 0,
        posts: lifetimePostsRes.count || 0,
        prospects: lifetimeProspectsRes.count || 0,
        dms: lifetimeDmsRes.count || 0,
      };
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
      for (let i = 0; i < 14; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        if (publishedDays.has(d)) streak++;
        else break;
      }
      if (streak >= 3) {
        achievements.push(`🔥 <strong>${streak} jours d'affilée</strong> de publications Instagram — la régularité paie, continue !`);
      }

      // Week-over-week hot prospects
      const thisW = thisWeekHotRes.count || 0;
      const prevW = prevWeekHotRes.count || 0;
      if (thisW >= 10 && prevW === 0) {
        achievements.push(`📈 <strong>${thisW} prospects chauds</strong> cette semaine — nouveau pipeline qui démarre fort.`);
      } else if (thisW > prevW && prevW >= 5) {
        // Only flag % growth when the baseline is meaningful (>=5),
        // otherwise "2 → 45" becomes "+2150%" which looks like a bug.
        const pct = Math.round(((thisW - prevW) / prevW) * 100);
        achievements.push(`📈 <strong>+${pct}% de prospects chauds</strong> cette semaine (${prevW} → ${thisW}) — KeiroAI te remplit le pipeline.`);
      } else if (thisW > prevW && prevW > 0 && thisW - prevW >= 10) {
        // Small baseline but meaningful absolute growth → use raw numbers
        achievements.push(`📈 <strong>+${thisW - prevW} prospects chauds</strong> cette semaine (${prevW} → ${thisW}) — pipeline qui s'accélère.`);
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
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 500,
              system: `Tu es Noah, stratège chez KeiroAI. Tu envoies un ${isEvening ? 'DEBRIEF DU SOIR' : 'BRIEF DU MATIN'} court et chaleureux à ${clientName}.

CONTEXTE CLIENT:
${clientContext || 'Nouveau client, pas encore de profil complet.'}

FORMAT OBLIGATOIRE — HTML brut, tutoiement, zero jargon, 3 blocs SEULEMENT (les stats détaillées et la liste par agent sont ajoutées automatiquement par le template — tu n'as PAS à les réécrire):

<p style="margin:0 0 14px;font-size:14px;"><strong>${isEvening ? `Bonsoir ${clientName} 🌙` : `Salut ${clientName} 👋`}</strong> — une phrase punchy de félicitations ou d'accompagnement. ${isEvening ? 'Reconnais le travail accompli (ex: "belle journée, tes agents ont poussé fort" ou "journée calme, on reprend demain").' : 'Donne le ton de la journée qui commence (ex: "journée à fort potentiel" ou "journée de consolidation").'}</p>

<h4 style="margin:0 0 6px;color:#2563eb;font-size:13px;">${isEvening ? '📌 À lancer demain (tâche humaine)' : '📌 Ce que tu dois faire aujourd\u2019hui'}</h4>
<ul style="margin:0 0 12px;padding-left:18px;font-size:13px;">
  — 1 à 3 actions humaines concrètes. Verbe d'action + objet clair (ex: "Valide les 3 posts en attente dans Léna", "Relance les ${hotCount || 'X'} prospects chauds").
  — Si agent en MANUEL ou prospects chauds en attente, priorise-les.
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
- Pas de signature ni "Noah" final — le template la gère.
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

      // Stats strip — 6 tiles (3x2): full funnel production → outreach → pipeline.
      const openRate = doneCounts.emails_sent > 0
        ? Math.round((doneCounts.emails_opened / doneCounts.emails_sent) * 100)
        : 0;
      const statsStripHtml = `
<h4 style="margin:16px 0 8px;color:#374151;font-size:13px;">📊 Tes chiffres du jour</h4>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 12px;">
  <div style="background:#f0fdf4;border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:#16a34a;">${doneCounts.posts_published}</div>
    <div style="font-size:10px;color:#6b7280;">📸 Posts publiés</div>
  </div>
  <div style="background:#eff6ff;border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:#2563eb;">${doneCounts.emails_sent}</div>
    <div style="font-size:10px;color:#6b7280;">✉️ Emails envoyés</div>
  </div>
  <div style="background:#ecfeff;border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:#0891b2;">${doneCounts.emails_opened}${openRate > 0 ? ` <span style=\"font-size:11px;color:#6b7280;\">(${openRate}%)</span>` : ''}</div>
    <div style="font-size:10px;color:#6b7280;">👀 Emails ouverts</div>
  </div>
  <div style="background:#fdf4ff;border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:#a855f7;">${doneCounts.dms_sent}</div>
    <div style="font-size:10px;color:#6b7280;">💬 DMs envoyés</div>
  </div>
  <div style="background:#f5f3ff;border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:#7c3aed;">${doneCounts.prospects_added}</div>
    <div style="font-size:10px;color:#6b7280;">📥 Prospects ajoutés</div>
  </div>
  <div style="background:${hotCount > 0 ? '#fef3c7' : '#f9fafb'};border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:${hotCount > 0 ? '#d97706' : '#6b7280'};">${hotCount || 0}</div>
    <div style="font-size:10px;color:#6b7280;">🔥 Prospects chauds</div>
  </div>
</div>`;

      // Per-agent breakdown — only agents that did something show up
      const agentLines: string[] = [];
      if (doneCounts.posts_published > 0 || doneCounts.posts_drafted > 0 || weeklyLikes + weeklyComments > 0) {
        const parts = [];
        if (doneCounts.posts_published > 0) parts.push(`<strong>${doneCounts.posts_published}</strong> post${doneCounts.posts_published > 1 ? 's' : ''} publié${doneCounts.posts_published > 1 ? 's' : ''} sur Instagram`);
        if (doneCounts.posts_drafted > 0) parts.push(`<strong>${doneCounts.posts_drafted}</strong> en préparation`);
        if (weeklyLikes + weeklyComments > 0) parts.push(`<strong>${weeklyLikes}</strong> like${weeklyLikes > 1 ? 's' : ''} + <strong>${weeklyComments}</strong> commentaire${weeklyComments > 1 ? 's' : ''} reçu${weeklyComments > 1 ? 's' : ''} cette semaine`);
        agentLines.push(`<div style="margin:6px 0;"><strong style="color:#db2777;">🖼️ Léna</strong> <span style="color:#9ca3af;font-size:11px;">· content</span> — ${parts.join(', ')}</div>`);
      }
      if (doneCounts.emails_sent > 0 || doneCounts.emails_opened > 0) {
        const parts = [];
        if (doneCounts.emails_sent > 0) parts.push(`<strong>${doneCounts.emails_sent}</strong> envoyé${doneCounts.emails_sent > 1 ? 's' : ''}`);
        if (doneCounts.emails_opened > 0) parts.push(`<strong>${doneCounts.emails_opened}</strong> ouvert${doneCounts.emails_opened > 1 ? 's' : ''} (${openRate}%)`);
        if (doneCounts.emails_clicked > 0) parts.push(`<strong>${doneCounts.emails_clicked}</strong> clic${doneCounts.emails_clicked > 1 ? 's' : ''}`);
        agentLines.push(`<div style="margin:6px 0;"><strong style="color:#2563eb;">✉️ Hugo</strong> <span style="color:#9ca3af;font-size:11px;">· email</span> — ${parts.join(', ')}</div>`);
      }
      if (doneCounts.prospects_added > 0 || doneCounts.prospects_verified > 0) {
        const parts = [];
        if (doneCounts.prospects_added > 0) parts.push(`<strong>${doneCounts.prospects_added}</strong> ajouté${doneCounts.prospects_added > 1 ? 's' : ''} au CRM`);
        if (doneCounts.prospects_verified > 0) parts.push(`<strong>${doneCounts.prospects_verified}</strong> validé${doneCounts.prospects_verified > 1 ? 's' : ''} (joignables)`);
        agentLines.push(`<div style="margin:6px 0;"><strong style="color:#7c3aed;">🎯 Léo</strong> <span style="color:#9ca3af;font-size:11px;">· commercial</span> — ${parts.join(', ')}</div>`);
      }
      if (doneCounts.dms_sent > 0 || doneCounts.dms_followed > 0 || doneCounts.follows_to_do > 0) {
        const parts = [];
        if (doneCounts.dms_sent > 0) parts.push(`<strong>${doneCounts.dms_sent}</strong> DM${doneCounts.dms_sent > 1 ? 's' : ''} envoyé${doneCounts.dms_sent > 1 ? 's' : ''}`);
        if (doneCounts.dms_followed > 0) parts.push(`<strong>${doneCounts.dms_followed}</strong> follow${doneCounts.dms_followed > 1 ? 's' : ''} confirmé${doneCounts.dms_followed > 1 ? 's' : ''}`);
        if (doneCounts.follows_to_do > 0) parts.push(`<strong>${doneCounts.follows_to_do}</strong> compte${doneCounts.follows_to_do > 1 ? 's' : ''} à suivre manuellement (warm-up)`);
        agentLines.push(`<div style="margin:6px 0;"><strong style="color:#a855f7;">💬 Jade</strong> <span style="color:#9ca3af;font-size:11px;">· DM Instagram</span> — ${parts.join(', ')}</div>`);
      }
      if (doneCounts.gmaps_imports > 0) {
        agentLines.push(`<div style="margin:6px 0;"><strong style="color:#059669;">📍 Théo</strong> <span style="color:#9ca3af;font-size:11px;">· Google Maps</span> — <strong>${doneCounts.gmaps_imports}</strong> commerce${doneCounts.gmaps_imports > 1 ? 's' : ''} importé${doneCounts.gmaps_imports > 1 ? 's' : ''}</div>`);
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

      // Assembly order: achievements on top (dopamine), then AI narrative,
      // then per-agent detail, then stats tiles, then error footnote
      briefHtml = `${achievementsHtml}${briefHtml}${perAgentHtml}${statsStripHtml}${footerNote}`;

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
