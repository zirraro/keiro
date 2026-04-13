import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  detectBusinessType,
  detectEmail,
  detectPhone,
  detectPlanInterest,
  detectObjection,
} from '@/lib/agents/chatbot-detection';
import {
  getChatbotSystemPrompt,
  buildContextualInstructions,
} from '@/lib/agents/chatbot-prompt';
import { calculateScore } from '@/lib/agents/scoring';
import { callGeminiChat } from '@/lib/agents/gemini';

export const runtime = 'nodejs';
export const maxDuration = 30;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(`Supabase non configuré (url=${!!url}, key=${!!key})`);
  }
  return createClient(url, key);
}

/**
 * POST /api/chatbot/message
 * Public endpoint for anonymous website visitors to chat with the KeiroAI chatbot.
 * No auth required. Rate limited by visitorId.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orgId = body?.org_id || null;
    const { visitorId, message, sessionId, visitorData } = body as {
      visitorId: string;
      message: string;
      sessionId?: string;
      visitorData?: {
        currentPage?: string;
        pagesVisited?: string[];
        timeOnSite?: number;
        source?: string;
      };
    };

    // Validation
    if (!visitorId || !message) {
      return NextResponse.json(
        { ok: false, error: 'visitorId et message sont requis' },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { ok: false, error: 'Message trop long (max 2000 caracteres)' },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'API IA non configuree' },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // --- Rate limiting ---
    // Max 5 sessions per visitorId per day
    const { count: sessionCountToday } = await supabase
      .from('chatbot_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('visitor_id', visitorId)
      .gte('created_at', todayStart.toISOString());

    if (!sessionId && (sessionCountToday ?? 0) >= 5) {
      return NextResponse.json(
        { ok: false, error: 'Limite de sessions atteinte pour aujourd\'hui (5 max). Revenez demain !' },
        { status: 429 }
      );
    }

    // --- Look up or create session ---
    let session: any = null;

    if (sessionId) {
      const { data: existingSession } = await supabase
        .from('chatbot_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('visitor_id', visitorId)
        .single();

      if (existingSession) {
        session = existingSession;

        // Max 20 messages per session
        const currentMessages = Array.isArray(session.messages) ? session.messages : [];
        if (currentMessages.length >= 40) {
          // 40 entries = 20 exchanges (user+assistant)
          return NextResponse.json(
            { ok: false, error: 'Session terminee (20 messages max). Commencez une nouvelle conversation.' },
            { status: 429 }
          );
        }
      }
    }

    if (!session) {
      // Create new session — columns must match chatbot_sessions schema
      const { data: newSession, error: insertError } = await supabase
        .from('chatbot_sessions')
        .insert({
          visitor_id: visitorId,
          messages: [],
          source_page: visitorData?.currentPage || null,
          pages_visited: visitorData?.pagesVisited || [],
          time_on_site: visitorData?.timeOnSite || 0,
          referrer_source: visitorData?.source || null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (insertError || !newSession) {
        console.error('[Chatbot] Error creating session:', insertError?.message, insertError?.details, insertError?.hint);
        return NextResponse.json(
          { ok: false, error: 'Erreur lors de la creation de session' },
          { status: 500 }
        );
      }
      session = newSession;
    }

    // --- Detection ---
    const detectedType = detectBusinessType(message);
    const detectedEmail = detectEmail(message);
    const detectedPhone = detectPhone(message);
    const detectedPlan = detectPlanInterest(message);
    const detectedObjection = detectObjection(message);

    const detected: Record<string, string> = {};
    if (detectedType) detected.type = detectedType;
    if (detectedEmail) detected.email = detectedEmail;
    if (detectedPhone) detected.phone = detectedPhone;
    if (detectedPlan) detected.plan = detectedPlan;
    if (detectedObjection) detected.objection = 'true';

    // --- Upsert prospect if email or phone detected ---
    if (detectedEmail || detectedPhone) {
      const prospectData: Record<string, any> = {
        source: 'chatbot',
        temperature: 'warm',
        updated_at: now,
      };
      if (detectedEmail) prospectData.email = detectedEmail;
      if (detectedPhone) prospectData.phone = detectedPhone;
      if (detectedType) prospectData.type = detectedType;
      if (detectedPlan) prospectData.plan_interest = detectedPlan;
      if (orgId) prospectData.org_id = orgId;

      if (detectedEmail) {
        // Try to find existing prospect by email
        const { data: existingProspect } = await supabase
          .from('crm_prospects')
          .select('id')
          .eq('email', detectedEmail)
          .single();

        if (existingProspect) {
          await supabase
            .from('crm_prospects')
            .update(prospectData)
            .eq('id', existingProspect.id);
        } else {
          prospectData.created_at = now;
          prospectData.score = calculateScore({
            source: 'chatbot',
            email: detectedEmail,
            type: detectedType || '',
            pages_visited: visitorData?.pagesVisited || [],
          });
          prospectData.status = 'identifie';
          prospectData.email_sequence_status = 'not_started';
          prospectData.email_sequence_step = 0;
          await supabase.from('crm_prospects').insert(prospectData);
        }
      } else if (detectedPhone) {
        const { data: existingProspect } = await supabase
          .from('crm_prospects')
          .select('id')
          .eq('phone', detectedPhone)
          .single();

        if (existingProspect) {
          await supabase
            .from('crm_prospects')
            .update(prospectData)
            .eq('id', existingProspect.id);
        } else {
          prospectData.created_at = now;
          prospectData.score = calculateScore({
            source: 'chatbot',
            phone: detectedPhone,
            type: detectedType || '',
            pages_visited: visitorData?.pagesVisited || [],
          });
          prospectData.status = 'identifie';
          prospectData.email_sequence_status = 'not_started';
          prospectData.email_sequence_step = 0;
          await supabase.from('crm_prospects').insert(prospectData);
        }
      }
    }

    // --- Build conversation history ---
    const systemPrompt = getChatbotSystemPrompt();
    const contextualInstructions = buildContextualInstructions(visitorData || {});

    const existingMessages: any[] = Array.isArray(session.messages) ? session.messages : [];
    // Take last 10 messages for context
    const recentMessages = existingMessages.slice(-10);

    // --- Load chatbot learnings from past conversations ---
    let learningsContext = '';
    try {
      const { data: learnings } = await supabase
        .from('agent_logs')
        .select('data')
        .eq('agent', 'chatbot')
        .eq('action', 'learning')
        .order('created_at', { ascending: false })
        .limit(10);
      if (learnings && learnings.length > 0) {
        const tips = learnings.map((l: any) => l.data?.insight).filter(Boolean);
        if (tips.length > 0) {
          learningsContext = '\n\nAPPRENTISSAGES DES CONVERSATIONS PRÉCÉDENTES :\n' + tips.map((t: string) => `- ${t}`).join('\n');
        }
      }
    } catch { /* non-blocking */ }

    // --- Call Gemini 2.5 Flash (with fallback) ---
    console.log('[Chatbot] Calling Gemini for visitor:', visitorId);

    let assistantMessage: string;
    try {
      assistantMessage = await callGeminiChat({
        system: systemPrompt + '\n' + contextualInstructions + learningsContext,
        history: recentMessages.map((msg: any) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        message,
        maxTokens: 2000,
        thinking: true,
      });
      console.log('[Chatbot] Response:', assistantMessage.substring(0, 100));
    } catch (geminiError: any) {
      console.error('[Chatbot] Gemini failed:', geminiError?.message);
      // Fallback: respond with a contextual pre-written message instead of crashing
      const lowMsg = message.toLowerCase();
      if (lowMsg.includes('prix') || lowMsg.includes('combien') || lowMsg.includes('tarif') || lowMsg.includes('coût') || lowMsg.includes('cout')) {
        assistantMessage = "Le plan le plus populaire c'est le Pro a 99\u20AC/mois — 10 agents IA, SEO, chatbot, 800 credits. Et franchement, 1 seul client en plus et c'est rembourse ! Tu veux que je t'explique ce qui est inclus ?";
      } else if (lowMsg.includes('resto') || lowMsg.includes('restaurant') || lowMsg.includes('cuisine')) {
        assistantMessage = "Un resto ! Top 🔥 Avec du bon contenu sur Insta, c'est 5 couverts en plus facile. Et la vidéo TikTok c'est le jackpot. Tu postes déjà sur les réseaux ?";
      } else if (lowMsg.includes('comment') || lowMsg.includes('marche') || lowMsg.includes('fonctionne')) {
        assistantMessage = "C'est simple : tu décris ton business, on génère des visuels et vidéos pro en 3 min. Instagram, TikTok, LinkedIn — tout est automatisé. Tu veux voir un exemple pour ton secteur ?";
      } else if (lowMsg.includes('bonjour') || lowMsg.includes('salut') || lowMsg.includes('hello') || lowMsg.includes('hey') || lowMsg.includes('coucou')) {
        assistantMessage = "Salut ! 👋 Bienvenue. Tu cherches à booster ta présence sur les réseaux sociaux ? Dis-moi ton secteur et je te montre ce qu'on peut faire pour toi.";
      } else if (lowMsg.includes('chatgpt') || lowMsg.includes('canva') || lowMsg.includes('ia') || lowMsg.includes('gratuit')) {
        assistantMessage = "ChatGPT c'est top pour plein de trucs. Mais pour poster 3x/semaine, ça prend 30 min par post. Avec nous c'est 3 min. Et surtout : ChatGPT fait PAS de vidéo. Nous oui 🎬 Tu postes souvent en ce moment ?";
      } else {
        assistantMessage = "Bonne question ! KeiroAI c'est l'outil qui crée ton contenu pro en 3 min — images, vidéos, textes, tout. C'est quoi ton activité ? Je te montre un exemple concret 😊";
      }
    }

    // --- Append messages to session ---
    const updatedMessages = [
      ...existingMessages,
      { role: 'user', content: message, at: now, detected },
      { role: 'assistant', content: assistantMessage, at: now },
    ];

    // --- Save session + log (non-blocking, never crash the response) ---
    try {
      await supabase
        .from('chatbot_sessions')
        .update({
          messages: updatedMessages,
          source_page: visitorData?.currentPage || session.source_page,
          pages_visited: visitorData?.pagesVisited || session.pages_visited,
          time_on_site: visitorData?.timeOnSite || session.time_on_site,
          updated_at: now,
        })
        .eq('id', session.id);

      let action = 'conversation';
      if (detectedEmail) action = 'lead_captured_email';
      else if (detectedPhone) action = 'lead_captured_phone';
      else if (detectedPlan) action = 'plan_interest_detected';
      else if (detectedObjection) action = 'objection_detected';
      else if (detectedType) action = 'business_type_detected';

      await supabase.from('agent_logs').insert({
        agent: 'chatbot',
        action,
        data: {
          visitor_id: visitorId,
          session_id: session.id,
          detected,
          message_count: updatedMessages.length,
          tokens_used: 0,
        },
        created_at: now,
        ...(orgId ? { org_id: orgId } : {}),
      });

      // --- Extract learnings every 6 messages (3 exchanges) ---
      if (updatedMessages.length === 6 || updatedMessages.length === 12) {
        try {
          const convoSummary = updatedMessages.map((m: any) => `${m.role}: ${m.content}`).join('\n');
          const learningResponse = await callGeminiChat({
            system: `Tu analyses des conversations de chatbot commercial. Extrais UN apprentissage clé en 1 phrase.
Exemples : "Les restaurateurs répondent mieux quand on parle de couverts en plus", "Quand le prospect dit 'je réfléchis', proposer le Sprint à 4.99€ convertit mieux", "Les coachs préfèrent LinkedIn à Instagram".
Réponds UNIQUEMENT avec l'apprentissage, rien d'autre.`,
            history: [],
            message: convoSummary,
            maxTokens: 100,
          });
          if (learningResponse && learningResponse.length > 10 && learningResponse.length < 200) {
            await supabase.from('agent_logs').insert({
              agent: 'chatbot',
              action: 'learning',
              data: { insight: learningResponse.trim(), session_id: session.id, message_count: updatedMessages.length },
              created_at: now,
              ...(orgId ? { org_id: orgId } : {}),
            });
          }
        } catch { /* non-blocking */ }
      }
    } catch (dbError: any) {
      console.error('[Chatbot] DB save error (non-fatal):', dbError?.message);
    }

    return NextResponse.json({
      ok: true,
      message: assistantMessage,
      sessionId: session.id,
      detected: Object.keys(detected).length > 0 ? detected : undefined,
    });
  } catch (error: any) {
    console.error('[Chatbot] Error:', error?.message, error?.stack?.slice(0, 500));
    console.error('[Chatbot] Env check: GEMINI_API_KEY=', !!process.env.GEMINI_API_KEY, 'SUPABASE_URL=', !!process.env.NEXT_PUBLIC_SUPABASE_URL, 'SUPABASE_KEY=', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
