import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getCeoSystemPrompt } from '@/lib/agents/ceo-prompt';
import { callGemini, callGeminiChat } from '@/lib/agents/gemini';
import { loadSharedContext, formatContextForPrompt, writeDirective } from '@/lib/agents/shared-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Founder emails for briefs
const FOUNDER_EMAILS = ['mrzirraro@gmail.com', 'contact@keiroai.com'];

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

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configuree' }, { status: 500 });
  }

  // Check if this is a chat request
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === 'chat' && body.message) {
      return await handleCeoChat(body.message, body.history || []);
    }
  } catch (error: any) {
    console.error('[CEOAgent] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }

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
- DMs Instagram/TikTok prepares 24h: ${dmsPrepared24h ?? 0} (TOUS les DMs sont prepares par les agents, envoyes manuellement par le fondateur)
${briefsMemory}
${chatMemory}
${reportsMemory}

CAPACITES ACTUELLES:
- Email cold: max 50/jour (Resend), 5 slots horaires
- DM Instagram: max 10/jour, 2 slots (matin/soir) — PRÉPARÉS par l'agent, envoi MANUEL par le fondateur
- TikTok DMs: max 5/jour, 1 slot (soir) — PRÉPARÉS par l'agent, envoi MANUEL par le fondateur
- GMaps: scan 5 zones/jour, 30 zones, 7 villes, 200+ prospects/jour
- Commercial: enrichissement auto via Claude Haiku, qualification CRM
- Pipeline: GMaps decouvre → Commercial enrichit → Email contacte

TU CONTROLES CES AGENTS DIRECTEMENT (via la section ORDRES DU JOUR):
- [Google Maps] Scanner → lance un scan (200+ prospects)
- [Commercial] Enrichir → enrichit et qualifie les prospects
- [Email] Campagne cold/warm → envoie les emails
- [Email] Pause/Reprendre → pause/reprend les sequences
- [DM Instagram] Preparer → prepare les DMs Instagram du jour (envoi manuel par le fondateur)
- [TikTok Comments] Préparer → prépare les DMs TikTok du jour (envoi manuel par le fondateur)

CRM KEIRO (lecture/ecriture par tous les agents):
- Statuts: identifie → contacte → repondu → demo → sprint → client (ou perdu)
- Temperature: cold → warm → hot (ou dead)
- Email sequence: step 0 → 1 → 2 → 3 → completed

Reponds en francais, sois direct et actionnable.`;

    const systemPrompt = `${getCeoSystemPrompt()}\n\n---\nMODE CONVERSATION DIRECTE AVEC LE FONDATEUR\nTu discutes directement avec Victor, le fondateur de KeiroAI. Reponds comme un vrai CEO partner — direct, actionnable.\n\nTu te souviens de TOUTES les conversations precedentes. Tu fais le suivi des decisions prises.\n\nEXECUTION DIRECTE:\nQuand le fondateur te demande de lancer une action (campagne email, scan prospects, enrichir CRM, etc.), tu le fais IMMEDIATEMENT. Les ordres dans ta section "ORDRES DU JOUR" sont automatiquement transmis aux agents et executes. Tu n'as pas besoin de confirmation.\n\nExemple : si le fondateur dit "lance les emails et scanne des prospects", inclus dans ta reponse une section ## ORDRES DU JOUR avec les ordres correspondants.\n\nLes agents te font un rapport quand ils terminent (visible dans RAPPORTS DES AGENTS ci-dessous).\n${contextMetrics}`;

    const reply = await callGeminiChat({
      system: systemPrompt,
      history: history.map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      message,
      maxTokens: 2000,
    });

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

    // Extract and insert orders from CEO chat reply
    const chatOrdersCount = await extractAndInsertOrders(supabase, reply, now.toISOString());

    // Trigger order execution (awaited)
    if (chatOrdersCount > 0) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000');
      const cronSecretVal = process.env.CRON_SECRET;
      try {
        await fetch(`${appUrl}/api/agents/orders`, {
          method: 'GET',
          headers: cronSecretVal ? { 'Authorization': `Bearer ${cronSecretVal}` } : {},
        });
      } catch (e: any) {
        console.error('[CEOAgent Chat] Order exec error:', e.message);
      }
    }

    return NextResponse.json({
      ok: true,
      reply,
      orders: chatOrdersCount > 0 ? { created: chatOrdersCount } : undefined,
    });
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

    // Build metrics — emails sent are tracked in crm_activities (type='email'), not agent_logs
    const { count: emailsSentCount24h } = await supabase
      .from('crm_activities').select('id', { count: 'exact', head: true })
      .eq('type', 'email').gte('created_at', twentyFourHoursAgo);
    const emailsSent24h = emailsSentCount24h ?? 0;
    const emailsOpened24h = logCounts24h['email_webhook_opened'] || 0;
    const emailsClicked24h = logCounts24h['email_webhook_click'] || 0;
    const emailsReplied24h = logCounts24h['email_webhook_replied'] || 0;
    const chatbotConversations24h = logCounts24h['chatbot_conversation'] || 0;
    const leadsEmail24h = logCounts24h['chatbot_lead_captured_email'] || 0;
    const leadsPhone24h = logCounts24h['chatbot_lead_captured_phone'] || 0;

    // Email performance by business type (from crm_activities + prospect type)
    const { data: recentEmailActivities } = await supabase
      .from('crm_activities')
      .select('prospect_id, data, prospect:crm_prospects(type)')
      .eq('type', 'email')
      .gte('created_at', sevenDaysAgo)
      .limit(500);

    const emailByType: Record<string, { sent: number; opened: number; clicked: number }> = {};
    if (recentEmailActivities) {
      for (const act of recentEmailActivities) {
        const bizType = (act.prospect as any)?.type || 'autre';
        if (!emailByType[bizType]) emailByType[bizType] = { sent: 0, opened: 0, clicked: 0 };
        emailByType[bizType].sent++;
      }
    }

    // Count opens/clicks by type from webhook logs
    const { data: openLogs } = await supabase
      .from('agent_logs')
      .select('data')
      .eq('agent', 'email')
      .eq('action', 'webhook_opened')
      .gte('created_at', sevenDaysAgo)
      .limit(500);

    if (openLogs) {
      for (const log of openLogs) {
        const bizType = log.data?.category || 'autre';
        if (!emailByType[bizType]) emailByType[bizType] = { sent: 0, opened: 0, clicked: 0 };
        emailByType[bizType].opened++;
      }
    }

    const { data: clickLogs } = await supabase
      .from('agent_logs')
      .select('data')
      .eq('agent', 'email')
      .eq('action', 'webhook_click')
      .gte('created_at', sevenDaysAgo)
      .limit(500);

    if (clickLogs) {
      for (const log of clickLogs) {
        const bizType = log.data?.category || 'autre';
        if (!emailByType[bizType]) emailByType[bizType] = { sent: 0, opened: 0, clicked: 0 };
        emailByType[bizType].clicked++;
      }
    }

    // Paying clients = active Stripe subscription (real money received)
    const { count: payingClientsCount } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .not('stripe_subscription_id', 'is', null);

    // Total registered users (non-admin, non-free info)
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .neq('is_admin', true);

    const metrics24h = {
      paying_clients: payingClientsCount ?? 0,
      total_users: totalUsers ?? 0,
      leads: (newProspects24h ?? 0),
      leads_from_chatbot: leadsEmail24h + leadsPhone24h,
      emails_sent: emailsSent24h,
      emails_opened: emailsOpened24h,
      emails_clicked: emailsClicked24h,
      emails_replied: emailsReplied24h,
      chatbot_conversations: chatbotConversations24h,
      open_rate_percent: emailsSent24h > 0 ? Math.round((emailsOpened24h / emailsSent24h) * 100) : 0,
      click_through_rate_percent: emailsOpened24h > 0 ? Math.round((emailsClicked24h / emailsOpened24h) * 100) : 0,
      note: 'OR = ouverts/envoyés, CTR = clics/OUVERTS (pas clics/envoyés)',
      prospects_by_temperature: tempCounts,
      prospects_by_status: statusCounts,
      ab_test_data: abTestData,
      email_performance_by_business_type_7d: emailByType,
    };

    const { count: emailsSentCount7d } = await supabase
      .from('crm_activities').select('id', { count: 'exact', head: true })
      .eq('type', 'email').gte('created_at', sevenDaysAgo);
    const emailsSent7d = emailsSentCount7d ?? 0;
    const emailsOpened7d = logCounts7d['email_webhook_opened'] || 0;
    const emailsClicked7d = logCounts7d['email_webhook_click'] || 0;
    const emailsReplied7d = logCounts7d['email_webhook_replied'] || 0;
    const chatbotConversations7d = logCounts7d['chatbot_conversation'] || 0;

    const { count: prevEmailsSentCount } = await supabase
      .from('crm_activities').select('id', { count: 'exact', head: true })
      .eq('type', 'email').gte('created_at', fourteenDaysAgo).lt('created_at', sevenDaysAgo);
    const prevEmailsSent = prevEmailsSentCount ?? 0;
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

    console.log('[CEOAgent] Metrics collected, loading shared context...');

    // Load the full shared data pool (all agents' performance)
    const sharedCtx = await loadSharedContext(supabase, 'ceo');
    const sharedDataPool = formatContextForPrompt(sharedCtx);

    // --- Collect agent execution status (which agents ran in last 24h) ---
    const TRACKED_AGENTS = ['email', 'commercial', 'dm_instagram', 'tiktok_comments', 'seo', 'content', 'onboarding', 'retention', 'marketing', 'community'];
    const agentExecStatus: Record<string, { runs: number; errors: number; lastAction: string }> = {};
    for (const agent of TRACKED_AGENTS) {
      const { count: runs } = await supabase
        .from('agent_logs').select('id', { count: 'exact', head: true })
        .eq('agent', agent).gte('created_at', twentyFourHoursAgo);
      const { count: errors } = await supabase
        .from('agent_logs').select('id', { count: 'exact', head: true })
        .eq('agent', agent).eq('status', 'error').gte('created_at', twentyFourHoursAgo);
      const { data: lastLog } = await supabase
        .from('agent_logs').select('action, created_at')
        .eq('agent', agent).gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      agentExecStatus[agent] = {
        runs: runs ?? 0,
        errors: errors ?? 0,
        lastAction: lastLog ? `${lastLog.action} (${new Date(lastLog.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})` : 'aucune exécution',
      };
    }

    const agentStatusText = TRACKED_AGENTS.map(a => {
      const s = agentExecStatus[a];
      const icon = s.runs === 0 ? '❌' : s.errors > 0 ? '⚠️' : '✅';
      return `${icon} ${a}: ${s.runs} exécutions, ${s.errors} erreurs — dernière: ${s.lastAction}`;
    }).join('\n');

    // --- Load marketing agent learnings ---
    const { data: marketingLearnings } = await supabase
      .from('agent_logs')
      .select('data, created_at')
      .eq('agent', 'marketing')
      .in('action', ['memory', 'analysis', 'advise_agents'])
      .order('created_at', { ascending: false })
      .limit(3);

    let marketingInsights = '';
    if (marketingLearnings && marketingLearnings.length > 0) {
      marketingInsights = '\n\nINSIGHTS AGENT MARKETING:\n' + marketingLearnings.map((l: any) => {
        const d = l.data;
        return d?.learning || d?.summary || d?.advice || JSON.stringify(d).substring(0, 200);
      }).join('\n');
    }

    // --- Load last brief's orders to check execution ---
    const { data: lastBrief } = await supabase
      .from('agent_logs')
      .select('data, created_at')
      .eq('agent', 'ceo').eq('action', 'daily_brief')
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

    let previousOrdersText = '';
    if (lastBrief?.data?.brief_text) {
      const ordersSection = lastBrief.data.brief_text.match(/## ORDRES DU JOUR[\s\S]*?(?=##|$)/);
      if (ordersSection) {
        previousOrdersText = `\n\nORDRES DU BRIEF PRÉCÉDENT (à vérifier si exécutés):\n${ordersSection[0].substring(0, 500)}`;
      }
    }

    // --- Call Gemini 2.0 Flash ---
    const rawText = await callGemini({
      system: getCeoSystemPrompt(),
      message: `${sharedDataPool}\n\nMETRIQUES DÉTAILLÉES 24h:\n${JSON.stringify(metrics24h, null, 2)}\n\nMetriques semaine precedente pour comparaison:\n${JSON.stringify(metrics7d, null, 2)}${agentReportsText}\n\nÉTAT DES AGENTS (dernières 24h):\n${agentStatusText}${marketingInsights}${previousOrdersText}\n\nAnalyse et genere le brief quotidien. Tiens compte des rapports des agents pour evaluer l'execution des ordres precedents. Vérifie quels agents ont bien tourné et lesquels non.\n\nIMPORTANT: Inclus une section "## DIRECTIVES STRATEGIQUES" avec des directives claires pour chaque agent. Format:\n- [DIRECTIVE email] Directive pour l'agent email\n- [DIRECTIVE content] Directive pour l'agent contenu\n- [DIRECTIVE dm_instagram] Directive pour les DMs\nCes directives seront automatiquement transmises et chaque agent devra les suivre.`,
      maxTokens: 8000,
    });
    console.log('[CEOAgent] Raw response length:', rawText.length, 'chars');
    console.log('[CEOAgent] Raw response preview:', rawText.substring(0, 200));

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

    // --- Extract strategic DIRECTIVES and write them to agent_orders ---
    await extractAndWriteDirectives(supabase, brief);

    // --- Send email brief to founder via Resend ---
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

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

    const firstLine = brief.split('\n').find((l: string) => l.trim() && !l.startsWith('##'))?.trim() || 'Brief quotidien';
    const emailSubject = `CEO Brief — ${firstLine.substring(0, 60)}`;
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
            from: 'KeiroAI CEO Agent <contact@keiroai.com>',
            to: FOUNDER_EMAILS,
            subject: emailSubject,
            html: emailHtml,
          }),
        });

        if (resendRes.ok) {
          emailSent = true;
          console.log(`[CEOAgent] Brief email sent via Resend to ${FOUNDER_EMAILS.join(', ')}`);
        } else {
          const errText = await resendRes.text();
          console.error('[CEOAgent] Resend email failed:', errText);
        }
      } catch (e: any) {
        console.error('[CEOAgent] Resend email error:', e.message);
      }
    }

    // Fallback: Brevo
    if (!emailSent && process.env.BREVO_API_KEY) {
      try {
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'accept': 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'KeiroAI CEO Agent', email: 'contact@keiroai.com' },
            to: FOUNDER_EMAILS.map(e => ({ email: e })),
            subject: emailSubject,
            htmlContent: emailHtml,
          }),
        });
        if (brevoRes.ok) {
          emailSent = true;
          console.log(`[CEOAgent] Brief email sent via Brevo to ${FOUNDER_EMAILS.join(', ')}`);
        } else {
          console.error('[CEOAgent] Brevo email failed:', await brevoRes.text().catch(() => ''));
        }
      } catch (e: any) {
        console.error('[CEOAgent] Brevo email error:', e.message);
      }
    }

    if (!emailSent) {
      console.warn('[CEOAgent] No email sent — check RESEND_API_KEY and BREVO_API_KEY');
    }

    console.log('[CEOAgent] Brief generated successfully');

    // Trigger order execution for orders just created in this brief (awaited)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');
    const cronSecretVal = process.env.CRON_SECRET;
    try {
      await fetch(`${appUrl}/api/agents/orders`, {
        method: 'GET',
        headers: cronSecretVal ? { 'Authorization': `Bearer ${cronSecretVal}` } : {},
      });
      console.log('[CEOAgent] Order execution triggered successfully');
    } catch (e: any) {
      console.error('[CEOAgent] Order exec error:', e.message);
    }

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
 * Uses direct regex parsing — no second AI call needed.
 */
async function extractAndInsertOrders(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  briefText: string,
  nowISO: string
): Promise<number> {
  const VALID_AGENTS = [
    'chatbot', 'email', 'gmaps', 'dm_instagram', 'tiktok_comments',
    'commercial', 'seo', 'onboarding', 'retention', 'content',
  ];

  // Mapping from bracket names to agent IDs
  const AGENT_MAPPING: Record<string, string> = {
    'commercial': 'commercial',
    'enrichissement': 'commercial',
    'email': 'email',
    'dm instagram': 'dm_instagram',
    'dm': 'dm_instagram',
    'instagram': 'dm_instagram',
    'tiktok comments': 'tiktok_comments',
    'tiktok': 'tiktok_comments',
    'google maps': 'gmaps',
    'gmaps': 'gmaps',
    'seo': 'seo',
    'onboarding': 'onboarding',
    'retention': 'retention',
    'rétention': 'retention',
    'content': 'content',
    'contenu': 'content',
    'chatbot': 'chatbot',
  };

  try {
    console.log('[CEOAgent] Extracting orders from brief (regex)...');

    // Find all lines with [AgentName] pattern (with or without bold/markdown)
    // Matches: **[Commercial] blah**, [Email] blah, *[DM Instagram]* blah, etc.
    const orderLines = briefText.split('\n').filter(line =>
      /\*{0,2}\[.+?\]\*{0,2}/.test(line)
    );

    console.log(`[CEOAgent] Found ${orderLines.length} order lines in brief`);

    const orders: Array<{ to_agent: string; order_type: string; priority: string; description: string }> = [];

    for (const line of orderLines) {
      // Extract agent name from brackets
      const bracketMatch = line.match(/\[([^\]]+)\]/);
      if (!bracketMatch) continue;

      const agentName = bracketMatch[1].toLowerCase().trim();
      const toAgent = AGENT_MAPPING[agentName];
      if (!toAgent || !VALID_AGENTS.includes(toAgent)) continue;

      // Extract description (everything after the bracket)
      const description = line
        .replace(/\*{0,2}\[[^\]]+\]\*{0,2}/, '')  // Remove [Agent] with optional bold
        .replace(/^[\s\-—:]+/, '')                  // Remove leading dashes/colons
        .replace(/\*{1,2}/g, '')                    // Remove remaining markdown bold
        .trim();

      if (!description) continue;

      // Determine priority from keywords
      let priority = 'haute';
      if (/optionnel|info|🟢|basse/i.test(line)) priority = 'basse';
      else if (/moyenne|normal/i.test(line)) priority = 'moyenne';

      // Avoid duplicates (same agent + similar description)
      const isDuplicate = orders.some(o => o.to_agent === toAgent && o.order_type === description.substring(0, 50));
      if (isDuplicate) continue;

      // Skip DIRECTIVE lines (those are instructions, not orders to execute)
      if (/DIRECTIVE/i.test(line)) continue;

      orders.push({
        to_agent: toAgent,
        order_type: description.substring(0, 200),
        priority,
        description,
      });
    }

    const validOrders = orders;

    if (validOrders.length === 0) {
      console.log('[CEOAgent] No valid orders found in brief');
      return 0;
    }

    console.log(`[CEOAgent] Parsed ${validOrders.length} orders: ${validOrders.map(o => `${o.to_agent}:${o.order_type.substring(0, 40)}`).join(', ')}`);

    // Insert orders into agent_orders table
    const rows = validOrders.map((o) => ({
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
      return 0;
    }

    console.log(`[CEOAgent] ${validOrders.length} orders inserted into agent_orders`);
    return validOrders.length;

  } catch (error: any) {
    // Non-blocking: order extraction failure should not break the brief flow
    console.error('[CEOAgent] Order extraction error (non-blocking):', error.message);
    return 0;
  }
}

/**
 * Extract DIRECTIVE lines from CEO brief and write them as strategic directives.
 * Format: [DIRECTIVE agent_name] Strategic direction message
 * These are long-lived instructions that agents read before each action.
 */
async function extractAndWriteDirectives(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  briefText: string,
): Promise<number> {
  const AGENT_MAPPING: Record<string, string> = {
    'email': 'email', 'dm_instagram': 'dm_instagram', 'dm': 'dm_instagram',
    'tiktok': 'tiktok_comments', 'content': 'content', 'contenu': 'content',
    'seo': 'seo', 'onboarding': 'onboarding', 'retention': 'retention',
    'marketing': 'marketing', 'commercial': 'commercial', 'chatbot': 'chatbot',
  };

  try {
    const directiveLines = briefText.split('\n').filter(line =>
      /\[DIRECTIVE\s+/i.test(line)
    );

    if (directiveLines.length === 0) return 0;

    let count = 0;
    for (const line of directiveLines) {
      const match = line.match(/\[DIRECTIVE\s+([^\]]+)\]\s*(.*)/i);
      if (!match) continue;

      const agentKey = match[1].toLowerCase().trim();
      const toAgent = AGENT_MAPPING[agentKey];
      if (!toAgent) continue;

      const message = match[2]
        .replace(/\*{1,2}/g, '')
        .replace(/^[\s\-—:]+/, '')
        .trim();
      if (!message) continue;

      await writeDirective(supabase, 'ceo', toAgent, 'strategic_direction', message, 'haute');
      count++;
      console.log(`[CEOAgent] Directive → ${toAgent}: ${message.substring(0, 60)}`);
    }

    console.log(`[CEOAgent] ${count} strategic directives written`);
    return count;
  } catch (error: any) {
    console.error('[CEOAgent] Directive extraction error:', error.message);
    return 0;
  }
}
