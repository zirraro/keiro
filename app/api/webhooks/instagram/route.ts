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

        // ─── Fetch prospect's Instagram profile info ──────────────
        let prospectProfileInfo = '';
        try {
          // Get admin token for Business Discovery
          const { data: adminForDiscovery } = await supabase
            .from('profiles')
            .select('instagram_business_account_id, facebook_page_access_token')
            .eq('is_admin', true)
            .not('facebook_page_access_token', 'is', null)
            .limit(1)
            .maybeSingle();

          if (adminForDiscovery?.instagram_business_account_id && adminForDiscovery?.facebook_page_access_token) {
            // Try to get the sender's username from the message event or conversation
            const senderUsername = event.sender?.username || null;
            if (senderUsername) {
              const discoveryRes = await fetch(
                `https://graph.facebook.com/v21.0/${adminForDiscovery.instagram_business_account_id}?fields=business_discovery.fields(username,name,biography,followers_count,media_count,profile_picture_url,media.limit(3){caption,timestamp,like_count,comments_count,media_url,media_type}).username(${senderUsername})&access_token=${adminForDiscovery.facebook_page_access_token}`,
                { signal: AbortSignal.timeout(8000) }
              );
              if (discoveryRes.ok) {
                const disc = await discoveryRes.json();
                const bd = disc.business_discovery;
                if (bd) {
                  prospectProfileInfo = `\n\nPROFIL INSTAGRAM DU PROSPECT:
- Username: @${bd.username}
- Nom: ${bd.name || '?'}
- Bio: ${bd.biography || 'aucune'}
- Abonnés: ${bd.followers_count || '?'}
- Posts: ${bd.media_count || '?'}`;
                  if (bd.media?.data?.length > 0) {
                    prospectProfileInfo += '\n- Derniers posts:';
                    for (const m of bd.media.data.slice(0, 3)) {
                      prospectProfileInfo += `\n  • ${m.caption?.substring(0, 80) || 'Sans légende'} (${m.like_count || 0} likes, ${m.media_type})`;
                    }
                  }
                  // Update prospect in CRM with real info
                  const updates: Record<string, any> = { updated_at: now };
                  if (bd.name && (!prospect.company || prospect.company === 'Instagram')) updates.company = bd.name;
                  if (bd.followers_count) updates.abonnes = bd.followers_count;
                  if (bd.username) updates.instagram = `@${bd.username}`;
                  await supabase.from('crm_prospects').update(updates).eq('id', prospect.id);
                  console.log(`[InstagramWebhook] Enriched prospect with Business Discovery: @${bd.username}, ${bd.followers_count} followers`);
                }
              }
            }
          }
        } catch (discErr: any) {
          console.warn('[InstagramWebhook] Business Discovery failed (non-fatal):', discErr.message?.substring(0, 100));
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

        // Track images already sent to this prospect to avoid duplicates
        let alreadySentImages: string[] = [];
        try {
          const { data: sentLogs } = await supabase
            .from('agent_logs')
            .select('data')
            .eq('agent', 'dm_instagram')
            .eq('action', 'dm_auto_reply')
            .contains('data', { prospect_id: prospect.id })
            .order('created_at', { ascending: false })
            .limit(10);
          alreadySentImages = (sentLogs || []).map(l => l.data?.image_sent).filter(Boolean);
        } catch {}

        const systemPrompt = `Tu es Victor, fondateur de KeiroAI. Tu reponds aux DMs comme si c'etait toi, un entrepreneur qui parle a un autre entrepreneur.

CE QUE TU PROPOSES:
On genere des images et videos pro avec l'IA pour les reseaux sociaux. Le contenu surfe sur les tendances et actualites pour attirer l'attention. Tout est automatise — publication sur Instagram, TikTok, LinkedIn. Le business owner n'a rien a faire.

COMMENT TU PARLES:
- Comme un pote entrepreneur. Court, direct, naturel.
- ZERO emoji. Aucun. Jamais.
- 2-3 phrases max par message. Pas de pavé.
- Tutoiement. Decontracte mais pro.
- JAMAIS de "n'hesite pas", "je suis la pour", "nos agents", "notre systeme", "IA qui gere tes DMs".
- JAMAIS parler de bug, erreur, systeme. Tout est fluide.
- JAMAIS de listes a puces dans un DM.
- Tu NE VENDS PAS la gestion de DMs. Tu vends la GENERATION D'IMAGES ET VIDEOS.

STRATEGIE — va VITE, le prospect perd patience:

1) PREMIER MESSAGE: Reponds a sa question directement + demande son activite si tu la connais pas.
"Salut ! On fait de la generation de contenu pro avec l'IA pour les commercants. T'es dans quel domaine ?"

2) DES QU'IL DIT SON BUSINESS: Envoie IMMEDIATEMENT un exemple visuel. N'attends pas. Ne demande pas "tu veux voir un exemple ?". Envoie direct.
"Ah cool les agences de voyage ! Tiens regarde ce qu'on genere [SEND_SHOWCASE:${prospect.type || 'restaurant'}]"

3) SI IL REDEMANDE OU DIT "rien recu": Envoie un AUTRE exemple (pas le meme). Ou genere un visuel perso.
"Je t'en envoie un autre, regarde ca [SEND_SHOWCASE:generic]"

4) SI IL EST INTERESSE: Propose l'essai gratuit directement.
"Tu veux tester ? C'est gratuit 14 jours, zero engagement. keiroai.com"

IMAGES — TRES IMPORTANT:
- Pour envoyer un visuel exemple: mets [SEND_SHOWCASE:type] a la fin de ton message (type = restaurant, boutique, coach, caviste, fleuriste, generic)
- Pour generer un visuel personnalise: mets [GENERATE_IMAGE:description en anglais] a la fin
- IMAGES DEJA ENVOYEES A CE PROSPECT: ${alreadySentImages.length > 0 ? alreadySentImages.join(', ') : 'aucune'}
- Si tu as deja envoye une image, envoie un TYPE DIFFERENT ou genere un perso. JAMAIS le meme.
- Le systeme envoie l'image automatiquement apres ton texte.

INTERDICTIONS ABSOLUES:
- Ne dis JAMAIS "je t'envoie un exemple" sans mettre [SEND_SHOWCASE:...] ou [GENERATE_IMAGE:...]
- Ne dis JAMAIS "le systeme a bugge", "excuses pour le couac", "probleme technique", "desole pour le delai"
- Ne dis JAMAIS que tu es une IA ou un agent
- Ne parle JAMAIS de DMs, d'automatisation de DMs, de gestion de messages
- Ne t'excuse JAMAIS. Pas de "desole", "pardon", "mille excuses", "ah mince"
- Ne fais JAMAIS repeter le prospect. S'il dit "rien recu" ou "je regarde quoi" → envoie IMMEDIATEMENT un exemple avec un type DIFFERENT: [SEND_SHOWCASE:generic] ou [GENERATE_IMAGE:...]
- Si le prospect dit "toujours rien" → envoie le lien directement dans le texte: "Tiens clique la: [URL de l'image]"

PROSPECT: ${prospect.company || prospect.first_name || 'Inconnu'} (${prospect.type || 'type inconnu'})
${prospectProfileInfo}
${history ? `\nCONVERSATION:\n${history}` : ''}${businessContext}${ragContext}`;

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

        // ─── Detect image actions in AI reply ──────────
        let imageToSend: string | null = null;

        // Check if Jade wants to send a showcase image
        const showcaseMatch = aiReply.match(/\[SEND_SHOWCASE:([^\]]+)\]/);
        if (showcaseMatch) {
          const bType = showcaseMatch[1].trim().toLowerCase();
          aiReply = aiReply.replace(/\[SEND_SHOWCASE:[^\]]+\]/, '').trim();

          // Get ALL images for this type, then pick one NOT already sent to this prospect
          // Map common business types to available showcase types
          const TYPE_MAP: Record<string, string> = {
            'agence': 'generic', 'voyage': 'generic', 'agence de voyage': 'generic',
            'bar': 'caviste', 'cafe': 'restaurant', 'brasserie': 'restaurant',
            'salon': 'coiffeur', 'barbier': 'coiffeur', 'beaute': 'coiffeur',
            'boulangerie': 'restaurant', 'patisserie': 'restaurant', 'traiteur': 'restaurant',
            'freelance': 'coach', 'consultant': 'coach', 'formation': 'coach',
            'magasin': 'boutique', 'commerce': 'boutique', 'mode': 'boutique',
            'spa': 'coiffeur', 'esthetique': 'coiffeur',
          };
          const mappedType = TYPE_MAP[bType] || bType;
          const typesToTry = [mappedType, 'generic'];
          // Remove duplicates
          const uniqueTypes = [...new Set(typesToTry)];

          for (const tryType of uniqueTypes) {
            if (imageToSend) break;
            try {
              const { data: imgs } = await supabase
                .from('showcase_images')
                .select('id, image_url, usage_count')
                .eq('business_type', tryType)
                .eq('is_active', true)
                .order('usage_count', { ascending: true })
                .limit(10);

              if (imgs && imgs.length > 0) {
                const unsent = imgs.filter((img: any) => !alreadySentImages.includes(img.image_url));
                const picked = unsent.length > 0 ? unsent[0] : imgs[Math.floor(Math.random() * imgs.length)];
                imageToSend = picked.image_url;
                console.log(`[InstagramWebhook] Picked image: ${tryType} → ${(imageToSend || '').substring(0, 60)} (unsent: ${unsent.length}/${imgs.length})`);

                // Increment usage_count
                supabase.from('showcase_images').update({ usage_count: ((picked as any).usage_count || 0) + 1 }).eq('id', picked.id).then(() => {});
              }
            } catch (e: any) { console.warn(`[InstagramWebhook] Showcase fetch error for ${tryType}:`, e.message?.substring(0, 80)); }
          }

          console.log(`[InstagramWebhook] Showcase: requested="${bType}" mapped="${mappedType}" found=${!!imageToSend} (already sent: ${alreadySentImages.length})`);
        }

        // Check if Jade wants to generate a personalized image
        const generateMatch = aiReply.match(/\[GENERATE_IMAGE:([^\]]+)\]/);
        if (generateMatch && !imageToSend) {
          const imgPrompt = generateMatch[1].trim();
          aiReply = aiReply.replace(/\[GENERATE_IMAGE:[^\]]+\]/, '').trim();
          try {
            const seedreamUrl = process.env.SEEDREAM_API_URL;
            const seedreamKey = process.env.SEEDREAM_API_KEY;
            if (seedreamUrl && seedreamKey) {
              console.log(`[InstagramWebhook] Generating personalized image: ${imgPrompt.substring(0, 80)}`);
              const genRes = await fetch(seedreamUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${seedreamKey}` },
                body: JSON.stringify({ prompt: imgPrompt, width: 1080, height: 1080, num_images: 1 }),
                signal: AbortSignal.timeout(30000),
              });
              if (genRes.ok) {
                const genData = await genRes.json();
                const generatedUrl = genData.images?.[0]?.url || genData.data?.[0]?.url || genData.url;
                if (generatedUrl) imageToSend = generatedUrl;
              }
            }
          } catch (genErr: any) {
            console.warn('[InstagramWebhook] Image generation failed:', genErr.message?.substring(0, 100));
          }
        }

        // If no image found from showcase but AI wanted to send one, generate via Seedream
        // This handles ANY business type — not limited to DB categories
        if (!imageToSend && (showcaseMatch || generateMatch)) {
          try {
            const seedreamUrl = process.env.SEEDREAM_API_URL;
            const seedreamKey = process.env.SEEDREAM_API_KEY;
            if (seedreamUrl && seedreamKey) {
              // Build a rich prompt from prospect info
              const bizType = prospect.type || (showcaseMatch ? showcaseMatch[1] : 'business');
              const bizName = prospect.company || '';
              const autoPrompt = `Professional Instagram marketing visual for a ${bizType}${bizName ? ` called "${bizName}"` : ''}, modern clean design, vibrant colors, eye-catching social media post, professional photography style, warm lighting, high quality 4K, trending aesthetic`;
              console.log(`[InstagramWebhook] Auto-generating image: ${autoPrompt.substring(0, 80)}`);
              const genRes = await fetch(seedreamUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${seedreamKey}` },
                body: JSON.stringify({ prompt: autoPrompt, width: 1080, height: 1080, num_images: 1 }),
                signal: AbortSignal.timeout(30000),
              });
              if (genRes.ok) {
                const genData = await genRes.json();
                const generatedUrl = genData.images?.[0]?.url || genData.data?.[0]?.url || genData.url;
                if (generatedUrl) {
                  imageToSend = generatedUrl;
                  console.log(`[InstagramWebhook] Auto-generated image: ${generatedUrl.substring(0, 80)}`);
                }
              }
            }
          } catch (e: any) {
            console.warn('[InstagramWebhook] Auto-generate failed:', e.message?.substring(0, 80));
          }
        }

        // GUARANTEED: if we still have an image, include URL in message text as fallback
        if (imageToSend && aiReply) {
          // Always append URL to text — this is the guaranteed delivery method
          aiReply = aiReply.trim() + '\n\n' + imageToSend;
        }

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

              // Also try sending image as direct attachment via Instagram API (works in test mode)
              // The URL is already in the text as fallback
              if (imageToSend && sendSuccess && profile?.instagram_access_token) {
                await new Promise(r => setTimeout(r, 1500));
                try {
                  const igImgRes = await fetch(`https://graph.instagram.com/v21.0/me/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      recipient: { id: senderId },
                      message: { attachment: { type: 'image', payload: { url: imageToSend, is_reusable: true } } },
                      access_token: profile.instagram_access_token,
                    }),
                  });
                  if (igImgRes.ok) {
                    console.log('[InstagramWebhook] Image attachment sent via IG API (inline display)');
                  } else {
                    console.warn('[InstagramWebhook] IG image attachment failed:', (await igImgRes.text()).substring(0, 150));
                  }
                } catch (e: any) {
                  console.warn('[InstagramWebhook] IG image error:', e.message?.substring(0, 80));
                }
              }

              console.log(`[InstagramWebhook] Auto-reply sent to ${senderId}`);

              // Log outbound reply (include image_sent for dedup)
              await supabase.from('agent_logs').insert({
                agent: 'dm_instagram',
                action: 'dm_auto_reply',
                data: {
                  prospect_id: prospect.id,
                  sender_id: senderId,
                  message: aiReply,
                  direction: 'outbound',
                  image_sent: imageToSend || null,
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

        // ─── Learn from image reactions ──────────────────
        // If prospect responded after an image was sent, track the reaction
        const lastSentImage = alreadySentImages.length > 0 ? alreadySentImages[alreadySentImages.length - 1] : null;
        if (lastSentImage) {
          const msgLower = messageText.toLowerCase();
          const isPositive = msgLower.includes('cool') || msgLower.includes('super') || msgLower.includes('bien') || msgLower.includes('oui') || msgLower.includes('interesse') || msgLower.includes('top') || msgLower.includes('j\'aime') || msgLower.includes('genial') || msgLower.includes('wow');
          const isNegative = msgLower.includes('non') || msgLower.includes('pas') || msgLower.includes('bof') || msgLower.includes('rien recu') || msgLower.includes('moche');
          if (isPositive || isNegative) {
            try {
              const { saveLearning } = await import('@/lib/agents/learning');
              await saveLearning(supabase, {
                agent: 'dm_instagram',
                category: 'content',
                learning: `Image DM ${isPositive ? 'APPRECIEE' : 'PAS APPRECIEE'} par ${prospect.type || 'prospect'}: ${lastSentImage.substring(0, 100)}. Reaction: "${messageText.substring(0, 80)}"`,
                evidence: `prospect_${prospect.id}_image_reaction`,
                confidence: isPositive ? 30 : 20,
              });
            } catch {}
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

            // In-app notification only (no email spam)
            // The daily CEO brief will include this in the evening summary

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
