import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
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

export const runtime = 'edge';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * POST /api/chatbot/message
 * Public endpoint for anonymous website visitors to chat with the KeiroAI chatbot.
 * No auth required. Rate limited by visitorId.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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

    if (!process.env.ANTHROPIC_API_KEY) {
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
      // Create new session
      const { data: newSession, error: insertError } = await supabase
        .from('chatbot_sessions')
        .insert({
          visitor_id: visitorId,
          messages: [],
          visitor_data: visitorData || {},
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (insertError || !newSession) {
        console.error('[Chatbot] Error creating session:', insertError);
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
          prospectData.score = 20; // Warm lead starting score
          prospectData.status = 'nouveau';
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
          prospectData.score = 20;
          prospectData.status = 'nouveau';
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

    const conversationHistory = [
      ...recentMessages.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // --- Call Claude Haiku ---
    console.log('[Chatbot] Calling Claude Haiku for visitor:', visitorId);

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 300,
      system: systemPrompt + '\n' + contextualInstructions,
      messages: conversationHistory,
    });

    const assistantMessage =
      response.content[0].type === 'text' ? response.content[0].text : '';

    console.log('[Chatbot] Response:', assistantMessage.substring(0, 100));

    // --- Append messages to session ---
    const updatedMessages = [
      ...existingMessages,
      { role: 'user', content: message, at: now, detected },
      { role: 'assistant', content: assistantMessage, at: now },
    ];

    await supabase
      .from('chatbot_sessions')
      .update({
        messages: updatedMessages,
        visitor_data: visitorData || session.visitor_data,
        updated_at: now,
      })
      .eq('id', session.id);

    // --- Log to agent_logs ---
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
        tokens_used: response.usage.input_tokens + response.usage.output_tokens,
      },
      created_at: now,
    });

    return NextResponse.json({
      ok: true,
      message: assistantMessage,
      sessionId: session.id,
      detected: Object.keys(detected).length > 0 ? detected : undefined,
    });
  } catch (error: any) {
    console.error('[Chatbot] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
