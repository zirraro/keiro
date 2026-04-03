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
    // Parse body first, verify signature if available
    const rawBody = await req.text();
    var body: any;
    try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

    // Verify signature (warn but don't block — allows debugging in test mode)
    const APP_SECRET = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
    if (APP_SECRET) {
      const signature = req.headers.get('x-hub-signature-256') || '';
      const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
      if (signature && signature !== expected) {
        console.warn('[InstagramWebhook] Invalid signature — processing anyway for debug');
      }
    }

    console.log(`[InstagramWebhook] Received: object=${body.object}, entries=${body.entry?.length || 0}`);

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

        // ─── Generate AI response with conversion strategy ───────────────────────
        // Load RAG learnings for better responses
        let ragContext = '';
        try {
          const { getActiveLearnings, getAllHistoricalLearnings, formatLearningsForPrompt } = await import('@/lib/agents/learning');
          const [own, global] = await Promise.all([
            getActiveLearnings(supabase, 'dm_instagram', undefined, undefined),
            getAllHistoricalLearnings(supabase, { minConfidence: 40, limit: 10 }),
          ]);
          if ((own || []).length > 0 || (global || []).length > 0) {
            ragContext = '\n\nCONNAISSANCES ACQUISES:\n' + formatLearningsForPrompt(own || [], global || []);
          }
        } catch {}

        // Load business dossier for personalized responses
        let businessContext = '';
        try {
          const { loadBusinessDossier, formatDossierForPrompt } = await import('@/lib/agents/client-context');
          const ownerProfile = await supabase.from('profiles').select('id').eq('instagram_business_account_id', recipientId).maybeSingle();
          if (ownerProfile?.data?.id) {
            const dossier = await loadBusinessDossier(supabase, ownerProfile.data.id);
            if (dossier) businessContext = '\n\nMON BUSINESS:\n' + formatDossierForPrompt(dossier);
          }
        } catch {}

        // Load showcase images for prospect's business type
        let showcaseContext = '';
        try {
          const prospectType = prospect.type || 'restaurant';
          const { data: showcaseImages } = await supabase
            .from('showcase_images')
            .select('image_url, title, business_type')
            .eq('business_type', prospectType)
            .eq('is_active', true)
            .limit(3);
          if (showcaseImages && showcaseImages.length > 0) {
            showcaseContext = `\n\nEXEMPLES DE VISUELS IA DISPONIBLES POUR ${prospectType.toUpperCase()}:\n` +
              showcaseImages.map((img: any, i: number) => `${i + 1}. "${img.title}" — ${img.image_url}`).join('\n') +
              `\nTu peux envoyer ces liens comme exemples concrets au prospect !`;
          }
        } catch {}

        const systemPrompt = `Tu es Jade, experte growth Instagram chez KeiroAI. Tu vends la GENERATION DE CONTENU IA pour les reseaux sociaux.

CE QUE KEIROAI FAIT (ton argumentaire principal):
- Genere des images et videos PRO avec l'IA qui surfent sur les tendances et actualites
- Publie automatiquement sur Instagram, TikTok et LinkedIn
- Cree du contenu qui attire l'attention et augmente la visibilite
- Analyse les tendances pour toujours etre pertinent
- Tout est automatise: le business owner n'a rien a faire

STRATEGIE DE CONVERSION EN 4 PHASES:

PHASE 1 — ACCUEIL: Reponds chaleureusement. Identifie leur business. Demande "C'est quoi ton activite ?" si tu ne sais pas.

PHASE 2 — DECOUVERTE + VALEUR: Pose des questions sur leur business pour comprendre leurs besoins:
- "Tu publies deja du contenu sur Instagram ?"
- "C'est quoi ton plus gros challenge pour etre visible en ligne ?"
- "Tu aimerais quel type de contenu ? Des photos pro, des reels tendance ?"
Partage un conseil concret adapte a leur secteur.

PHASE 3 — DEMONSTRATION: Montre des EXEMPLES CONCRETS de visuels IA generes pour leur type de business.
${showcaseContext ? 'UTILISE CES EXEMPLES REELS:' + showcaseContext : 'Decris ce que l\'IA peut generer pour eux: "Imagine un visuel pro de ton [produit/plat/salon] avec une accroche tendance, genere en 30 secondes"'}
Dis: "Regarde ce qu'on fait pour des ${prospect.type || 'business'} comme toi" et partage un lien d'exemple.
Si le prospect donne des details sur son business → propose de generer un visuel personnalise pour lui.

PHASE 4 — CLOSING:
- "On a un essai gratuit 14 jours, tous les agents IA debloques. Tu veux que je t'inscris ?"
- Lien: keiroai.com
- Si hesite: "0€ debite, tu annules quand tu veux. En 3 min t'as ton premier visuel pro."

REGLES DE TON — ULTRA IMPORTANT:
- Tu parles COMME LE BUSINESS OWNER, pas comme un agent commercial
- Ecris comme un humain normal sur Instagram — zero ou 1 emoji max par message
- Messages courts et directs (2-3 phrases)
- Tutoiement naturel, decontracte, comme un pote entrepreneur
- JAMAIS de formules generiques ("n'hesite pas", "je suis la pour t'aider", listes a puces)
- JAMAIS dire que tu es une IA
- Si le prospect parle de son business → rebondis dessus naturellement avec un exemple adapte
- Si negatif/stop → "ok pas de souci, bonne continuation"
- Si question prix → "a partir de 49€/mois mais y'a un essai gratuit 14 jours, tu veux tester ?"
- FOCUS SUR LES VISUELS ET LA VISIBILITE, pas sur les DMs ou l'automatisation

PROSPECT: ${prospect.company || prospect.first_name || 'Inconnu'} (${prospect.type || 'type inconnu'}, score: ${prospect.score || 0})
${history ? `\nHISTORIQUE CONVERSATION:\n${history}` : ''}${businessContext}${ragContext}`;

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

        // ─── Small delay to appear more human (not instant bot reply) ──
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000)); // 2-5s delay

        // ─── Send auto-reply if we have one ─────────────
        if (aiReply) {
          // Find the user who owns this Instagram account to get their token
          let profile = null;
          // Try matching by recipientId first
          const { data: directMatch } = await supabase
            .from('profiles')
            .select('id, instagram_business_account_id, facebook_page_access_token, instagram_access_token')
            .eq('instagram_business_account_id', recipientId)
            .limit(1)
            .maybeSingle();
          profile = directMatch;

          // Fallback: try admin profile (most common setup)
          if (!profile?.facebook_page_access_token) {
            const { data: adminMatch } = await supabase
              .from('profiles')
              .select('id, instagram_business_account_id, facebook_page_access_token, instagram_access_token')
              .eq('is_admin', true)
              .not('facebook_page_access_token', 'is', null)
              .limit(1)
              .maybeSingle();
            if (adminMatch?.facebook_page_access_token) {
              profile = adminMatch;
              console.log(`[InstagramWebhook] Using admin profile fallback for reply (recipientId ${recipientId} not found)`);
            }
          }

          const sendToken = profile?.facebook_page_access_token || profile?.instagram_access_token;
          const sendFromId = profile?.instagram_business_account_id || recipientId;

          if (sendToken) {
            try {
              // Instagram Messaging API — try both endpoints
              let sendSuccess = false;
              // Try Facebook Graph API first (works with page tokens)
              try {
                const fbRes = await fetch(`https://graph.facebook.com/v21.0/${sendFromId}/messages`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({
                    recipient: JSON.stringify({ id: senderId }),
                    message: JSON.stringify({ text: aiReply }),
                    access_token: sendToken,
                  }),
                });
                if (fbRes.ok) { sendSuccess = true; console.log('[InstagramWebhook] Reply sent via Facebook Graph API'); }
                else { console.warn('[InstagramWebhook] FB send failed:', (await fbRes.text()).substring(0, 150)); }
              } catch (e: any) { console.warn('[InstagramWebhook] FB send error:', e.message?.substring(0, 100)); }

              // Fallback: Instagram Graph API (works with IGAA tokens)
              if (!sendSuccess && profile?.instagram_access_token) {
                try {
                  const igRes = await fetch(`https://graph.instagram.com/v21.0/me/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      recipient: { id: senderId },
                      message: { text: aiReply },
                      access_token: profile.instagram_access_token,
                    }),
                  });
                  if (igRes.ok) { sendSuccess = true; console.log('[InstagramWebhook] Reply sent via Instagram Graph API'); }
                  else { console.warn('[InstagramWebhook] IG send failed:', (await igRes.text()).substring(0, 150)); }
                } catch (e: any) { console.warn('[InstagramWebhook] IG send error:', e.message?.substring(0, 100)); }
              }

              if (!sendSuccess) console.error('[InstagramWebhook] ALL send methods failed for', senderId);

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
        // Score boost per message: +8 (was +15, too aggressive)
        const newScore = Math.min(100, (prospect.score || 0) + 8);
        const newTemp = newScore >= 70 ? 'hot' : newScore >= 40 ? 'warm' : (prospect.temperature || 'cold');
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

        // After 5+ exchanges AND score >= 60: prospect is genuinely hot → notify client
        // Must have BOTH conditions to avoid premature notifications
        if (exchangeCount && exchangeCount >= 5 && newScore >= 60) {
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

            // In-app notification for the client
            if (ownerProfile?.id) {
              try {
                const { notifyClient } = await import('@/lib/agents/notify-client');
                await notifyClient(supabase, {
                  userId: ownerProfile.id,
                  agent: 'dm_instagram',
                  type: 'action',
                  title: `Prospect chaud a closer !`,
                  message: `${prospect.company || prospect.first_name || 'Prospect'} (score ${newScore}) est pret. ${exchangeCount || 0} echanges. Dernier msg: "${messageText.substring(0, 80)}". Reprends la main pour closer !`,
                  data: { prospect_id: prospect.id, score: newScore, action: 'handover' },
                });
              } catch {}
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
