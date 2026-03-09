import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getCeoSystemPrompt } from '@/lib/agents/ceo-prompt';

export const runtime = 'edge';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

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

    const contextMetrics = `
Metriques live:
- Prospects total: ${totalProspects ?? 0}
- Prospects chauds: ${hotProspects ?? 0}
- Emails envoyes 24h: ${emailsSent24h ?? 0}
- DMs prepares 24h: ${dmsPrepared24h ?? 0}

CAPACITES ACTUELLES:
- Email cold: max 50/jour (Brevo limit), 5 slots horaires (early_morning/morning/midday/afternoon/evening)
- DM Instagram: max 10/jour (limit anti-spam), 2 slots (matin/soir)
- TikTok comments: max 5/jour, 1 slot (soir)
- Timing intelligent par type de business (12 categories x 4 canaux)
- Verification prospect (type, email, ville, coherence nom/type)

Tu peux proposer des changements concrets:
- Augmenter/diminuer les limites d'envoi
- Changer les heures de cron
- Modifier les templates email/DM
- Ajouter/supprimer des categories business
- Ajuster le scoring des prospects
- Modifier les sequences (delais entre emails, nombre d'etapes)

Reponds en francais, sois direct et actionnable. Si le fondateur te demande un changement technique, donne les instructions precises (fichier, variable, valeur).`;

    const messages = [
      ...history.map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user' as const, content: message },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: `${getCeoSystemPrompt()}\n\n---\nMODE CONVERSATION DIRECTE AVEC LE FONDATEUR\nTu discutes directement avec Oussama, le fondateur de KeiroAI. Il te pose des questions strategiques, te demande des changements, ou veut ton avis. Reponds comme un vrai CEO partner — direct, pas de formules, pas de JSON, juste du texte conversationnel. Tu peux utiliser des bullet points pour la clarte.\n${contextMetrics}`,
      messages,
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : '';

    // Log the conversation
    await supabase.from('agent_logs').insert({
      agent: 'ceo',
      action: 'chat',
      data: { message, reply, history_length: history.length },
      created_at: now.toISOString(),
    });

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

    console.log('[CEOAgent] Metrics collected, calling Claude...');

    // --- Call Claude Haiku ---
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: getCeoSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `Voici les metriques des dernieres 24h:\n${JSON.stringify(metrics24h, null, 2)}\n\nMetriques semaine precedente pour comparaison:\n${JSON.stringify(metrics7d, null, 2)}\n\nAnalyse et genere le brief quotidien.`,
        },
      ],
    });

    const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
    console.log('[CEOAgent] Raw response:', rawText.substring(0, 200));

    // --- Parse JSON response ---
    let brief: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        brief = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('[CEOAgent] Failed to parse brief JSON:', parseError);
      brief = {
        summary: rawText.substring(0, 500),
        kpis: metrics24h,
        alerts: [],
        suggestions: [],
        orders: [],
        raw: rawText,
      };
    }

    // --- Store brief in agent_logs ---
    await supabase.from('agent_logs').insert({
      agent: 'ceo',
      action: 'daily_brief',
      data: {
        brief,
        metrics_24h: metrics24h,
        metrics_7d: metrics7d,
        generated_at: nowISO,
      },
      created_at: nowISO,
    });

    // --- Create agent_orders for each order ---
    const ordersArray = brief.orders || brief.ordres || [];
    if (Array.isArray(ordersArray)) {
      for (const order of ordersArray) {
        await supabase.from('agent_orders').insert({
          from_agent: 'ceo',
          to_agent: order.target_agent || order.to_agent,
          order_type: order.action,
          payload: order.params || {},
          priority: order.priority || 'medium',
          status: 'pending',
          created_at: nowISO,
        });
      }
    }

    // --- Send email brief to founder ---
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const BREVO_API_KEY = process.env.BREVO_API_KEY;

    const alertsList = brief.alerts || brief.alertes || [];
    const alertsHtml = alertsList
      .map((a: any) => {
        const level = a.level || '';
        const color = level === 'critical' || level === 'critique' ? '#ef4444' : level === 'warning' || level === 'attention' ? '#f59e0b' : '#3b82f6';
        const actionText = a.action || a.action_requise || '';
        return `<div style="border-left:4px solid ${color};padding:8px 12px;margin:8px 0;background:#f9fafb;"><strong>${level.toUpperCase()}</strong>: ${a.message}<br/><em>Action: ${actionText}</em></div>`;
      })
      .join('');

    const suggestionsList = brief.suggestions || [];
    const suggestionsHtml = Array.isArray(suggestionsList)
      ? suggestionsList
          .map((s: any) => `<li><strong>[${s.priority}] ${s.agent || s.to_agent}</strong>: ${s.action} - <em>${s.expected_impact}</em></li>`)
          .join('')
      : '';

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><style>body{font-family:Arial,sans-serif;color:#333;line-height:1.6;}h2{color:#9333ea;}.container{max-width:640px;margin:0 auto;padding:20px;}.metric{display:inline-block;text-align:center;padding:10px 16px;margin:4px;background:#f3f4f6;border-radius:8px;}.metric-value{font-size:24px;font-weight:bold;color:#9333ea;}.metric-label{font-size:12px;color:#6b7280;}</style></head>
<body>
<div class="container">
  <h2>CEO Brief — ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
  <p><strong>Resume:</strong> ${brief.summary || brief.brief_fondateur || 'N/A'}</p>

  <h3>KPIs 24h</h3>
  <div>
    <div class="metric"><div class="metric-value">${metrics24h.leads}</div><div class="metric-label">Leads</div></div>
    <div class="metric"><div class="metric-value">${metrics24h.emails_sent}</div><div class="metric-label">Emails envoyes</div></div>
    <div class="metric"><div class="metric-value">${metrics24h.open_rate}%</div><div class="metric-label">Taux ouverture</div></div>
    <div class="metric"><div class="metric-value">${metrics24h.emails_clicked}</div><div class="metric-label">Clics</div></div>
    <div class="metric"><div class="metric-value">${metrics24h.emails_replied}</div><div class="metric-label">Reponses</div></div>
    <div class="metric"><div class="metric-value">${metrics24h.chatbot_conversations}</div><div class="metric-label">Conversations chatbot</div></div>
  </div>

  ${alertsHtml ? `<h3>Alertes</h3>${alertsHtml}` : ''}
  ${suggestionsHtml ? `<h3>Suggestions</h3><ul>${suggestionsHtml}</ul>` : ''}

  <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;"/>
  <p style="color:#6b7280;font-size:12px;">Genere automatiquement par le CEO Agent KeiroAI a ${new Date().toLocaleTimeString('fr-FR')}</p>
</div>
</body>
</html>`;

    const emailSubject = `CEO Brief — ${metrics24h.leads} leads, ${metrics24h.open_rate}% open rate`;
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
      brief,
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
