import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { graphPOST } from '@/lib/meta';
import { callGeminiChat } from '@/lib/agents/gemini';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// ─── Webhook verification (GET) ─────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || 'keiroai_webhook_2026';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[InstagramWebhook] Verification OK');
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ ok: true, status: 'Instagram DM webhook actif' });
}

// ─── Incoming message handler (POST) ────────────────────────

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  try {
    // Verify signature
    const APP_SECRET = process.env.FACEBOOK_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
    if (APP_SECRET) {
      const rawBody = await req.text();
      const signature = req.headers.get('x-hub-signature-256') || '';
      const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
      if (signature !== expected) {
        console.warn('[InstagramWebhook] Invalid signature');
        return NextResponse.json({ ok: false }, { status: 403 });
      }
      // Re-parse body
      var body = JSON.parse(rawBody);
    } else {
      var body = await req.json();
    }

    // Instagram sends messaging events under entry[].messaging[]
    const entries = body.entry || [];

    for (const entry of entries) {
      const messaging = entry.messaging || [];

      for (const event of messaging) {
        const senderId = event.sender?.id;
        const recipientId = event.recipient?.id;
        const message = event.message;
        const timestamp = event.timestamp;

        if (!senderId || !message?.text) continue;

        // Skip echo messages (messages we sent)
        if (message.is_echo) continue;

        const messageText = message.text;
        const messageId = message.mid;

        console.log(`[InstagramWebhook] DM from ${senderId}: ${messageText.substring(0, 100)}`);

        // ─── Dedup check ────────────────────────────────
        if (messageId) {
          const { data: existing } = await supabase
            .from('agent_logs')
            .select('id')
            .eq('agent', 'dm_instagram')
            .eq('action', 'webhook_dm_received')
            .contains('data', { message_id: messageId })
            .limit(1)
            .maybeSingle();

          if (existing) continue;
        }

        // ─── Find prospect by Instagram ID or create ────
        let prospect: any = null;

        // Try to find by instagram field (could be the IG-scoped user ID)
        const { data: existingProspect } = await supabase
          .from('crm_prospects')
          .select('*')
          .eq('instagram', senderId)
          .limit(1)
          .maybeSingle();

        if (existingProspect) {
          prospect = existingProspect;
        } else {
          // Create new prospect from DM
          const { data: newProspect } = await supabase
            .from('crm_prospects')
            .insert({
              first_name: 'Instagram',
              last_name: `User ${senderId.substring(0, 6)}`,
              instagram: senderId,
              source: 'dm_instagram',
              status: 'contacte',
              temperature: 'warm',
              score: 20,
              priorite: 'B',
              notes: `Premier DM recu via Instagram: "${messageText.substring(0, 200)}"`,
            })
            .select()
            .single();

          prospect = newProspect;
        }

        if (!prospect) {
          console.error('[InstagramWebhook] Failed to find/create prospect');
          continue;
        }

        // ─── Load conversation history ──────────────────
        const { data: recentLogs } = await supabase
          .from('agent_logs')
          .select('data, created_at')
          .eq('agent', 'dm_instagram')
          .or(`action.eq.webhook_dm_received,action.eq.dm_auto_reply`)
          .contains('data', { prospect_id: prospect.id })
          .order('created_at', { ascending: false })
          .limit(10);

        const history = (recentLogs || []).reverse().map(log => {
          const role = log.data?.direction === 'outbound' ? 'assistant' : 'user';
          return `${role}: ${log.data?.message || ''}`;
        }).join('\n');

        // ─── Generate AI response ───────────────────────
        const systemPrompt = `Tu es Jade, l'experte DM Instagram de KeiroAI. Tu reponds aux DMs recus de facon ultra-naturelle.

REGLES:
- Messages TRES courts (1-3 phrases max) — c'est Instagram, pas un email
- Ton casual, amical, tutoiement, 1-2 emojis max
- Tu es Jade, membre de l'equipe KeiroAI
- JAMAIS mentionner que tu es une IA
- Repondre a la question PUIS orienter subtilement vers un CTA
- Si interesse → proposer un appel/demo de 10 min
- Si question prix → "ca depend de ton business, on peut en parler rapidement ?"
- Si negatif/stop → respecter immediatement et etre elegante

PROSPECT: ${prospect.company || prospect.first_name || 'Inconnu'} (${prospect.type || 'type inconnu'})
${history ? `\nHISTORIQUE:\n${history}` : ''}`;

        let aiReply = '';
        try {
          aiReply = await callGeminiChat({ system: systemPrompt, message: messageText, history: [] });
          // Clean up AI response
          aiReply = aiReply.replace(/\*\*/g, '').replace(/```[\s\S]*?```/g, '').trim();
          if (aiReply.length > 500) aiReply = aiReply.substring(0, 500);
        } catch (aiErr: any) {
          console.error('[InstagramWebhook] AI error:', aiErr.message?.substring(0, 200));
          aiReply = '';
        }

        // ─── Log incoming message ───────────────────────
        await supabase.from('agent_logs').insert({
          agent: 'dm_instagram',
          action: 'webhook_dm_received',
          data: {
            prospect_id: prospect.id,
            sender_id: senderId,
            message: messageText.substring(0, 500),
            message_id: messageId,
            direction: 'inbound',
          },
          created_at: now,
        });

        await supabase.from('crm_activities').insert({
          prospect_id: prospect.id,
          type: 'dm_instagram',
          description: `DM Instagram recu: "${messageText.substring(0, 200)}"`,
          data: { direction: 'inbound', message: messageText.substring(0, 500) },
          created_at: now,
        });

        // ─── Send auto-reply if we have one ─────────────
        if (aiReply) {
          // Find the user who owns this Instagram account to get their token
          const { data: profile } = await supabase
            .from('profiles')
            .select('instagram_business_account_id, facebook_page_access_token')
            .eq('instagram_business_account_id', recipientId)
            .limit(1)
            .maybeSingle();

          if (profile?.facebook_page_access_token) {
            try {
              // Instagram Messaging API: POST /{ig_user_id}/messages
              await graphPOST(`/${recipientId}/messages`, profile.facebook_page_access_token, {
                recipient: JSON.stringify({ id: senderId }),
                message: JSON.stringify({ text: aiReply }),
              } as any);

              console.log(`[InstagramWebhook] Auto-reply sent to ${senderId}`);

              // Log outbound reply
              await supabase.from('agent_logs').insert({
                agent: 'dm_instagram',
                action: 'dm_auto_reply',
                data: {
                  prospect_id: prospect.id,
                  sender_id: senderId,
                  message: aiReply,
                  direction: 'outbound',
                },
                created_at: now,
              });

              await supabase.from('crm_activities').insert({
                prospect_id: prospect.id,
                type: 'dm_instagram',
                description: `Auto-reponse DM Instagram envoyee`,
                data: { direction: 'outbound', message: aiReply.substring(0, 200), auto: true },
                created_at: now,
              });
            } catch (sendErr: any) {
              console.error('[InstagramWebhook] Send reply error:', sendErr.message?.substring(0, 300));
            }
          } else {
            console.warn('[InstagramWebhook] No token found for IG account:', recipientId);
          }
        }

        // ─── Update prospect ────────────────────────────
        const newScore = Math.min(100, (prospect.score || 0) + 15);
        const newTemp = newScore >= 60 ? 'hot' : 'warm';
        await supabase.from('crm_prospects').update({
          temperature: newTemp,
          score: newScore,
          updated_at: now,
        }).eq('id', prospect.id);

        // ─── HANDOVER: Notify client when prospect is hot ──
        // Count exchange rounds (inbound messages from this prospect)
        const { count: exchangeCount } = await supabase
          .from('agent_logs')
          .select('id', { count: 'exact', head: true })
          .eq('agent', 'dm_instagram')
          .eq('action', 'webhook_dm_received')
          .contains('data', { prospect_id: prospect.id });

        // After 3+ exchanges OR score >= 60: prospect is warm/hot → notify client to close
        if ((exchangeCount && exchangeCount >= 3) || newScore >= 60) {
          // Check if we already notified for this prospect
          const { data: alreadyNotified } = await supabase
            .from('agent_logs')
            .select('id')
            .eq('agent', 'dm_instagram')
            .eq('action', 'handover_notification')
            .contains('data', { prospect_id: prospect.id })
            .limit(1)
            .maybeSingle();

          if (!alreadyNotified) {
            // Find the client (owner of this IG account) to notify
            const { data: ownerProfile } = await supabase
              .from('profiles')
              .select('id, email, company_name')
              .eq('instagram_business_account_id', recipientId)
              .limit(1)
              .maybeSingle();

            if (ownerProfile?.email) {
              const RESEND_KEY = process.env.RESEND_API_KEY;
              if (RESEND_KEY) {
                try {
                  await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      from: 'KeiroAI Agents <contact@keiroai.com>',
                      to: [ownerProfile.email],
                      subject: `🔥 Prospect chaud sur Instagram — Reprenez la main !`,
                      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                        <div style="background:linear-gradient(135deg,#e11d48,#be123c);color:white;padding:20px;border-radius:12px 12px 0 0;">
                          <h2 style="margin:0;">🔥 Un prospect est pret a closer !</h2>
                        </div>
                        <div style="background:white;padding:20px;border:1px solid #e5e7eb;border-top:none;">
                          <p><strong>Prospect :</strong> ${prospect.company || prospect.first_name || senderId}</p>
                          <p><strong>Score :</strong> ${newScore}/100 (${newTemp})</p>
                          <p><strong>Echanges :</strong> ${exchangeCount || 0} messages</p>
                          <p><strong>Dernier message :</strong> "${messageText.substring(0, 150)}"</p>
                          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
                          <p style="color:#6b7280;">Jade (votre agent DM) a chauffe ce prospect. Il est maintenant pret pour une conversation humaine. <strong>Reprenez la main sur Instagram pour closer !</strong></p>
                          <div style="text-align:center;margin-top:20px;">
                            <a href="https://www.instagram.com/direct/inbox/" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#e11d48,#be123c);color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Ouvrir mes DMs Instagram →</a>
                          </div>
                        </div>
                        <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:12px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
                          KeiroAI — Votre equipe IA
                        </div>
                      </div>`,
                    }),
                  });
                  console.log(`[InstagramWebhook] Handover notification sent to ${ownerProfile.email} for prospect ${prospect.id}`);
                } catch (notifErr: any) {
                  console.error('[InstagramWebhook] Handover notification error:', notifErr.message?.substring(0, 200));
                }
              }
            }

            // Log handover
            await supabase.from('agent_logs').insert({
              agent: 'dm_instagram',
              action: 'handover_notification',
              status: 'ok',
              data: {
                prospect_id: prospect.id,
                prospect_company: prospect.company || prospect.first_name,
                score: newScore,
                exchanges: exchangeCount,
                client_email: ownerProfile?.email,
              },
              created_at: now,
            });

            // Update dm_queue status if exists
            await supabase.from('dm_queue')
              .update({ status: 'responded', response_type: 'interested' })
              .eq('prospect_id', prospect.id)
              .in('status', ['pending', 'sent']);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[InstagramWebhook] Error:', err);
    return NextResponse.json({ ok: true }); // Always 200 for Meta
  }
}
