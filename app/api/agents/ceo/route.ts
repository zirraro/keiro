import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getCeoSystemPrompt, getCeoArchitectureKnowledge, getCeoChatSystemAddendum } from '@/lib/agents/ceo-prompt';
import { getCeoIntelligenceSummary, setDirectiveForAgent } from '@/lib/agents/agent-memory';

export const maxDuration = 120;

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Founder email for briefs
const FOUNDER_EMAIL = 'mrzirraro@gmail.com';

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
 * GET /api/agents/ceo
 * - If called from CRON (CRON_SECRET header): GENERATE a new daily brief
 * - If called from admin UI: return the most recent brief
 */
export async function GET(request: NextRequest) {
  const { authorized, isCron } = await verifyAuth(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Vercel crons make GET requests — when CRON_SECRET is present, generate a new brief
  if (isCron) {
    console.log('[CEOAgent] Cron triggered — generating new daily brief');
    return generateBrief();
  }

  // Chat history: return last 20 CEO chat messages for conversation reload
  const historyParam = request.nextUrl.searchParams.get('history');
  if (historyParam === 'true') {
    try {
      const supabase = getSupabaseAdmin();
      const { data: chatLogs } = await supabase
        .from('agent_logs')
        .select('data, created_at')
        .eq('agent', 'ceo')
        .eq('action', 'chat')
        .order('created_at', { ascending: false })
        .limit(20);

      // Reconstruct messages from logs (each log has {message, reply})
      const messages: Array<{ role: string; content: string }> = [];
      for (const log of (chatLogs || []).reverse()) {
        if (log.data?.message) messages.push({ role: 'user', content: log.data.message });
        if (log.data?.reply) messages.push({ role: 'assistant', content: log.data.reply });
      }
      return NextResponse.json({ ok: true, messages });
    } catch (error: any) {
      console.error('[CEOAgent] History error:', error);
      return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
    }
  }

  // Admin UI: return the last brief
  try {
    const supabase = getSupabaseAdmin();
    const { data: brief, error } = await supabase
      .from('agent_logs')
      .select('*')
      .eq('agent', 'ceo')
      .eq('action', 'daily_brief')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !brief) {
      return NextResponse.json({ ok: false, error: 'Aucun brief disponible' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, brief: brief.data, created_at: brief.created_at });
  } catch (error: any) {
    console.error('[CEOAgent] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST /api/agents/ceo
 * - action=brief: Manually trigger a new daily brief
 * - action=chat: Direct conversation with the CEO agent (admin only)
 */
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY non configuree' }, { status: 500 });
  }

  // Check if this is a chat request
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === 'chat' && body.message) {
      return handleCeoChat(body.message, body.history || []);
    }
  } catch {}

  return generateBrief();
}

/**
 * Direct chat with the CEO agent. Admin can discuss strategy, ask for changes, get recommendations.
 */
async function handleCeoChat(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<NextResponse> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Quick metrics for context
    const { count: totalProspects } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true });
    const { count: hotProspects } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'hot');
    const { count: emailsSent24h } = await supabase
      .from('agent_logs').select('id', { count: 'exact', head: true })
      .eq('agent', 'email').gte('created_at', twentyFourHoursAgo);
    const { count: dmsPrepared24h } = await supabase
      .from('agent_logs').select('id', { count: 'exact', head: true })
      .eq('agent', 'dm_instagram').gte('created_at', twentyFourHoursAgo);

    // Load persistent CEO memory (last 5 briefs summaries + key decisions)
    const { data: recentBriefs } = await supabase
      .from('agent_logs')
      .select('data, created_at')
      .eq('agent', 'ceo')
      .eq('action', 'daily_brief')
      .order('created_at', { ascending: false })
      .limit(3);

    let briefsMemory = '';
    if (recentBriefs && recentBriefs.length > 0) {
      const briefSummaries = recentBriefs.map((b: any) => {
        const date = new Date(b.created_at).toLocaleDateString('fr-FR');
        const text = b.data?.brief_text || b.data?.brief?.summary || b.data?.brief?.brief_fondateur || 'N/A';
        // Take first 200 chars of each brief
        return `[${date}] ${typeof text === 'string' ? text.substring(0, 200) : 'N/A'}`;
      }).join('\n');
      briefsMemory = `\nDERNIERS BRIEFS (memoire):\n${briefSummaries}`;
    }

    // Load past conversation decisions/key topics (from chat logs)
    const { data: pastChats } = await supabase
      .from('agent_logs')
      .select('data, created_at')
      .eq('agent', 'ceo')
      .eq('action', 'chat')
      .order('created_at', { ascending: false })
      .limit(10);

    let chatMemory = '';
    if (pastChats && pastChats.length > 0) {
      const keyDecisions = pastChats
        .filter((c: any) => c.data?.message)
        .map((c: any) => {
          const date = new Date(c.created_at).toLocaleDateString('fr-FR');
          return `[${date}] Fondateur: "${(c.data.message as string).substring(0, 80)}"`;
        }).join('\n');
      chatMemory = `\nHISTORIQUE DECISIONS (ce que le fondateur a demande):\n${keyDecisions}`;
    }

    // Fetch recent agent reports for chat context
    const { data: recentReports } = await supabase
      .from('agent_logs')
      .select('agent, data, created_at')
      .eq('action', 'report_to_ceo')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(20);

    let reportsMemory = '';
    if (recentReports && recentReports.length > 0) {
      const reportLines = recentReports.map((r: any) => {
        const time = new Date(r.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return `[${time}] ${r.data?.message || `${r.agent}: ${r.data?.phase}`}`;
      });
      reportsMemory = `\nRAPPORTS DES AGENTS (dernières 24h):\nLes agents te font un retour quand ils démarrent et terminent une tâche:\n${reportLines.join('\n')}`;
    }

    const contextMetrics = `
Metriques live:
- Prospects total: ${totalProspects ?? 0}
- Prospects chauds: ${hotProspects ?? 0}
- Emails envoyes 24h: ${emailsSent24h ?? 0}
- DMs prepares 24h: ${dmsPrepared24h ?? 0}
${briefsMemory}
${chatMemory}
${reportsMemory}

CAPACITES ACTUELLES:
- Email cold: max 50/jour (Brevo limit), 5 slots horaires (early_morning/morning/midday/afternoon/evening)
- DM Instagram: max 10/jour (limit anti-spam), 2 slots (matin/soir)
- TikTok comments: max 5/jour, 1 slot (soir)
- Timing intelligent par type de business (12 categories x 4 canaux)
- Verification prospect (type, email, ville, coherence nom/type)
- Prospection externe: Google Places API, 30 zones, 7 villes (Paris, Lyon, Marseille, Bordeaux, Lille, Toulouse, Nice)

Tu peux proposer des changements concrets:
- Augmenter/diminuer les limites d'envoi
- Changer les heures de cron
- Modifier les templates email/DM
- Ajouter/supprimer des categories business
- Ajuster le scoring des prospects
- Modifier les sequences (delais entre emails, nombre d'etapes)

EXECUTION DES ORDRES:
Quand le fondateur te demande un changement technique (code, config, cron, template, etc.), tu dois donner des INSTRUCTIONS PRECISES et EXECUTABLES au format suivant:
---INSTRUCTION---
Fichier: chemin/du/fichier.ts
Ligne: ~numero (approximatif)
Action: modifier/ajouter/supprimer
Avant: (code actuel si modification)
Apres: (nouveau code)
Raison: pourquoi ce changement
---FIN---
Le fondateur copiera ces instructions dans Claude Code pour execution directe. Sois precis sur les noms de fichiers, variables et valeurs.

Reponds en francais, sois direct et actionnable.`;

    const messages = [
      ...history.map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user' as const, content: message },
    ];

    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: `${getCeoSystemPrompt()}\n\n${getCeoArchitectureKnowledge()}\n\n${getCeoChatSystemAddendum(contextMetrics)}`,
      messages,
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : '';

    // Log the conversation with richer metadata
    await supabase.from('agent_logs').insert({
      agent: 'ceo',
      action: 'chat',
      data: {
        message,
        reply,
        history_length: history.length,
        metrics_snapshot: {
          prospects: totalProspects ?? 0,
          hot: hotProspects ?? 0,
          emails_24h: emailsSent24h ?? 0,
          dms_24h: dmsPrepared24h ?? 0,
        },
      },
      created_at: now.toISOString(),
    });

    // Extract and insert any orders from the CEO chat reply
    await extractAndInsertOrders(supabase, reply, now.toISOString());

    return NextResponse.json({ ok: true, reply });
  } catch (error: any) {
    console.error('[CEOAgent] Chat error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * Core: generate the daily CEO brief, store it, email it to founder.
 */
async function generateBrief(): Promise<NextResponse> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const nowISO = now.toISOString();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    console.log('[CEOAgent] Collecting metrics...');

    // --- Collect 24h metrics ---
    const { data: logs24h } = await supabase
      .from('agent_logs')
      .select('agent, action')
      .gte('created_at', twentyFourHoursAgo);

    const logCounts24h: Record<string, number> = {};
    for (const log of logs24h || []) {
      const key = `${log.agent}_${log.action}`;
      logCounts24h[key] = (logCounts24h[key] || 0) + 1;
    }

    // Prospect counts by temperature
    const { data: prospectsByTemp } = await supabase
      .from('crm_prospects')
      .select('temperature');

    const tempCounts: Record<string, number> = {};
    for (const p of prospectsByTemp || []) {
      const t = p.temperature || 'unknown';
      tempCounts[t] = (tempCounts[t] || 0) + 1;
    }

    // Prospect counts by status
    const { data: prospectsByStatus } = await supabase
      .from('crm_prospects')
      .select('status');

    const statusCounts: Record<string, number> = {};
    for (const p of prospectsByStatus || []) {
      const s = p.status || 'unknown';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    // New prospects last 24h / 7d
    const { count: newProspects24h } = await supabase
      .from('crm_prospects')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', twentyFourHoursAgo);

    const { count: newProspects7d } = await supabase
      .from('crm_prospects')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo);

    // A/B test data
    const { data: recentEmails } = await supabase
      .from('crm_prospects')
      .select('email_subject_variant, last_email_opened_at, email_sequence_step')
      .not('email_subject_variant', 'is', null)
      .not('last_email_sent_at', 'is', null)
      .gte('last_email_sent_at', sevenDaysAgo);

    const abTestData: Record<number, { sent: number; opened: number }> = {};
    for (const p of recentEmails || []) {
      const variant = p.email_subject_variant ?? 0;
      if (!abTestData[variant]) abTestData[variant] = { sent: 0, opened: 0 };
      abTestData[variant].sent++;
      if (p.last_email_opened_at) abTestData[variant].opened++;
    }

    // --- 7-day comparison ---
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: logs7d } = await supabase
      .from('agent_logs')
      .select('agent, action')
      .gte('created_at', sevenDaysAgo);

    const logCounts7d: Record<string, number> = {};
    for (const log of logs7d || []) {
      const key = `${log.agent}_${log.action}`;
      logCounts7d[key] = (logCounts7d[key] || 0) + 1;
    }

    const { data: logsPrev7d } = await supabase
      .from('agent_logs')
      .select('agent, action')
      .gte('created_at', fourteenDaysAgo)
      .lt('created_at', sevenDaysAgo);

    const logCountsPrev7d: Record<string, number> = {};
    for (const log of logsPrev7d || []) {
      const key = `${log.agent}_${log.action}`;
      logCountsPrev7d[key] = (logCountsPrev7d[key] || 0) + 1;
    }

    // Build metrics
    const emailsSent24h = logCounts24h['email_email_sent'] || 0;
    const emailsOpened24h = logCounts24h['email_webhook_opened'] || 0;
    const emailsClicked24h = logCounts24h['email_webhook_click'] || 0;
    const emailsReplied24h = logCounts24h['email_webhook_replied'] || 0;
    const chatbotConversations24h = logCounts24h['chatbot_conversation'] || 0;
    const leadsEmail24h = logCounts24h['chatbot_lead_captured_email'] || 0;
    const leadsPhone24h = logCounts24h['chatbot_lead_captured_phone'] || 0;

    const metrics24h = {
      leads: (newProspects24h ?? 0),
      leads_from_chatbot: leadsEmail24h + leadsPhone24h,
      emails_sent: emailsSent24h,
      emails_opened: emailsOpened24h,
      emails_clicked: emailsClicked24h,
      emails_replied: emailsReplied24h,
      chatbot_conversations: chatbotConversations24h,
      open_rate: emailsSent24h > 0 ? Math.round((emailsOpened24h / emailsSent24h) * 100) : 0,
      click_rate: emailsSent24h > 0 ? Math.round((emailsClicked24h / emailsSent24h) * 100) : 0,
      prospects_by_temperature: tempCounts,
      prospects_by_status: statusCounts,
      ab_test_data: abTestData,
    };

    const emailsSent7d = logCounts7d['email_email_sent'] || 0;
    const emailsOpened7d = logCounts7d['email_webhook_opened'] || 0;
    const emailsClicked7d = logCounts7d['email_webhook_click'] || 0;
    const emailsReplied7d = logCounts7d['email_webhook_replied'] || 0;
    const chatbotConversations7d = logCounts7d['chatbot_conversation'] || 0;

    const prevEmailsSent = logCountsPrev7d['email_email_sent'] || 0;
    const prevEmailsOpened = logCountsPrev7d['email_webhook_opened'] || 0;
    const prevChatbot = logCountsPrev7d['chatbot_conversation'] || 0;

    const metrics7d = {
      leads_7d: newProspects7d ?? 0,
      emails_sent: emailsSent7d,
      emails_opened: emailsOpened7d,
      emails_clicked: emailsClicked7d,
      emails_replied: emailsReplied7d,
      chatbot_conversations: chatbotConversations7d,
      open_rate: emailsSent7d > 0 ? Math.round((emailsOpened7d / emailsSent7d) * 100) : 0,
      prev_week: {
        emails_sent: prevEmailsSent,
        emails_opened: prevEmailsOpened,
        open_rate: prevEmailsSent > 0 ? Math.round((prevEmailsOpened / prevEmailsSent) * 100) : 0,
        chatbot_conversations: prevChatbot,
      },
    };

    // --- Fetch agent reports (feedback from sub-agents on executed orders) ---
    const { data: agentReports } = await supabase
      .from('agent_logs')
      .select('agent, data, created_at')
      .eq('action', 'report_to_ceo')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: true })
      .limit(50);

    let agentReportsText = '';
    if (agentReports && agentReports.length > 0) {
      const reportLines = agentReports.map((r: any) => {
        const time = new Date(r.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return `[${time}] ${r.data?.message || `${r.agent}: ${r.data?.phase}`}`;
      });
      agentReportsText = `\n\nRAPPORTS DES AGENTS (dernières 24h):\n${reportLines.join('\n')}`;
    }

    // --- Fetch failed orders for diagnosis ---
    const { data: failedOrders } = await supabase
      .from('agent_orders')
      .select('to_agent, order_type, result, created_at')
      .eq('status', 'failed')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(10);

    let failedOrdersText = '';
    if (failedOrders && failedOrders.length > 0) {
      const failLines = failedOrders.map((o: any) => {
        const err = o.result?.error || o.result?.message || JSON.stringify(o.result).substring(0, 150);
        return `- [${o.to_agent}] ${o.order_type}: ${err}`;
      });
      failedOrdersText = `\n\nORDRES ECHOUES (dernières 24h) — DIAGNOSTIQUE ET PROPOSE UN FIX:\n${failLines.join('\n')}`;
    }

    // --- Fetch agent intelligence (directives + learnings) ---
    let intelligenceSummary = '';
    try {
      intelligenceSummary = await getCeoIntelligenceSummary();
    } catch (e: any) {
      console.warn('[CEOAgent] Failed to fetch intelligence summary:', e.message);
    }

    const intelligenceText = intelligenceSummary
      ? `\n\nINTELLIGENCE AGENTS (directives actives + learnings):\n${intelligenceSummary}`
      : '';

    console.log('[CEOAgent] Metrics collected, calling Claude...');

    // --- Call Claude Sonnet for brief (smarter reasoning) ---
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: `${getCeoSystemPrompt()}\n\n${getCeoArchitectureKnowledge()}`,
      messages: [
        {
          role: 'user',
          content: `Voici les metriques des dernieres 24h:\n${JSON.stringify(metrics24h, null, 2)}\n\nMetriques semaine precedente pour comparaison:\n${JSON.stringify(metrics7d, null, 2)}${agentReportsText}${failedOrdersText}${intelligenceText}\n\nAnalyse et genere le brief quotidien. Tiens compte des rapports des agents pour evaluer l'execution des ordres precedents. Si des ordres ont echoue, diagnostique le probleme et donne les instructions Claude Code exactes pour les fixer. Analyse les LEARNINGS des agents et ajuste les DIRECTIVES si necessaire pour ameliorer leur performance.`,
        },
      ],
    });

    const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
    console.log('[CEOAgent] Raw response:', rawText.substring(0, 200));

    // --- Store raw natural language brief (no JSON parsing) ---
    const brief = rawText;

    await supabase.from('agent_logs').insert({
      agent: 'ceo',
      action: 'daily_brief',
      data: {
        brief_text: brief,
        metrics_24h: metrics24h,
        metrics_7d: metrics7d,
        generated_at: nowISO,
      },
      created_at: nowISO,
    });

    // --- Extract structured orders from brief and insert into agent_orders ---
    await extractAndInsertOrders(supabase, brief, nowISO);

    // --- Send email brief to founder ---
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const BREVO_API_KEY = process.env.BREVO_API_KEY;

    // Convert markdown-style brief to HTML for email
    const briefHtml = brief
      .replace(/## /g, '<h3 style="color:#9333ea;margin-top:16px;">')
      .replace(/\n(?=<h3)/g, '</p>\n')
      .replace(/^- /gm, '<li>')
      .replace(/<li>(.*)/gm, '<li>$1</li>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><style>body{font-family:Arial,sans-serif;color:#333;line-height:1.6;}h2{color:#9333ea;}.container{max-width:640px;margin:0 auto;padding:20px;}h3{color:#9333ea;margin-top:16px;}li{margin:4px 0;}</style></head>
<body>
<div class="container">
  <h2>CEO Brief — ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
  ${briefHtml}
  <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;"/>
  <p style="color:#6b7280;font-size:12px;">Genere automatiquement par le CEO Agent KeiroAI a ${new Date().toLocaleTimeString('fr-FR')}</p>
</div>
</body>
</html>`;

    // Extract first line of brief for subject
    const firstLine = brief.split('\n').find((l: string) => l.trim() && !l.startsWith('##'))?.trim() || 'Brief quotidien';
    const emailSubject = `CEO Brief — ${firstLine.substring(0, 60)}`;
    let emailSent = false;

    // Try Brevo first (more reliable, already configured for transactional)
    if (BREVO_API_KEY) {
      try {
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'KeiroAI CEO Agent', email: 'contact@keiroai.com' },
            to: [{ email: FOUNDER_EMAIL, name: 'Oussama' }],
            subject: emailSubject,
            htmlContent: emailHtml,
            tags: ['ceo-brief'],
          }),
        });

        if (brevoRes.ok) {
          emailSent = true;
          console.log(`[CEOAgent] Brief email sent via Brevo to ${FOUNDER_EMAIL}`);
        } else {
          const errText = await brevoRes.text();
          console.error('[CEOAgent] Brevo email failed:', errText);
        }
      } catch (e: any) {
        console.error('[CEOAgent] Brevo email error:', e.message);
      }
    }

    // Fallback to Resend
    if (!emailSent && RESEND_API_KEY) {
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'KeiroAI Agents <noreply@keiroai.com>',
            to: [FOUNDER_EMAIL],
            subject: emailSubject,
            html: emailHtml,
          }),
        });

        if (resendRes.ok) {
          emailSent = true;
          console.log(`[CEOAgent] Brief email sent via Resend to ${FOUNDER_EMAIL}`);
        } else {
          const errText = await resendRes.text();
          console.error('[CEOAgent] Resend email failed:', errText);
        }
      } catch (e: any) {
        console.error('[CEOAgent] Resend email error:', e.message);
      }
    }

    if (!emailSent) {
      console.warn('[CEOAgent] No email provider available (need BREVO_API_KEY or RESEND_API_KEY)');
    }

    console.log('[CEOAgent] Brief generated successfully');

    return NextResponse.json({
      ok: true,
      brief: brief,
      metrics: { last_24h: metrics24h, last_7d: metrics7d },
      emailSent,
    });
  } catch (error: any) {
    console.error('[CEOAgent] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * Extract structured orders from the CEO brief text and insert them into agent_orders.
 * Uses a second Claude call to parse the natural language brief into actionable orders.
 */
async function extractAndInsertOrders(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  briefText: string,
  nowISO: string
): Promise<void> {
  const VALID_AGENTS = [
    'chatbot', 'email', 'gmaps', 'dm_instagram', 'tiktok_comments',
    'commercial', 'seo', 'onboarding', 'retention', 'content',
  ];

  try {
    console.log('[CEOAgent] Extracting structured orders from brief...');

    const extractionResponse = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: `Tu es un parseur d'ordres. Tu recois un brief CEO et tu dois extraire TOUS les ordres donnés aux agents sous forme JSON.

Agents valides: ${VALID_AGENTS.join(', ')}

Mapping des noms vers les identifiants:
- "Email" / "email agent" → "email"
- "Chatbot" / "chat" → "chatbot"
- "Commercial" / "enrichissement" → "commercial"
- "DM" / "DM Instagram" / "Instagram" → "dm_instagram"
- "Google Maps" / "GMaps" / "prospection" → "gmaps"
- "TikTok" / "TikTok Comments" → "tiktok_comments"
- "SEO" / "blog" / "articles" → "seo"
- "Onboarding" → "onboarding"
- "Retention" / "rétention" → "retention"
- "Content" / "contenu" / "réseaux sociaux" → "content"

Priorité: "haute" si urgent/critique/🔴, "basse" si optionnel/info/🟢, "moyenne" sinon.

Il y a DEUX types d'elements a extraire:
1. ORDRES (actions one-shot): {"type": "order", "to_agent": "...", "order_type": "...", "priority": "haute|moyenne|basse", "description": "..."}
2. DIRECTIVES (instructions strategiques durables, marquees [DIRECTIVE Agent]): {"type": "directive", "to_agent": "...", "instruction": "...", "context": "..."}

Réponds UNIQUEMENT avec un tableau JSON valide. Si rien, réponds [].`,
      messages: [
        {
          role: 'user',
          content: `Extrait les ordres de ce brief CEO:\n\n${briefText}`,
        },
      ],
    });

    const rawOrders = extractionResponse.content[0].type === 'text'
      ? extractionResponse.content[0].text.trim()
      : '[]';

    // Parse JSON — handle markdown code blocks if present
    let cleanJson = rawOrders;
    const jsonMatch = rawOrders.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      cleanJson = jsonMatch[0];
    }

    let items: Array<any>;

    try {
      items = JSON.parse(cleanJson);
    } catch {
      console.warn('[CEOAgent] Failed to parse orders JSON:', cleanJson.substring(0, 200));
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      console.log('[CEOAgent] No orders/directives extracted from brief');
      return;
    }

    // Separate directives from orders
    const directives = items.filter(
      (i) => i.type === 'directive' && i.to_agent && VALID_AGENTS.includes(i.to_agent) && i.instruction
    );
    const orders = items.filter(
      (i) => i.type !== 'directive' && i.to_agent && VALID_AGENTS.includes(i.to_agent) && i.order_type
    );

    // Save directives via agent-memory system
    for (const d of directives) {
      try {
        await setDirectiveForAgent(d.to_agent, d.instruction, d.context || '');
        console.log(`[CEOAgent] Directive saved for ${d.to_agent}: ${d.instruction.substring(0, 80)}`);
      } catch (e: any) {
        console.error(`[CEOAgent] Failed to save directive for ${d.to_agent}:`, e.message);
      }
    }

    if (orders.length === 0) {
      console.log(`[CEOAgent] ${directives.length} directives saved, no orders to insert`);
      return;
    }

    // Insert orders into agent_orders table
    const rows = orders.map((o: any) => ({
      from_agent: 'ceo',
      to_agent: o.to_agent,
      order_type: o.order_type,
      priority: ['haute', 'moyenne', 'basse'].includes(o.priority) ? o.priority : 'moyenne',
      payload: { description: o.description || '' },
      status: 'pending',
      created_at: nowISO,
    }));

    const { error: insertError } = await supabase.from('agent_orders').insert(rows);

    if (insertError) {
      console.error('[CEOAgent] Failed to insert orders:', insertError.message);
      return;
    }

    console.log(`[CEOAgent] ${orders.length} orders inserted, ${directives.length} directives saved`);

  } catch (error: any) {
    // Non-blocking: order extraction failure should not break the brief flow
    console.error('[CEOAgent] Order extraction error (non-blocking):', error.message);
  }
}
