import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateTemperature, getSequenceForProspect } from '@/lib/agents/scoring';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { Events } from '@/lib/agents/event-bus';
import { analyzeSentiment, handleReply as hugoHandleReply, isBlacklisted } from '@/lib/agents/hugo-engine';
import { saveLearning } from '@/lib/agents/learning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * POST /api/webhooks/brevo
 * Brevo webhook endpoint for email event tracking.
 * Public endpoint (no auth) - always returns 200 to prevent Brevo retries.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  try {
    const body = await request.json();

    // Brevo can send a single event or an array of events
    const events = Array.isArray(body) ? body : [body];

    for (const event of events) {
      const eventType = event.event?.toLowerCase();
      const email = event.email;
      const messageId = event['message-id'] || event.ts_event;

      if (!eventType || !email) {
        console.log('[BrevoWebhook] Skipping event without type or email');
        continue;
      }

      // --- Idempotency: skip if already processed ---
      if (messageId) {
        const { data: existing } = await supabase
          .from('agent_logs')
          .select('id')
          .eq('agent', 'email')
          .eq('action', `webhook_${eventType}`)
          .contains('data', { message_id: String(messageId), email })
          .limit(1)
          .maybeSingle();

        if (existing) {
          console.log(`[BrevoWebhook] Duplicate event skipped: ${eventType} for ${email}`);
          continue;
        }
      }

      console.log(`[BrevoWebhook] Processing event: ${eventType} for ${email}`);

      // --- Find prospect by email first (truth source), then validate header ---
      let prospect: any = null;

      const { data: prospectByEmail } = await supabase
        .from('crm_prospects')
        .select('*')
        .eq('email', email)
        .single();
      prospect = prospectByEmail;

      if (!prospect) {
        const rawHeader = event['X-Mailin-custom'] || event.headers?.['X-Mailin-custom'];
        if (rawHeader) {
          // Support both old format (just prospect_id) and new format (JSON with pid)
          let prospectIdFromHeader = rawHeader;
          try {
            const parsed = JSON.parse(rawHeader);
            if (parsed.pid) prospectIdFromHeader = parsed.pid;
          } catch { /* old format: raw UUID */ }

          const { data } = await supabase
            .from('crm_prospects')
            .select('*')
            .eq('id', prospectIdFromHeader)
            .single();
          prospect = data;
        }
      }

      if (!prospect) {
        console.log(`[BrevoWebhook] No prospect found for email: ${email}`);
        await supabase.from('agent_logs').insert({
          agent: 'email',
          action: `webhook_${eventType}`,
          data: { email, event_type: eventType, prospect_found: false, message_id: String(messageId || '') },
          created_at: now,
        });
        continue;
      }

      // --- Retrieve category: 1. X-Mailin-custom header, 2. crm_activities, 3. prospect.type ---
      let emailCategory: string | null = null;
      let prospectType: string | null = prospect.type || null;
      {
        // Try to parse enriched header first (most reliable)
        const customHeader = event['X-Mailin-custom'] || event.headers?.['X-Mailin-custom'];
        if (customHeader) {
          try {
            const parsed = JSON.parse(customHeader);
            if (parsed.cat) emailCategory = parsed.cat;
            if (parsed.type) prospectType = parsed.type;
          } catch {
            // Old format: just prospect_id string — ignore
          }
        }

        // Fallback: lookup from crm_activities
        if (!emailCategory) {
          const { data: originalEmail } = await supabase
            .from('crm_activities')
            .select('data')
            .eq('prospect_id', prospect.id)
            .eq('type', 'email')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          emailCategory = originalEmail?.data?.category || null;
        }

        // Final fallback: prospect business type
        if (!emailCategory || emailCategory === 'autre' || emailCategory === 'unknown') {
          emailCategory = prospectType || null;
        }
      }

      // --- Process event ---
      const currentScore = Math.max(0, prospect.score ?? 0);

      switch (eventType) {
        case 'opened': {
          const step = prospect.email_sequence_step ?? 1;
          const scoreBonus = step === 2 ? 15 : 10;
          const newScore = Math.min(100, currentScore + scoreBonus);
          const newTemp = calculateTemperature(newScore, { ...prospect, last_email_opened_at: now, score: newScore });
          const opensCount = (prospect.email_opens_count ?? 0) + 1;

          await supabase
            .from('crm_prospects')
            .update({
              last_email_opened_at: now,
              email_opens_count: opensCount,
              score: newScore,
              temperature: newTemp,
              updated_at: now,
            })
            .eq('id', prospect.id);

          await supabase.from('crm_activities').insert({
            prospect_id: prospect.id,
            type: 'email_opened',
            description: `Email step ${step} ouvert (+${scoreBonus} score) — ${opensCount} ouvertures total`,
            data: { score_before: currentScore, score_after: newScore, temperature: newTemp, category: emailCategory, prospect_type: prospectType || prospect.type || null, step, opens_count: opensCount },
            created_at: now,
          });
          break;
        }

        case 'click': {
          const clickScoreBonus = 25;
          const newScore = Math.min(100, currentScore + clickScoreBonus);
          const newClickTemp = calculateTemperature(newScore, { ...prospect, last_email_clicked_at: now, score: newScore });
          const clicksCount = (prospect.email_clicks_count ?? 0) + 1;
          const clickedUrl = event.link || null;

          await supabase
            .from('crm_prospects')
            .update({
              last_email_clicked_at: now,
              last_email_clicked_url: clickedUrl,
              email_clicks_count: clicksCount,
              score: newScore,
              temperature: newClickTemp,
              updated_at: now,
            })
            .eq('id', prospect.id);

          await supabase.from('crm_activities').insert({
            prospect_id: prospect.id,
            type: 'email_clicked',
            description: `Lien clique dans email step ${prospect.email_sequence_step ?? 1} (+${clickScoreBonus} score) — ${clicksCount} clics total`,
            data: { score_before: currentScore, score_after: newScore, url: clickedUrl, category: emailCategory, prospect_type: prospectType || prospect.type || null, step: prospect.email_sequence_step, clicks_count: clicksCount },
            created_at: now,
          });

          // Alert on first click only (debounced via clicksCount check on fresh prospect data)
          if (clicksCount === 1) {
            // Re-check from DB to avoid double alert from race conditions
            const { data: freshProspect } = await supabase
              .from('crm_prospects')
              .select('email_clicks_count')
              .eq('id', prospect.id)
              .single();

            if (freshProspect && freshProspect.email_clicks_count === 1) {
              // Log hot prospect alert — shown in client's Hugo dashboard (HotProspectsAlert component)
              // No admin email — this is client-facing data now
              console.log(`[BrevoWebhook] HOT prospect: ${prospect.company || prospect.email} clicked (score: ${currentScore} → ${newScore})`);
              try {
                await supabase.from('agent_logs').insert({
                  agent: 'email',
                  action: 'hot_prospect_click',
                  user_id: prospect.user_id || null,
                  status: 'ok',
                  data: { prospect_id: prospect.id, company: prospect.company, email: prospect.email, url: clickedUrl, score: newScore, temperature: newClickTemp },
                  created_at: now,
                });
              } catch {}
            }
          }
          // Emit event for CEO
          Events.emailClicked(supabase, prospect.id, prospect.company || prospect.email, clickedUrl || '', undefined).catch(() => {});
          break;
        }

        case 'hard_bounce': {
          await supabase
            .from('crm_prospects')
            .update({
              email_sequence_status: 'bounced',
              temperature: 'dead',
              updated_at: now,
            })
            .eq('id', prospect.id);

          await supabase.from('crm_activities').insert({
            prospect_id: prospect.id,
            type: 'email_bounced',
            description: `Hard bounce pour ${prospect.email}`,
            data: { bounce_reason: event.reason },
            created_at: now,
          });
          break;
        }

        case 'soft_bounce':
        case 'blocked':
        case 'deferred':
        case 'error': {
          const RESEND_KEY = process.env.RESEND_API_KEY;
          let retried = false;

          if (RESEND_KEY && prospect.email_sequence_step) {
            try {
              const cat = getSequenceForProspect(prospect);
              const vars: Record<string, string> = {
                first_name: prospect.first_name || '',
                company: prospect.company || '',
                type: prospect.type || '',
                quartier: prospect.quartier || '',
                note_google: prospect.note_google != null ? String(prospect.note_google) : '',
                prospect_id: prospect.id,
              };
              const tmpl = getEmailTemplate(cat, prospect.email_sequence_step, vars, prospect.email_subject_variant || 0);

              const resendRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${RESEND_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: 'Victor de KeiroAI <contact@keiroai.com>',
                  to: [prospect.email],
                  subject: tmpl.subject,
                  html: tmpl.htmlBody,
                  text: tmpl.textBody,
                  tags: [
                    { name: 'type', value: 'retry-brevo-fail' },
                    { name: 'step', value: String(prospect.email_sequence_step) },
                    { name: 'prospect_id', value: prospect.id },
                  ],
                }),
              });

              if (resendRes.ok) {
                retried = true;
                const resendData = await resendRes.json();
                console.log(`[BrevoWebhook] ${eventType} for ${prospect.email} — retried via Resend OK:`, resendData.id);

                await supabase.from('crm_prospects').update({
                  email_provider: 'resend',
                  updated_at: now,
                }).eq('id', prospect.id);
              } else {
                console.warn(`[BrevoWebhook] Resend retry failed for ${prospect.email}:`, (await resendRes.text().catch(() => '')).substring(0, 200));
              }
            } catch (retryErr: any) {
              console.error(`[BrevoWebhook] Resend retry error for ${prospect.email}:`, retryErr.message?.substring(0, 200));
            }
          }

          await supabase.from('crm_activities').insert({
            prospect_id: prospect.id,
            type: `email_${eventType}`,
            description: `${eventType} pour ${prospect.email}${retried ? ' — renvoye via Resend' : ''}`,
            data: { bounce_reason: event.reason, retried_via_resend: retried },
            created_at: now,
          });
          break;
        }

        case 'unsubscribed':
        case 'spam':
        case 'complaint': {
          await supabase
            .from('crm_prospects')
            .update({
              email_sequence_status: 'paused',
              temperature: 'dead',
              updated_at: now,
            })
            .eq('id', prospect.id);

          await supabase.from('crm_activities').insert({
            prospect_id: prospect.id,
            type: `email_${eventType}`,
            description: `${eventType === 'unsubscribed' ? 'Desabonnement' : eventType === 'spam' ? 'Signale spam' : 'Plainte'} pour ${prospect.email}`,
            data: {},
            created_at: now,
          });
          break;
        }

        case 'replied': {
          // Extract reply content from Brevo event (if available)
          const replyContent = event.content || event.text || event.subject || '';

          // ─── CLASSIFY REPLY WITH CLAUDE ───────────────────
          let classification: { intent: string; sentiment: string; autoReply: string | null; newStatus: string; newTemp: string } = {
            intent: 'unknown', sentiment: 'neutral', autoReply: null, newStatus: 'repondu', newTemp: 'hot',
          };

          const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
          if (ANTHROPIC_KEY && replyContent) {
            try {
              const classifyRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'x-api-key': ANTHROPIC_KEY,
                  'anthropic-version': '2023-06-01',
                  'content-type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'claude-haiku-4-5-20251001',
                  max_tokens: 1024,
                  system: `Tu es un analyste commercial expert. Tu analyses les reponses email de prospects pour KeiroAI (plateforme de marketing IA pour commercants/entrepreneurs).

Tu dois classifier la reponse ET generer une auto-reponse naturelle si pertinent.

Reponds UNIQUEMENT en JSON valide sans markdown:
{
  "intent": "interested" | "question" | "closed_business" | "unsubscribe" | "negative" | "positive" | "out_of_office" | "other",
  "sentiment": "positive" | "neutral" | "negative",
  "summary": "resume en 1 phrase",
  "auto_reply": null ou une reponse email courte (3-5 phrases max), ultra naturelle, tutoiement, tournee CTA (proposer un rdv/demo/appel), signee "Victor de KeiroAI". Si le prospect est ferme, desabonne ou negatif, auto_reply = null (on ne relance pas).
  "new_status": "repondu" | "demo" | "interesse" | "perdu",
  "new_temperature": "hot" | "warm" | "dead",
  "stop_sequence": true | false
}

Regles:
- "je suis ferme", "on a ferme", "plus en activite" → intent=closed_business, status=perdu, temp=dead, stop_sequence=true, auto_reply=null
- "desabonnez-moi", "stop", "arretez", "plus de mail" → intent=unsubscribe, status=perdu, temp=dead, stop_sequence=true, auto_reply=null
- "pas interesse", "non merci" → intent=negative, status=perdu, temp=dead, stop_sequence=true, auto_reply=null
- "combien ca coute", "c'est quoi", question → intent=question, status=repondu, temp=hot, auto_reply avec reponse + CTA rdv
- "oui", "interesse", "ok", "pourquoi pas" → intent=positive/interested, status=interesse, temp=hot, auto_reply avec CTA rdv/demo
- "absence", "vacances", "out of office" → intent=out_of_office, status=repondu, temp=warm, auto_reply=null, stop_sequence=false
- Tout positif → CTA = proposer un creneau d'appel de 15min ou demo gratuite`,
                  messages: [{
                    role: 'user',
                    content: `Prospect: ${prospect.company || 'Inconnu'} (${prospect.type || 'N/A'}, ${prospect.quartier || 'N/A'})
Prenom: ${prospect.first_name || 'Inconnu'}
Email step: ${prospect.email_sequence_step || 1}
Score: ${prospect.score || 0}/100

Reponse du prospect:
"""
${replyContent.substring(0, 2000)}
"""`
                  }],
                }),
              });

              if (classifyRes.ok) {
                const aiData = await classifyRes.json();
                const aiText = aiData.content?.[0]?.text || '';
                try {
                  const parsed = JSON.parse(aiText);
                  classification = {
                    intent: parsed.intent || 'unknown',
                    sentiment: parsed.sentiment || 'neutral',
                    autoReply: parsed.auto_reply || null,
                    newStatus: parsed.new_status || 'repondu',
                    newTemp: parsed.new_temperature || 'hot',
                  };
                  console.log(`[BrevoWebhook] Reply classified: intent=${classification.intent}, status=${classification.newStatus}`);
                } catch { console.warn('[BrevoWebhook] Failed to parse AI classification'); }
              }
            } catch (aiErr: any) {
              console.error('[BrevoWebhook] AI classification error:', aiErr.message?.substring(0, 200));
            }
          }

          // ─── UPDATE PROSPECT ──────────────────────────────
          const updateData: Record<string, any> = {
            temperature: classification.newTemp,
            status: classification.newStatus,
            updated_at: now,
          };
          // Stop email sequence for negative intents
          if (['closed_business', 'unsubscribe', 'negative'].includes(classification.intent)) {
            updateData.email_sequence_status = 'stopped';
          }

          await supabase.from('crm_prospects').update(updateData).eq('id', prospect.id);

          await supabase.from('crm_activities').insert({
            prospect_id: prospect.id,
            type: 'email_replied',
            description: `Reponse recue de ${prospect.email} — Intent: ${classification.intent}, Sentiment: ${classification.sentiment}`,
            data: {
              reply_content: replyContent.substring(0, 500),
              intent: classification.intent,
              sentiment: classification.sentiment,
              auto_reply_sent: !!classification.autoReply,
              new_status: classification.newStatus,
              new_temperature: classification.newTemp,
            },
            created_at: now,
          });

          // ─── SHARE LEARNING WITH ALL AGENTS (via RAG) ──────
          try {
            const prospectType = prospect.type || 'commerce';
            if (classification.intent === 'positive' || classification.intent === 'interested') {
              await saveLearning(supabase, {
                agent: 'email',
                category: 'content',
                learning: `Reponse POSITIVE d'un ${prospectType}: "${replyContent.substring(0, 150)}". Step ${prospect.email_sequence_step || '?'}. Ce qui a converti: le message a ce step fonctionne pour les ${prospectType}.`,
                evidence: `Prospect ${prospect.company || prospect.email} a repondu positivement`,
                confidence: 40,
              });
            } else if (classification.intent === 'negative' || classification.intent === 'unsubscribe') {
              await saveLearning(supabase, {
                agent: 'email',
                category: 'email',
                learning: `Reponse NEGATIVE d'un ${prospectType} au step ${prospect.email_sequence_step || '?'}: "${replyContent.substring(0, 100)}". Ajuster le ton ou le timing pour ce type de commerce.`,
                evidence: `Prospect ${prospect.company || prospect.email} s'est desabonne ou a refuse`,
                confidence: 35,
              });
            }
          } catch {}

          // ─── SEND AUTO-REPLY (if positive/question) ───────
          const RESEND_API_KEY = process.env.RESEND_API_KEY;
          if (classification.autoReply && RESEND_API_KEY) {
            try {
              const replySubject = `Re: ${prospect.company || 'Votre message'} — KeiroAI`;
              const replyHtml = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:20px;">
                <div style="max-width:600px;margin:0 auto;">
                  ${classification.autoReply.split('\n').map(line => `<p style="margin:8px 0;">${line}</p>`).join('')}
                  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:14px;color:#6b7280;">
                    <p style="margin:0;">Victor</p>
                    <p style="margin:2px 0;color:#0c1a3a;font-weight:bold;">KeiroAI</p>
                    <p style="margin:2px 0;font-size:13px;">contact@keiroai.com</p>
                  </div>
                </div>
              </body></html>`;

              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: 'Victor de KeiroAI <contact@keiroai.com>',
                  to: [prospect.email],
                  reply_to: 'contact@keiroai.com',
                  subject: replySubject,
                  html: replyHtml,
                  text: classification.autoReply,
                  headers: { 'X-Mailin-custom': prospect.id },
                }),
              });
              console.log(`[BrevoWebhook] Auto-reply sent to ${prospect.email} (intent: ${classification.intent})`);

              await supabase.from('crm_activities').insert({
                prospect_id: prospect.id,
                type: 'email',
                description: `Auto-reponse envoyee (intent: ${classification.intent})`,
                data: { auto_reply: true, intent: classification.intent, reply_preview: classification.autoReply.substring(0, 200) },
                created_at: now,
              });
            } catch (replyErr: any) {
              console.error('[BrevoWebhook] Auto-reply send error:', replyErr.message?.substring(0, 200));
            }
          }

          // ─── NOTIFY CLIENT via in-app notification (not email) ────────
          if (prospect.user_id && (classification.intent === 'positive' || classification.intent === 'interested' || classification.intent === 'question')) {
            try {
              const { notifyClient } = await import('@/lib/agents/notify-client');
              await notifyClient(supabase, {
                userId: prospect.user_id,
                agent: 'email',
                type: 'action',
                title: `Prospect a répondu — reprends la main`,
                message: `${prospect.company || prospect.email} a répondu (${classification.intent}). ${replyContent?.substring(0, 100) || ''}`,
                data: { prospect_id: prospect.id, intent: classification.intent },
              });
            } catch {}
          }
          // Emit event for CEO decision engine
          Events.prospectReplied(supabase, prospect.id, prospect.company || prospect.email, classification.intent, 'email', undefined).catch(() => {});
          break;
        }

        default: {
          console.log(`[BrevoWebhook] Unhandled event type: ${eventType}`);
          break;
        }
      }

      // --- Log all events to agent_logs (with message_id for idempotency) ---
      await supabase.from('agent_logs').insert({
        agent: 'email',
        action: `webhook_${eventType}`,
        data: {
          prospect_id: prospect.id,
          email: prospect.email,
          company: prospect.company,
          event_type: eventType,
          step: prospect.email_sequence_step,
          score: prospect.score,
          message_id: String(messageId || ''),
        },
        created_at: now,
      });
    }

    // Always return 200 to prevent Brevo retries
    return NextResponse.json({ ok: true, processed: events.length });
  } catch (error: any) {
    console.error('[BrevoWebhook] Error:', error);
    // Still return 200 to prevent Brevo retries
    return NextResponse.json({ ok: true, error: error.message });
  }
}

/**
 * GET /api/webhooks/brevo?test=open&email=xxx
 * Test endpoint to simulate webhook events (admin only via CRON_SECRET).
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const testType = request.nextUrl.searchParams.get('test');
  const testEmail = request.nextUrl.searchParams.get('email');

  // If no test params, return a simple health check (no auth needed)
  if (!testType && !testEmail) {
    return NextResponse.json({ ok: true, status: 'Webhook Brevo actif', endpoint: '/api/webhooks/brevo', methods: ['POST'] });
  }

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!testEmail) {
    return NextResponse.json({ ok: false, error: 'email param required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: prospect } = await supabase
    .from('crm_prospects')
    .select('id, email, company, score, temperature, email_sequence_step')
    .eq('email', testEmail)
    .single();

  const fakeEvent = {
    event: testType,
    email: testEmail,
    'X-Mailin-custom': prospect?.id || null,
    'message-id': `test-${Date.now()}`,
    ts_event: Date.now() / 1000,
    link: testType === 'click' ? 'https://www.keiroai.com/generate' : undefined,
  };

  const fakeRequest = new Request(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fakeEvent),
  });

  const result = await POST(fakeRequest as NextRequest);
  const resultData = await result.json();

  return NextResponse.json({
    ok: true,
    test: {
      event_type: testType,
      email: testEmail,
      prospect_found: !!prospect,
      prospect_id: prospect?.id,
      company: prospect?.company,
      score_before: prospect?.score,
      temperature_before: prospect?.temperature,
    },
    webhook_result: resultData,
  });
}
