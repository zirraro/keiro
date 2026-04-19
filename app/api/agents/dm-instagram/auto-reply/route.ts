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
    const { data: toggleCfg } = await supabase
      .from('org_agent_configs')
      .select('config')
      .eq('user_id', userId)
      .eq('agent_id', 'dm_instagram')
      .maybeSingle();
    const autoMode = toggleCfg?.config?.auto_mode;
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

        // Generate AI response
        const { callGeminiChat } = await import('@/lib/agents/gemini');
        const systemPrompt = `Tu parles au nom du business owner. Tu es son assistant qui repond a ses DMs Instagram comme si c'etait lui.

CE QUE LE BUSINESS PROPOSE (KeiroAI):
- Generation de visuels et videos pro avec l'IA pour les reseaux sociaux
- Publication automatique Instagram, TikTok, LinkedIn
- Contenu qui surfe sur les tendances et actualites
- Essai gratuit 7 jours sur keiroai.com

APPROCHE CONVERSATION:
1. Reponds a la question/message du prospect naturellement
2. Identifie son business, demande ce qu'il fait si tu ne sais pas
3. Propose de montrer des exemples de visuels adaptes a son secteur
4. Si interesse: "T'as 2 min ? Je te montre ce qu'on fait pour des [son secteur]. C'est gratuit a tester sur keiroai.com"

REGLES DE TON:
- Ecris comme un HUMAIN, pas comme un bot — zero emoji ou 1 max
- Messages courts et directs (2-3 phrases)
- Tutoiement naturel, comme si tu parlais a un pote entrepreneur
- Pas de formules toutes faites, pas de "n'hesite pas", pas de listes a puces
- Si negatif → "ok pas de souci, bonne continuation"

${prospect?.type ? `Si le prospect demande un exemple visuel ET que tu connais son secteur (${prospect.type}), ajoute: [SEND_SHOWCASE:${prospect.type}]` : `IMPORTANT: Tu NE CONNAIS PAS encore le secteur du prospect. N'envoie AUCUN visuel generique — demande-lui d'abord ce qu'il fait. N'utilise PAS [SEND_SHOWCASE] tant que tu n'as pas identifie son business.`}

PROSPECT: ${prospect?.company || prospect?.first_name || senderName} (${prospect?.type || 'secteur inconnu — demande-lui'}, score: ${prospect?.score || 0})
${ragContext}`;

        let aiReply = '';
        try {
          aiReply = await callGeminiChat({ system: systemPrompt, message: lastMsgText, history, thinking: true });
          aiReply = aiReply
            .replace(/\*\*/g, '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/\[SEND_SHOWCASE:[^\]]+\]/g, '')
            .replace(/\[GENERATE_IMAGE:[^\]]+\]/g, '')
            .trim();
          if (aiReply.length > 500) aiReply = aiReply.substring(0, 500);
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
