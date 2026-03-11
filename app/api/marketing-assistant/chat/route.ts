import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse, isAIConfigured, AI_API_KEY_NAME } from '@/lib/ai-client';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';
import { checkCredits, deductCredits, isAdmin as checkIsAdmin } from '@/lib/credits/server';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Limites par défaut pour contrôler les coûts
const DEFAULT_MONTHLY_MESSAGE_LIMIT = 50; // 50 messages/mois
const DEFAULT_MONTHLY_TOKEN_LIMIT = 100000; // 100k tokens/mois

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, blocked: true, reason: 'requires_account', cta: true }, { status: 403 });
    }

    // --- Vérification crédits ---
    const isAdminUser = await checkIsAdmin(user.id);
    if (!isAdminUser) {
      const check = await checkCredits(user.id, 'marketing_chat');
      if (!check.allowed) {
        return NextResponse.json(
          { ok: false, error: 'Crédits insuffisants', insufficientCredits: true, cost: check.cost, balance: check.balance },
          { status: 402 }
        );
      }
    }

    if (!isAIConfigured()) {
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
      .select('business_type, business_description, full_name, plan')
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
        .limit(10);

      conversationHistory = messages || [];
    }

    // 2b. Récupérer les sujets des conversations passées pour personnalisation
    let pastContext = '';
    const { data: pastConversations } = await supabase
      .from('assistant_conversations')
      .select('title, business_context, message_count')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false })
      .limit(5);

    if (pastConversations && pastConversations.length > 0) {
      const topics = pastConversations.map((c: any) => c.title).filter(Boolean).join(', ');
      pastContext = `
Sujets de conversations précédentes avec cet utilisateur: ${topics}
Utilise ce contexte pour personnaliser tes réponses et éviter de répéter des conseils déjà donnés. Fais référence aux conversations précédentes quand c'est pertinent.`;
    }

    // 3. Récupérer les tendances du jour pour enrichir le contexte
    let trendsContext = '';
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const trendsRes = await fetch(`${baseUrl}/api/trends`, { signal: AbortSignal.timeout(5000) });
      const trendsJson = await trendsRes.json();
      if (trendsJson.ok && trendsJson.data) {
        const gt = trendsJson.data.googleTrends?.slice(0, 10).map((t: any) => t.title).join(', ');
        const tt = trendsJson.data.tiktokHashtags?.slice(0, 10).map((t: any) => '#' + t.hashtag).join(', ');
        trendsContext = `

Tendances du jour en France (données réelles) :
- Recherches populaires Google: ${gt || 'non disponible'}
- Hashtags TikTok populaires: ${tt || 'non disponible'}
Utilise ces tendances pour proposer des idées de contenu pertinentes et surfant sur l'actualité quand c'est adapté au business de l'utilisateur.`;
      }
    } catch { /* silencieux si timeout */ }

    // 4. System prompt contextuel enrichi avec profil, historique et tendances
    const businessType = profile?.business_description || profile?.business_type || 'entreprise';
    const userName = profile?.full_name || '';
    const userPlan = profile?.plan || 'free';
    const systemPrompt = `Tu es un expert marketing réseaux sociaux (Instagram, TikTok, LinkedIn, Facebook).

${userName ? `Utilisateur: ${userName}` : ''}
Contexte business: ${businessType}
Plan actuel: ${userPlan}

Rôle: Conseils ACTIONNABLES et PERSONNALISÉS pour les réseaux sociaux (formats, hashtags, timing, engagement, tendances).

Tu connais cet utilisateur. Tu te souviens des conversations précédentes. Tu adaptes tes réponses en fonction de son business, ses objectifs, et ce que tu as appris de lui. Tu ne répètes pas les mêmes conseils de base à chaque fois — tu fais progresser la réflexion.
${pastContext}

Quand l'utilisateur veut créer un visuel ou une vidéo, demande-lui TOUJOURS :
- Sur quelle plateforme il compte publier (TikTok, Instagram, les deux ?)
- Adapte tes conseils au format de la plateforme (TikTok = vertical 9:16, Instagram = carré 1:1 ou portrait 4:5)
- Rappelle-lui de sélectionner la bonne plateforme dans la page Générer pour obtenir le bon format
${trendsContext}
Style:
- Concis (150-300 mots max)
- Bullet points
- Exemples concrets adaptés à son secteur
- CTA clair
- Français
- Tutoie l'utilisateur`;

    // 4. Appel Claude avec historique
    const claudeMessages = [
      ...conversationHistory.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ];

    console.log('[MarketingAssistant] Calling Claude Haiku...');

    const response = await generateAIResponse({
      model: 'claude-3-haiku-20240307',
      max_tokens: 800,
      system: systemPrompt,
      temperature: 0.7,
      messages: claudeMessages,
    });

    const assistantMessage = response.text;
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
        model: 'gemini-2.0-flash',
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

    // --- Déduction crédits après succès ---
    let newBalance: number | undefined;
    if (!isAdminUser) {
      const result = await deductCredits(user.id, 'marketing_chat', 'Message assistant marketing');
      newBalance = result.newBalance;
    }

    return NextResponse.json({
      ok: true,
      message: assistantMessage,
      conversationId: finalConversationId,
      tokensUsed,
      newBalance,
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
