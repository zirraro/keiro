import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateTemperature, getSequenceForProspect } from '@/lib/agents/scoring';
import { getEmailTemplate } from '@/lib/agents/email-templates';

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
        const prospectIdFromHeader = event['X-Mailin-custom'] || event.headers?.['X-Mailin-custom'];
        if (prospectIdFromHeader) {
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

      // --- Retrieve category from original email activity ---
      let emailCategory: string | null = null;
      {
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
            data: { score_before: currentScore, score_after: newScore, temperature: newTemp, category: emailCategory, step, opens_count: opensCount },
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
            data: { score_before: currentScore, score_after: newScore, url: clickedUrl, category: emailCategory, step: prospect.email_sequence_step, clicks_count: clicksCount },
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
              const RESEND_API_KEY = process.env.RESEND_API_KEY;
              if (RESEND_API_KEY) {
                try {
                  await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${RESEND_API_KEY}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      from: 'KeiroAI Agents <contact@keiroai.com>',
                      to: ['contact@keiroai.com'],
                      subject: `CLIC — ${prospect.company || prospect.email} a clique sur le lien !`,
                      html: `<h2>Prospect interesse — Premier clic !</h2>
                        <p><strong>${prospect.company || 'Inconnu'}</strong> (${prospect.type || 'N/A'}, ${prospect.quartier || 'N/A'}) a clique sur un lien dans votre email.</p>
                        <p><strong>Lien clique :</strong> ${clickedUrl || 'N/A'}</p>
                        <p><strong>Score :</strong> ${currentScore} → ${newScore}/100</p>
                        <p><strong>Temperature :</strong> ${newClickTemp}</p>
                        <p><strong>Email step :</strong> ${prospect.email_sequence_step}</p>
                        <hr/>
                        <p style="color:#888;font-size:12px">Ce prospect est passe en HOT — il a visite KeiroAI. Envisagez un suivi personnalise rapide.</p>`,
                    }),
                  });
                  console.log('[BrevoWebhook] Click alert sent for:', prospect.email);
                } catch (e: any) {
                  console.warn('[BrevoWebhook] Click alert email failed:', e.message?.substring(0, 200));
                }
              } else {
                console.warn('[BrevoWebhook] RESEND_API_KEY missing — click alert not sent for:', prospect.email);
              }
            }
          }
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
          // Don't downgrade temperature if already hot
          const replyTemp = prospect.temperature === 'hot' ? 'hot' : 'hot';
          await supabase
            .from('crm_prospects')
            .update({
              temperature: replyTemp,
              status: 'repondu',
              updated_at: now,
            })
            .eq('id', prospect.id);

          await supabase.from('crm_activities').insert({
            prospect_id: prospect.id,
            type: 'email_replied',
            description: `Reponse recue de ${prospect.email} !`,
            data: {},
            created_at: now,
          });

          // --- Send URGENT alert to founder via Resend ---
          const RESEND_API_KEY = process.env.RESEND_API_KEY;
          if (RESEND_API_KEY) {
            try {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${RESEND_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: 'KeiroAI Agents <contact@keiroai.com>',
                  to: ['contact@keiroai.com'],
                  subject: `PROSPECT CHAUD — ${prospect.company || prospect.email} a repondu !`,
                  html: `<h2>Prospect chaud !</h2><p><strong>${prospect.company || 'Inconnu'}</strong> (${prospect.type || 'N/A'}, ${prospect.quartier || 'N/A'}) a repondu a votre email !</p><p>Action : Repondez dans l'heure avec un visuel personnalise.</p><p>Email : ${prospect.email}<br>Note Google : ${prospect.note_google ?? 'N/A'}/5<br>Score : ${prospect.score ?? 0}/100</p>`,
                }),
              });
              console.log('[BrevoWebhook] Alert email sent for reply from:', prospect.email);
            } catch (alertError: any) {
              console.error('[BrevoWebhook] Failed to send alert email:', alertError.message?.substring(0, 200));
            }
          } else {
            console.warn('[BrevoWebhook] No RESEND_API_KEY, skipping alert for reply from:', prospect.email);
          }
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
