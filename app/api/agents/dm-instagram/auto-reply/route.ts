import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/agents/dm-instagram/auto-reply
 * Poll Instagram conversations and auto-reply to unanswered messages.
 * Called by scheduler every 3 min or manually.
 * Auth: CRON_SECRET or authenticated user.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  let userId: string | null = null;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    userId = req.nextUrl.searchParams.get('user_id');
  } else {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    userId = user.id;
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Respect the AI toggle (Meta Human Agent protocol). If the user has
  // handed the mic back to themselves (auto_mode=false) the agent must
  // stay silent — no auto replies, even on cron ticks. We still return
  // 200 so the worker doesn't retry/alert; payload shows it was skipped.
  if (userId) {
    // Some accounts have duplicated org_agent_configs rows for the same
    // user/agent pair — .maybeSingle() would return null in that case and
    // silently bypass the gate. Read the most recent row instead.
    const { data: toggleCfgRows } = await supabase
      .from('org_agent_configs')
      .select('config, created_at')
      .eq('user_id', userId)
      .eq('agent_id', 'dm_instagram')
      .order('created_at', { ascending: false })
      .limit(1);
    const autoMode = toggleCfgRows?.[0]?.config?.auto_mode;
    if (autoMode === false) {
      return NextResponse.json({
        ok: true,
        skipped_reason: 'ai_off',
        replied: 0,
        skipped: 0,
        total_conversations: 0,
        message: 'AI toggle is off — human is handling replies.',
      });
    }
  }

  // Get IG tokens — IGAA token (graph.instagram.com) takes priority since
  // it's the only one Meta lets read conversation content.
  let igToken: string | null = null;
  let fbToken: string | null = null;
  let igaaToken: string | null = null;
  let igUserId: string | null = null;
  let pageId: string | null = null;
  let ownerUserId: string | null = userId;

  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token, instagram_igaa_token, facebook_page_access_token, facebook_page_id')
      .eq('id', userId)
      .single();
    igToken = profile?.instagram_access_token;
    igaaToken = profile?.instagram_igaa_token;
    fbToken = profile?.facebook_page_access_token;
    igUserId = profile?.instagram_business_account_id;
    pageId = profile?.facebook_page_id;
  }

  // Fallback to admin
  if (!igUserId && !igaaToken) {
    const { data: admin } = await supabase
      .from('profiles')
      .select('id, instagram_business_account_id, instagram_access_token, instagram_igaa_token, facebook_page_access_token, facebook_page_id')
      .eq('is_admin', true)
      .limit(1)
      .maybeSingle();
    if (admin) {
      igToken = admin.instagram_access_token;
      igaaToken = admin.instagram_igaa_token;
      fbToken = admin.facebook_page_access_token;
      igUserId = admin.instagram_business_account_id;
      pageId = admin.facebook_page_id;
      ownerUserId = admin.id;
    }
  }

  if (!igUserId && !igaaToken) {
    return NextResponse.json({ ok: false, error: 'Instagram non connecté' });
  }

  // Use IGAA when we have it — it's the only token that reliably reads DMs.
  // Fall back to FB/IG tokens for accounts that still have classic OAuth.
  const useIgaa = !!igaaToken;
  const token = useIgaa ? igaaToken! : (fbToken || igToken!);
  const myIds = new Set([igUserId, pageId].filter(Boolean));

  try {
    // 1. Fetch recent conversations
    const domain = useIgaa || !fbToken ? 'graph.instagram.com' : 'graph.facebook.com';
    const convUrl = useIgaa
      ? `https://graph.instagram.com/v21.0/me/conversations?fields=id,participants,updated_time&access_token=${token}`
      : fbToken && pageId
        ? `https://graph.facebook.com/v21.0/${pageId}/conversations?platform=instagram&fields=id,participants,updated_time&access_token=${token}`
        : `https://graph.instagram.com/v21.0/me/conversations?fields=id,participants,updated_time&access_token=${token}`;

    const convRes = await fetch(convUrl);
    if (!convRes.ok) {
      const err = await convRes.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `API error: ${convRes.status} ${err.substring(0, 100)}` });
    }

    const convData = await convRes.json();
    const conversations = convData.data || [];
    console.log(`[DM-AutoReply] Found ${conversations.length} conversations`);

    let replied = 0;
    let skipped = 0;

    // 2. Check each conversation for unanswered messages
    for (const conv of conversations.slice(0, 15)) {
      try {
        // Get latest messages
        const msgRes = await fetch(
          `https://${domain}/v21.0/${conv.id}/messages?fields=id,message,from,created_time&limit=5&access_token=${token}`
        );
        if (!msgRes.ok) continue;

        const msgData = await msgRes.json();
        const messages = (msgData.data || []).reverse(); // Chronological
        if (messages.length === 0) continue;

        // Check if last message is from us
        const lastMsg = messages[messages.length - 1];
        const lastFromMe = myIds.has(lastMsg.from?.id);
        if (lastFromMe) { skipped++; continue; } // Already replied

        const lastMsgText = lastMsg.message || '';
        if (!lastMsgText.trim()) { skipped++; continue; }

        // Check if we already replied to this message (dedup)
        const { data: alreadyReplied } = await supabase
          .from('agent_logs')
          .select('id')
          .eq('agent', 'dm_instagram')
          .eq('action', 'dm_auto_reply')
          .contains('data', { reply_to_msg_id: lastMsg.id })
          .limit(1)
          .maybeSingle();
        if (alreadyReplied) { skipped++; continue; }

        // Get sender info
        const otherParticipant = conv.participants?.data?.find((p: any) => !myIds.has(p.id));
        const senderId = otherParticipant?.id || lastMsg.from?.id;
        const senderName = otherParticipant?.username || lastMsg.from?.username || lastMsg.from?.name || 'Inconnu';

        // Check if too old (> 24h = outside messaging window)
        const msgAge = Date.now() - new Date(lastMsg.created_time).getTime();
        if (msgAge > 24 * 60 * 60 * 1000) { skipped++; continue; }

        // Build conversation history as proper multi-turn chat (last message
        // will be sent as the current user input, so we exclude it here).
        const historyMsgs = messages.slice(0, -1);
        const history: Array<{ role: 'user' | 'assistant'; content: string }> = historyMsgs
          .map((m: any) => ({
            role: (myIds.has(m.from?.id) ? 'assistant' : 'user') as 'user' | 'assistant',
            content: m.message || '',
          }))
          .filter((h: { content: string }) => h.content.trim().length > 0);

        // Find/create prospect
        let prospect: any = null;
        const { data: existingProspect } = await supabase
          .from('crm_prospects')
          .select('id, company, first_name, type, temperature, score')
          .or(`instagram.eq.${senderId},instagram.eq.@${senderName}`)
          .limit(1)
          .maybeSingle();

        if (existingProspect) {
          prospect = existingProspect;
        } else {
          const { data: newProspect } = await supabase
            .from('crm_prospects')
            .insert({
              first_name: senderName,
              instagram: senderId,
              source: 'dm_instagram',
              status: 'contacte',
              temperature: 'warm',
              score: 20,
              created_at: new Date().toISOString(),
              ...(ownerUserId ? { user_id: ownerUserId, created_by: ownerUserId } : {}),
            })
            .select()
            .single();
          prospect = newProspect;
        }

        // Load RAG for smart response
        let ragContext = '';
        try {
          const { getActiveLearnings, getAllHistoricalLearnings, formatLearningsForPrompt } = await import('@/lib/agents/learning');
          const [own, global] = await Promise.all([
            getActiveLearnings(supabase, 'dm_instagram', undefined, undefined),
            getAllHistoricalLearnings(supabase, { minConfidence: 40, limit: 10 }),
          ]);
          if ((own || []).length > 0 || (global || []).length > 0) {
            ragContext = '\n\nCONNAISSANCES:\n' + formatLearningsForPrompt(own || [], global || []);
          }
        } catch {}

        // Pull a live IG profile snapshot for the sender so Jade can reply
        // with context (her bio, recent posts, engagement). Without this the
        // reply is generic and sounds bot-ish. We reuse fbToken+igUserId
        // because business_discovery is only exposed on graph.facebook.com
        // with a Page token.
        let senderSnapshotText = '';
        try {
          if (fbToken && igUserId && senderName) {
            const { getInstagramProfileSnapshot, snapshotToPromptContext, readProfileFromVisuals } = await import('@/lib/agents/ig-profile-snapshot');
            const snap = await getInstagramProfileSnapshot(senderName, igUserId, fbToken);
            if (snap.exists) {
              // Sonnet vision pass over the last 3 posts + bio so Jade
              // gets a 'has_business' / 'entrepreneur_curious' verdict
              // and the right offer (B2C vs B2B white-label).
              const vision = await readProfileFromVisuals(snap).catch(() => null);
              senderSnapshotText = '\n\n' + snapshotToPromptContext(snap, vision);
            }
          }
        } catch { /* snapshot is best-effort — fall through silently */ }

        // Generate AI response
        const { callGeminiChat } = await import('@/lib/agents/gemini');
        const { languagePromptDirective } = await import('@/lib/agents/language-detect');
        const langDirective = languagePromptDirective(lastMsgText);
        const systemPrompt = `${langDirective}

Tu parles au nom du business owner. Tu es son assistant qui repond a ses DMs Instagram comme si c'etait lui.

CE QUE KEIROAI PROPOSE (DEUX OFFRES distinctes selon le profil) :

🅰️ OFFRE B2C — UTILISATION DIRECTE (pour qui A un business OU est sur le point de lancer)
- Génération de visuels/vidéos IA + publication auto IG/TikTok/LinkedIn
- 16 agents qui automatisent la com, les emails, les DMs, les avis
- Essai gratuit 7 jours sur keiroai.com
- Utilisé PAR le commerce/coach/freelance pour SON propre business

🅱️ OFFRE B2B — MARQUE BLANCHE / AGENCE (pour qui est intéressé par l'entreprenariat MAIS n'a pas encore de business)
- KeiroAI rebrandé sous LE NOM DE LA PERSONNE → elle revend à ses propres clients
- Modèle agence IA : la personne devient prestataire de marketing automation
- Margins typiques 50-70% (elle facture X, on prend 30%)
- Offre commission + dashboard partenaire dédié
- Idéal pour quelqu'un de curieux d'entreprenariat sans projet précis

⛔ NE CONFONDS JAMAIS LES DEUX. Étape obligatoire AVANT d'orienter :
1. Sondage rapide : "Tu fais quoi en ce moment ? T'as déjà un business / un projet précis ?"
2. CLASSIFIE :
   - Business actif / projet sur le point de lancer / idée précise → OFFRE A (utiliser KeiroAI)
   - Curiosité, dispo, veut "se lancer" sans direction → OFFRE B (marque blanche)
   - Ne sait pas trop → demande encore avant de proposer
3. Adapte ta proposition exclusivement à l'offre qui matche.

APPROCHE CONVERSATION (ESCALATION LADDER — ne lâche jamais un prospect intéressé):

NIVEAU 1 — IDENTIFIER + ORIENTER (étape par défaut)
1. Reponds a la question/message du prospect naturellement
2. Identifie son profil (business existant vs intérêt entreprenariat) via 1-2 questions max
3. Selon le profil, oriente vers OFFRE A ou OFFRE B :
   - A : "T'as 2 min ? Je te montre ce qu'on fait pour des [son secteur]. Test gratuit sur keiroai.com"
   - B : "Vu que t'aimes l'entrepreneuriat, on a un programme partenaire — tu rebrandes KeiroAI sous TON nom et tu revends. Ça t'intéresse que je t'explique ?"
4. JAMAIS pousser l'inverse (ex: pas d'offre marque blanche à un commerçant qui veut juste plus de clients).

NIVEAU 2 — RDV SI HÉSITATION (le prospect tergiverse, demande "à voir", "j'ai pas le temps")
- Propose un appel court : "On en parle 15 min pour voir si c'est pertinent pour toi ? Tu peux choisir un créneau ici : ${process.env.NEXT_PUBLIC_SETUP_CALL_URL || 'https://cal.com/keiroai/setup-30min'}"
- Cadre la valeur : "Je te montre 2-3 trucs en live, tu décides après. 0 prise de tête."

NIVEAU 3 — CADEAU + EMAIL (le prospect refuse l'appel mais reste poli)
- Offre une démo personnalisée : "Pas de souci pour l'appel. Donne-moi ton email, je te crée 1 visuel custom pour ${prospect?.type || 'ton activité'} en 24h, tu juges sur pièce."
- Cette offre déclenche l'onboarding email + retient le contact.

NIVEAU 4 — HANDOFF HUMAIN (cas spéciaux uniquement)
Émets le tag [HANDOFF_HUMAN: <raison>] quand :
- Le prospect demande explicitement à parler à un humain
- Question sensible (légal, RGPD, contrat custom, intégration spécifique)
- Conversation devient agressive ou hostile
- Tu ne comprends vraiment pas ce qu'il veut après 3 échanges
TANT QUE tu peux convertir (intérêt + questions sur le produit) → ne fais PAS de handoff, va au bout de la ladder.

NIVEAU 5 — CLOSE PROPRE (vraiment plus d'opportunité)
- "Ok pas de souci, je te laisse. Si t'changes d'avis, le test gratuit est sur keiroai.com 👋"
- N'insiste jamais 2 fois après un refus clair.

REGLES DE TON:
- Ecris comme un HUMAIN, pas comme un bot — zero emoji ou 1 max
- Messages courts et directs (2-3 phrases)
- TERMINE TOUJOURS TES PHRASES — JAMAIS de message coupé. Si tu as 3 phrases à dire mais le quota est court, dis 2 phrases COMPLÈTES plutôt que 3 phrases tronquées.
- UTILISE LE PRÉNOM extrait de la bio si disponible (cf bloc PERSONNALISATION).
- RÉFÉRENCE LA NICHE / TRAIT du prospect au moins une fois — montre que tu as lu son profil.
- Tutoiement naturel, comme si tu parlais a un pote entrepreneur
- Pas de formules toutes faites, pas de "n'hesite pas", pas de listes a puces
- Si negatif → "ok pas de souci, bonne continuation"

${prospect?.type ? `Si le prospect demande un exemple visuel ET que tu connais son secteur (${prospect.type}), ajoute: [SEND_SHOWCASE:${prospect.type}]` : `IMPORTANT: Tu NE CONNAIS PAS encore le secteur du prospect. N'envoie AUCUN visuel generique — demande-lui d'abord ce qu'il fait. N'utilise PAS [SEND_SHOWCASE] tant que tu n'as pas identifie son business.`}

PROSPECT: ${prospect?.company || prospect?.first_name || senderName} (${prospect?.type || 'secteur inconnu — demande-lui'}, score: ${prospect?.score || 0})${senderSnapshotText}
${ragContext}`;

        let aiReply = '';
        try {
          aiReply = await callGeminiChat({ system: systemPrompt, message: lastMsgText, history, thinking: true });

          // Detect HANDOFF tag — Jade signals she can't proceed.
          // We strip it from the visible reply and flag the prospect
          // so the human (business owner) sees the conversation needs
          // attention. We DO NOT send the AI reply if handoff fired —
          // the human will write the next message.
          const handoffMatch = aiReply.match(/\[HANDOFF_HUMAN(?:\s*:\s*([^\]]*))?\]/i);
          if (handoffMatch) {
            const reason = (handoffMatch[1] || 'agent_request').trim().slice(0, 200);
            try {
              await supabase.from('crm_prospects').update({
                dm_status: 'needs_human',
                dm_message: `[HANDOFF] ${reason}`,
                updated_at: new Date().toISOString(),
              }).eq('id', prospect?.id);
              await supabase.from('crm_activities').insert({
                prospect_id: prospect?.id,
                type: 'dm_handoff',
                description: `Jade demande l'intervention humaine: ${reason}`,
                data: { channel: 'instagram', reason, last_message: lastMsgText.substring(0, 500) },
                created_at: new Date().toISOString(),
              });
            } catch {}
            console.log(`[DM-AutoReply] HANDOFF for ${senderName}: ${reason}`);
            continue;   // skip sending — human will reply
          }

          aiReply = aiReply
            .replace(/\*\*/g, '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/\[SEND_SHOWCASE:[^\]]+\]/g, '')
            .replace(/\[GENERATE_IMAGE:[^\]]+\]/g, '')
            .replace(/\[HANDOFF_HUMAN[^\]]*\]/gi, '')
            .trim();

          // Truncate at SENTENCE BOUNDARY, never mid-word.
          // Was: hard substring(0, 500) which produced "...je peux te montrer com" cuts.
          // Now: if too long, find the last complete sentence within budget.
          const MAX = 500;
          if (aiReply.length > MAX) {
            const slice = aiReply.substring(0, MAX);
            // Find the last terminal punctuation in the slice
            const m = slice.match(/^[\s\S]*[.!?…](\s|$)/);
            if (m && m[0].trim().length >= 80) {
              aiReply = m[0].trim();
            } else {
              // Fall back: cut at the last space, append ellipsis
              const lastSpace = slice.lastIndexOf(' ');
              aiReply = (lastSpace > 100 ? slice.substring(0, lastSpace) : slice).trim();
              if (!/[.!?…]$/.test(aiReply)) aiReply += '.';
            }
          }
          // Even when within budget, if the model ended mid-thought
          // (no terminal punctuation at all), close it cleanly.
          if (aiReply && !/[.!?…]$/.test(aiReply)) {
            aiReply = aiReply.replace(/[\s,;:]+$/, '') + '.';
          }
        } catch (e: any) {
          console.error(`[DM-AutoReply] AI error for ${senderName}:`, e.message?.substring(0, 100));
          continue;
        }

        if (!aiReply) continue;

        // Send reply — graph.instagram.com when using IGAA, else FB graph.
        try {
          const sendHost = useIgaa ? 'graph.instagram.com' : 'graph.facebook.com';
          const sendPath = useIgaa ? 'me' : igUserId;
          const sendRes = await fetch(`https://${sendHost}/v21.0/${sendPath}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              recipient: JSON.stringify({ id: senderId }),
              message: JSON.stringify({ text: aiReply }),
              access_token: token,
            }),
          });

          if (sendRes.ok) {
            replied++;
            console.log(`[DM-AutoReply] Replied to ${senderName}: "${aiReply.substring(0, 50)}..."`);

            // Log
            await supabase.from('agent_logs').insert({
              agent: 'dm_instagram',
              action: 'dm_auto_reply',
              status: 'success',
              data: {
                prospect_id: prospect?.id,
                sender_name: senderName,
                sender_id: senderId,
                message_received: lastMsgText.substring(0, 200),
                reply_sent: aiReply.substring(0, 200),
                reply_to_msg_id: lastMsg.id,
                method: 'polling',
              },
              created_at: new Date().toISOString(),
            });

            // Update prospect score
            if (prospect?.id) {
              await supabase.from('crm_prospects').update({
                score: Math.min(100, (prospect.score || 0) + 8),
                temperature: (prospect.score || 0) + 8 >= 70 ? 'hot' : 'warm',
                updated_at: new Date().toISOString(),
              }).eq('id', prospect.id);
            }

            // Log activity
            await supabase.from('crm_activities').insert({
              prospect_id: prospect?.id,
              type: 'dm_instagram',
              description: `DM auto-reply: "${aiReply.substring(0, 100)}"`,
              data: { direction: 'outbound', auto: true, reply_to: lastMsgText.substring(0, 100) },
              created_at: new Date().toISOString(),
            });
          } else {
            const err = await sendRes.text().catch(() => '');
            console.warn(`[DM-AutoReply] Send failed for ${senderName}:`, err.substring(0, 100));
          }
        } catch (sendErr: any) {
          console.error(`[DM-AutoReply] Send error:`, sendErr.message?.substring(0, 100));
        }

        // Rate limit: 1 second between replies
        await new Promise(r => setTimeout(r, 1000));
      } catch (convErr: any) {
        console.warn(`[DM-AutoReply] Conv error:`, convErr.message?.substring(0, 100));
      }
    }

    console.log(`[DM-AutoReply] Done: ${replied} replied, ${skipped} skipped`);

    return NextResponse.json({
      ok: true,
      replied,
      skipped,
      total_conversations: conversations.length,
    });
  } catch (e: any) {
    console.error('[DM-AutoReply] Error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
