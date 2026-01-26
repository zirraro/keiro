import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Limites par défaut pour contrôler les coûts
const DEFAULT_MONTHLY_MESSAGE_LIMIT = 50; // 50 messages/mois
const DEFAULT_MONTHLY_TOKEN_LIMIT = 100000; // 100k tokens/mois

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'API IA non configurée' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { conversationId, message } = body;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Vérifier les limites d'utilisation
    const { data: usageLimits } = await supabase
      .from('assistant_usage_limits')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Créer les limites si elles n'existent pas
    if (!usageLimits) {
      await supabase.from('assistant_usage_limits').insert({
        user_id: user.id,
        messages_this_month: 0,
        tokens_this_month: 0,
        monthly_message_limit: DEFAULT_MONTHLY_MESSAGE_LIMIT,
        monthly_token_limit: DEFAULT_MONTHLY_TOKEN_LIMIT,
      });
    }

    // Reset si nouveau mois
    const now = new Date();
    const monthStart = usageLimits?.month_start ? new Date(usageLimits.month_start) : new Date();
    if (now.getMonth() !== monthStart.getMonth() || now.getFullYear() !== monthStart.getFullYear()) {
      await supabase
        .from('assistant_usage_limits')
        .update({
          messages_this_month: 0,
          tokens_this_month: 0,
          month_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
          last_reset_at: now.toISOString(),
        })
        .eq('user_id', user.id);
    }

    // Vérifier si limite atteinte
    const currentMessages = usageLimits?.messages_this_month || 0;
    const messageLimit = usageLimits?.monthly_message_limit || DEFAULT_MONTHLY_MESSAGE_LIMIT;

    if (currentMessages >= messageLimit) {
      return NextResponse.json(
        {
          ok: false,
          error: `Limite mensuelle atteinte (${messageLimit} messages/mois). Revenez le mois prochain ou passez à un plan supérieur.`,
          limitReached: true,
          currentUsage: currentMessages,
          limit: messageLimit,
        },
        { status: 429 }
      );
    }

    // 1. Récupérer profil utilisateur pour contexte
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_type, business_description')
      .eq('id', user.id)
      .single();

    // 2. Récupérer historique de conversation si existe
    let conversationHistory: any[] = [];
    if (conversationId) {
      const { data: messages } = await supabase
        .from('assistant_messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(10); // Réduit de 20 à 10 pour économiser tokens

      conversationHistory = messages || [];
    }

    // 3. System prompt contextuel (optimisé pour être plus court)
    const businessType = profile?.business_description || profile?.business_type || 'entreprise';
    const systemPrompt = `Tu es un expert marketing Instagram.

Contexte: ${businessType}

Rôle: Conseils ACTIONNABLES pour Instagram (formats, hashtags, timing, engagement).

Style:
- Concis (150-300 mots max)
- Bullet points
- Exemples concrets
- CTA clair
- Français`;

    // 4. Appel Claude avec historique
    const claudeMessages = [
      ...conversationHistory.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ];

    console.log('[MarketingAssistant] Calling Claude Haiku...');

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // Haiku stable et disponible partout
      max_tokens: 800, // Réduit de 1500 pour économiser
      system: systemPrompt,
      temperature: 0.7,
      messages: claudeMessages,
    });

    const assistantMessage = response.content[0].type === 'text' ? response.content[0].text : '';
    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

    console.log('[MarketingAssistant] Response received:', assistantMessage.substring(0, 100));
    console.log('[MarketingAssistant] Tokens used:', tokensUsed);

    // 5. Sauvegarder en BDD
    let finalConversationId = conversationId;

    if (!conversationId) {
      // Créer nouvelle conversation
      const { data: newConversation } = await supabase
        .from('assistant_conversations')
        .insert({
          user_id: user.id,
          title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
          business_context: businessType,
          last_message_at: new Date().toISOString(),
          message_count: 2,
        })
        .select()
        .single();

      finalConversationId = newConversation?.id;
    } else {
      // Mettre à jour conversation existante
      await supabase
        .from('assistant_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          message_count: conversationHistory.length + 2,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
    }

    // Sauvegarder les 2 messages
    await supabase.from('assistant_messages').insert([
      {
        conversation_id: finalConversationId,
        user_id: user.id,
        role: 'user',
        content: message,
      },
      {
        conversation_id: finalConversationId,
        user_id: user.id,
        role: 'assistant',
        content: assistantMessage,
        model: 'claude-3-haiku-20240307',
        tokens_used: tokensUsed,
      },
    ]);

    // Incrémenter les compteurs d'utilisation
    await supabase
      .from('assistant_usage_limits')
      .update({
        messages_this_month: currentMessages + 1,
        tokens_this_month: (usageLimits?.tokens_this_month || 0) + tokensUsed,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    console.log('[MarketingAssistant] Conversation saved successfully');

    return NextResponse.json({
      ok: true,
      message: assistantMessage,
      conversationId: finalConversationId,
      tokensUsed,
      usage: {
        messagesUsed: currentMessages + 1,
        messagesLimit: messageLimit,
        remaining: messageLimit - currentMessages - 1,
      },
    });

  } catch (error: any) {
    console.error('[MarketingAssistant] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
