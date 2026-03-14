import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateTemperature } from '@/lib/agents/scoring';

export const runtime = 'edge';

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
      const prospectIdFromHeader = event['X-Mailin-custom'] || event.headers?.['X-Mailin-custom'];

      if (!eventType || !email) {
        console.log('[BrevoWebhook] Skipping event without type or email:', event);
        continue;
      }

      console.log(`[BrevoWebhook] Processing event: ${eventType} for ${email}`);

      // --- Find prospect ---
      let prospect: any = null;

      if (prospectIdFromHeader) {
        const { data } = await supabase
          .from('crm_prospects')
          .select('*')
          .eq('id', prospectIdFromHeader)
          .single();
        prospect = data;
      }

      if (!prospect) {
        const { data } = await supabase
          .from('crm_prospects')
          .select('*')
          .eq('email', email)
          .single();
        prospect = data;
      }

      if (!prospect) {
        console.log(`[BrevoWebhook] No prospect found for email: ${email}`);
        // Still log the event even if no prospect found
        await supabase.from('agent_logs').insert({
          agent: 'email',
          action: `webhook_${eventType}`,
          data: { email, event_type: eventType, prospect_found: false, raw: event },
          created_at: now,
        });
        continue;
      }

      // --- Process event ---
      const currentScore = prospect.score ?? 0;

      switch (eventType) {
        case 'opened': {
          const scoreBonus = prospect.email_sequence_step === 2 ? 15 : 10;
          const newScore = Math.min(100, currentScore + scoreBonus);
          const newTemp = calculateTemperature(newScore);

          await supabase
            .from('crm_prospects')
            .update({
              last_email_opened_at: now,
              score: newScore,
              temperature: newTemp,
              updated_at: now,
            })
            .eq('id', prospect.id);

          await supabase.from('crm_activities').insert({
            prospect_id: prospect.id,
            type: 'email_opened',
            description: `Email step ${prospect.email_sequence_step} ouvert (+${scoreBonus} score)`,
            data: { score_before: currentScore, score_after: newScore, temperature: newTemp },
            created_at: now,
          });
          break;
        }

        case 'click': {
          const newScore = Math.min(100, currentScore + 25);
          const newClickTemp = calculateTemperature(newScore);

          await supabase
            .from('crm_prospects')
            .update({
              last_email_clicked_at: now,
              score: newScore,
              temperature: newClickTemp,
              updated_at: now,
            })
            .eq('id', prospect.id);

          await supabase.from('crm_activities').insert({
            prospect_id: prospect.id,
            type: 'email_clicked',
            description: `Lien clique dans email step ${prospect.email_sequence_step} (+25 score)`,
            data: { score_before: currentScore, score_after: newScore, url: event.link },
            created_at: now,
          });
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

        case 'soft_bounce': {
          // Just log, don't change status
          await supabase.from('crm_activities').insert({
            prospect_id: prospect.id,
            type: 'email_soft_bounce',
            description: `Soft bounce pour ${prospect.email}`,
            data: { bounce_reason: event.reason },
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
          await supabase
            .from('crm_prospects')
            .update({
              temperature: 'hot',
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
                  subject: `\uD83D\uDD25 PROSPECT CHAUD \u2014 ${prospect.company || prospect.email} a r\u00E9pondu !`,
                  html: `<h2>\uD83D\uDD25 Prospect chaud !</h2><p><strong>${prospect.company || 'Inconnu'}</strong> (${prospect.type || 'N/A'}, ${prospect.quartier || 'N/A'}) a r\u00E9pondu \u00E0 votre email !</p><p>Action : R\u00E9pondez dans l'heure avec un visuel personnalis\u00E9.</p><p>Email : ${prospect.email}<br>Note Google : ${prospect.note_google ?? 'N/A'}/5<br>Score : ${prospect.score ?? 0}/100</p>`,
                }),
              });
              console.log('[BrevoWebhook] Alert email sent for reply from:', prospect.email);
            } catch (alertError: any) {
              console.error('[BrevoWebhook] Failed to send alert email:', alertError.message);
            }
          } else {
            console.log('[BrevoWebhook] No RESEND_API_KEY, skipping alert for reply from:', prospect.email);
          }
          break;
        }

        default: {
          console.log(`[BrevoWebhook] Unhandled event type: ${eventType}`);
          break;
        }
      }

      // --- Log all events to agent_logs ---
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
        },
        created_at: now,
      });
    }

    // Always return 200 to prevent Brevo retries
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[BrevoWebhook] Error:', error);
    // Still return 200 to prevent Brevo retries
    return NextResponse.json({ ok: true, error: error.message });
  }
}
