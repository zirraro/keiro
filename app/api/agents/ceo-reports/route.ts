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
  if (reportType === 'client_brief') {
    return handleClientBrief(supabase);
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
async function handleClientBrief(supabase: any) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const BREVO_CLIENT_KEY = process.env.BREVO_API_KEY;

  // Get all active clients with their profiles
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, first_name, plan')
    .not('plan', 'is', null);

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

      if (ANTHROPIC_KEY) {
        try {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 700,
              system: `Tu es Noah (stratege) et AMI (directrice marketing). Vous envoyez un brief quotidien PERSONNALISE a ${clientName}.

CONTEXTE CLIENT:
${clientContext || 'Nouveau client, pas encore de profil complet.'}

STRUCTURE (HTML):
1. <h4>Noah — Tes actions du jour</h4>
   - Resume POSITIF de ce que les agents ont fait (adapte au business du client)
   - Si agents en AUTO: rassure que tout tourne bien, mentionne les resultats
   - Si agents en MANUEL: rappelle les actions a valider (posts a approuver, emails a envoyer)
   - Si prospects chauds: nomme-les et dis quoi faire (appeler, DM, email)
   - 1-2 actions CONCRETES adaptees au type de business

2. <h4>AMI — Strategie marketing</h4>
   - 1 recommandation CONCRETE adaptee au business (ex: "Pour un restaurant a ${dossier?.city || 'ta ville'}, publie un reel de la cuisine entre 12h-13h")
   - 1 tendance ou opportunite du moment pour CE type de business
   - Si le client a des objectifs marketing, lie tes conseils a ces objectifs

REGLES:
- COURT (10 lignes max HTML), tutoiement, positif, zero jargon technique
- Adapte le ton au brand_tone du client (${dossier?.brand_tone || 'chaleureux'})
- Commence par "Salut ${clientName}!"
- Si rien ne s'est passe: "Tes agents preparent du contenu pour demain"
- ACTIONABLE: chaque point doit donner une action claire

INTERDIT: erreurs, echecs, "KeiroAI", jargon technique, taux d'erreur`,
              messages: [{ role: 'user', content: `Activite agents 24h: ${agentActivity || 'aucune'}\nAgents AUTO: ${autoAgents.join(', ') || 'aucun'}\nAgents MANUEL: ${manualAgents.join(', ') || 'aucun'}\nProspects total: ${prospectCount || 0}\nProspects HOT: ${hotCount || 0}\nPlan: ${client.plan}\n\nGenere le brief Noah + AMI du jour.` }],
            }),
          });
          if (res.ok) {
            const data = await res.json();
            briefHtml = data.content?.[0]?.text || '';
          }
        } catch { /* silent */ }
      }

      // Fallback if AI fails
      if (!briefHtml) {
        briefHtml = `<p>Bonjour ${clientName},</p>
<p>Tes agents ont realise <strong>${Object.values(agentSummary).reduce((a: number, b: any) => a + (b as number), 0)} actions</strong> dans les dernieres 24h.</p>
<p>Tu as <strong>${hotCount || 0} prospect(s) chaud(s)</strong> sur ${prospectCount || 0} total.</p>
<p><strong>Action du jour:</strong> Verifie tes prospects chauds dans ton CRM et envoie un DM personnalise aux 3 plus prometteurs.</p>`;
      }

      // Save as in-app notification
      if (prefs?.inapp_enabled !== false) {
        await supabase.from('client_notifications').insert({
          user_id: client.id,
          agent: 'ceo',
          type: 'brief',
          title: 'Brief Noah & AMI du jour',
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
            subject: `\u{1F4CB} Noah & AMI — Ton brief du jour${(hotCount || 0) > 0 ? ` (${hotCount} prospect${hotCount > 1 ? 's' : ''} chaud${hotCount > 1 ? 's' : ''})` : ''}`,
            htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:16px 20px;border-radius:12px 12px 0 0;">
                <h2 style="margin:0;font-size:16px;">\u{1F9E0} Noah Stratege & AMI Marketing — Brief du jour</h2>
              </div>
              <div style="background:white;padding:20px;border:1px solid #e5e7eb;">
                ${briefHtml}
              </div>
              <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:11px;border-radius:0 0 12px 12px;">
                Noah Stratege & AMI Marketing — Votre equipe IA
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
