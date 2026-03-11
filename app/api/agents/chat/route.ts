import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { generateAIResponse, isAIConfigured, AI_API_KEY_NAME } from '@/lib/ai-client';
import { getAgentContext } from '@/lib/agents/agent-memory';

// Agent prompt imports
import { getCommercialSystemPrompt } from '@/lib/agents/commercial-prompt';
import { getDMSystemPrompt } from '@/lib/agents/dm-prompt';
import { getSeoWriterPrompt } from '@/lib/agents/seo-prompt';
import { getContentSystemPrompt } from '@/lib/agents/content-prompt';
import { getOnboardingSystemPrompt } from '@/lib/agents/onboarding-prompt';
import { getRetentionSystemPrompt } from '@/lib/agents/retention-prompt';
import { getChatbotSystemPrompt } from '@/lib/agents/chatbot-prompt';
import { getTikTokCommentPrompt } from '@/lib/agents/tiktok-comment-prompt';

export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Agent definitions with their prompts and capabilities
const AGENT_CONFIG: Record<string, {
  label: string;
  icon: string;
  color: string;
  getPrompt: () => string;
  chatAddendum: string;
}> = {
  email: {
    label: 'Email Agent',
    icon: '📧',
    color: 'blue',
    getPrompt: () => `Tu es l'agent Email de KeiroAI. Tu geres les campagnes email cold et warm. Tu connais les sequences, les templates, le timing optimal par type de business. Tu analyses les taux d'ouverture, de clic, et de reponse pour optimiser en continu.`,
    chatAddendum: `MODE CONVERSATION DIRECTE:
Tu discutes avec le fondateur sur la strategie email. Tu peux:
- Analyser les performances des campagnes
- Proposer des ameliorations de templates/sujets
- Suggerer des segments a cibler
- Expliquer les A/B tests en cours
- Proposer de lancer une campagne specifique

Quand tu proposes une action concrete, formule-la clairement avec [ACTION: description].
Reponds en francais, sois direct et actionnable.`,
  },
  commercial: {
    label: 'Commercial Agent',
    icon: '🔍',
    color: 'green',
    getPrompt: getCommercialSystemPrompt,
    chatAddendum: `MODE CONVERSATION DIRECTE:
Tu discutes avec le fondateur sur la qualite des prospects. Tu peux:
- Analyser la qualite du pipeline
- Expliquer les criteres d'enrichissement
- Proposer de nouvelles zones de prospection
- Donner des stats sur les types de business
- Suggerer des filtres pour ameliorer la qualite

Quand tu proposes une action concrete, formule-la clairement avec [ACTION: description].
Reponds en francais, sois direct et actionnable.`,
  },
  dm_instagram: {
    label: 'DM Instagram Agent',
    icon: '📱',
    color: 'pink',
    getPrompt: getDMSystemPrompt,
    chatAddendum: `MODE CONVERSATION DIRECTE:
Tu discutes avec le fondateur sur la strategie DM Instagram. Tu peux:
- Analyser les taux de reponse des DMs
- Proposer de nouveaux messages/sequences
- Suggerer des cibles pertinentes
- Expliquer ta strategie de personnalisation
- Proposer de preparer des DMs pour des segments specifiques

Quand tu proposes une action concrete, formule-la clairement avec [ACTION: description].
Reponds en francais, sois direct et actionnable.`,
  },
  tiktok_comments: {
    label: 'TikTok Agent',
    icon: '🎵',
    color: 'purple',
    getPrompt: getTikTokCommentPrompt,
    chatAddendum: `MODE CONVERSATION DIRECTE:
Tu discutes avec le fondateur sur la strategie TikTok. Tu peux:
- Proposer des commentaires pour des videos specifiques
- Analyser l'engagement des commentaires precedents
- Suggerer des approches de prospection TikTok
- Adapter le ton selon le type de contenu

Quand tu proposes une action concrete, formule-la clairement avec [ACTION: description].
Reponds en francais, sois direct et actionnable.`,
  },
  seo: {
    label: 'SEO Agent',
    icon: '📝',
    color: 'orange',
    getPrompt: () => getSeoWriterPrompt(),
    chatAddendum: `MODE CONVERSATION DIRECTE:
Tu discutes avec le fondateur sur la strategie SEO. Tu peux:
- Proposer des sujets d'articles optimises
- Analyser les mots-cles cibles
- Suggerer un calendrier editorial
- Expliquer les strategies de contenu SEO
- Proposer de generer un article sur un sujet specifique

Quand tu proposes une action concrete, formule-la clairement avec [ACTION: description].
Reponds en francais, sois direct et actionnable.`,
  },
  content: {
    label: 'Content Agent',
    icon: '🎨',
    color: 'indigo',
    getPrompt: getContentSystemPrompt,
    chatAddendum: `MODE CONVERSATION DIRECTE:
Tu discutes avec le fondateur sur la strategie de contenu social media. Tu peux:
- Proposer des idees de posts Instagram/TikTok/LinkedIn
- Analyser les performances du contenu precedent
- Suggerer un planning de publication
- Proposer des formats engageants
- Generer des captions et des descriptions visuelles

Quand tu proposes une action concrete, formule-la clairement avec [ACTION: description].
Reponds en francais, sois direct et actionnable.`,
  },
  onboarding: {
    label: 'Onboarding Agent',
    icon: '🚀',
    color: 'emerald',
    getPrompt: getOnboardingSystemPrompt,
    chatAddendum: `MODE CONVERSATION DIRECTE:
Tu discutes avec le fondateur sur l'onboarding des nouveaux clients. Tu peux:
- Analyser les taux d'activation
- Proposer des ameliorations de la sequence de bienvenue
- Suggerer des messages personnalises
- Identifier les points de blocage dans le parcours
- Proposer des strategies pour convertir Sprint→Pro

Quand tu proposes une action concrete, formule-la clairement avec [ACTION: description].
Reponds en francais, sois direct et actionnable.`,
  },
  retention: {
    label: 'Retention Agent',
    icon: '🛡️',
    color: 'red',
    getPrompt: getRetentionSystemPrompt,
    chatAddendum: `MODE CONVERSATION DIRECTE:
Tu discutes avec le fondateur sur la retention et l'anti-churn. Tu peux:
- Analyser les health scores des clients
- Identifier les clients a risque
- Proposer des actions de reactivation
- Suggerer des ameliorations du produit
- Calculer le MRR a risque

Quand tu proposes une action concrete, formule-la clairement avec [ACTION: description].
Reponds en francais, sois direct et actionnable.`,
  },
  chatbot: {
    label: 'Chatbot Agent',
    icon: '💬',
    color: 'cyan',
    getPrompt: () => getChatbotSystemPrompt(),
    chatAddendum: `MODE CONVERSATION DIRECTE:
Tu discutes avec le fondateur sur la strategie du chatbot visiteurs. Tu peux:
- Analyser les taux de conversion visiteur→lead
- Proposer des ameliorations du script de qualification
- Suggerer des reponses aux objections frequentes
- Optimiser le parcours de qualification
- Adapter le ton selon le type de visiteur

Quand tu proposes une action concrete, formule-la clairement avec [ACTION: description].
Reponds en francais, sois direct et actionnable.`,
  },
};

export async function GET() {
  // Return list of available agents for the UI
  const agents = Object.entries(AGENT_CONFIG).map(([id, config]) => ({
    id,
    label: config.label,
    icon: config.icon,
    color: config.color,
  }));
  return NextResponse.json({ ok: true, agents });
}

export async function POST(request: NextRequest) {
  // Auth check
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Auth failed' }, { status: 401 });
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: `${AI_API_KEY_NAME} non configuree` }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { agent: agentId, message, history } = body;

  if (!agentId || !message) {
    return NextResponse.json({ ok: false, error: 'agent and message required' }, { status: 400 });
  }

  const agentConfig = AGENT_CONFIG[agentId];
  if (!agentConfig) {
    return NextResponse.json({ ok: false, error: `Unknown agent: ${agentId}` }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Load agent context (directive + learnings)
    let agentContextText = '';
    try {
      agentContextText = await getAgentContext(agentId);
    } catch {}

    // Load recent agent activity for context
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentLogs } = await supabase
      .from('agent_logs')
      .select('action, data, status, created_at')
      .eq('agent', agentId)
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(10);

    let activityContext = '';
    if (recentLogs && recentLogs.length > 0) {
      const logLines = recentLogs.map((l: any) => {
        const time = new Date(l.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const summary = l.data?.message || l.data?.phase || l.action;
        return `[${time}] ${summary} (${l.status})`;
      });
      activityContext = `\n\nACTIVITE RECENTE (24h):\n${logLines.join('\n')}`;
    }

    // Load chat history for this agent
    const { data: pastChats } = await supabase
      .from('agent_logs')
      .select('data, created_at')
      .eq('agent', agentId)
      .eq('action', 'direct_chat')
      .order('created_at', { ascending: false })
      .limit(5);

    let chatMemory = '';
    if (pastChats && pastChats.length > 0) {
      const prevChats = pastChats
        .filter((c: any) => c.data?.user_message)
        .map((c: any) => {
          const date = new Date(c.created_at).toLocaleDateString('fr-FR');
          return `[${date}] Fondateur: "${(c.data.user_message as string).substring(0, 80)}"`;
        });
      if (prevChats.length > 0) {
        chatMemory = `\n\nHISTORIQUE CONVERSATIONS:\n${prevChats.join('\n')}`;
      }
    }

    // Build system prompt
    const basePrompt = agentConfig.getPrompt();
    const systemPrompt = `${basePrompt}

${agentConfig.chatAddendum}
${agentContextText ? `\nCONTEXTE STRATEGIQUE:\n${agentContextText}` : ''}
${activityContext}
${chatMemory}

IMPORTANT: Tu es en mode conversation directe avec Oussama, le fondateur. Reponds a sa question/demande de maniere directe et actionnable. Si tu proposes une action, utilise [ACTION: description] pour qu'elle puisse etre executee.

AUTO-AMELIORATION:
Quand tu identifies une opportunite d'amelioration ou un insight utile, ajoute un tag [LEARNING: description de l'insight] dans ta reponse. Exemples:
- [LEARNING: Les emails avec prenom dans le sujet ont +15% d'ouverture]
- [LEARNING: Les restaurants repondent mieux le mardi apres-midi]
Ces learnings sont enregistres et utilises par le CEO pour ameliorer la strategie globale.`;

    // Build messages
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (history && Array.isArray(history)) {
      messages.push(...history.slice(-10));
    }
    messages.push({ role: 'user', content: message });

    const response = await generateAIResponse({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: systemPrompt,
      messages,
    });

    const reply = response.text;

    // Log the chat
    await supabase.from('agent_logs').insert({
      agent: agentId,
      action: 'direct_chat',
      data: {
        user_message: message,
        reply: reply.substring(0, 500),
      },
      status: 'success',
      created_at: new Date().toISOString(),
    });

    // Extract actions and learnings from agent response
    const nowISO = new Date().toISOString();

    // Capture [ACTION:...] tags
    if (reply.includes('[ACTION:')) {
      const actions = reply.match(/\[ACTION:([^\]]+)\]/g) || [];
      for (const action of actions) {
        const actionText = action.replace(/^\[ACTION:/, '').replace(/\]$/, '').trim();
        await supabase.from('agent_logs').insert({
          agent: agentId,
          action: 'self_suggestion',
          data: {
            suggestion: actionText,
            context: `From direct chat: "${message.substring(0, 100)}"`,
          },
          status: 'pending',
          created_at: nowISO,
        });
      }
    }

    // Capture [LEARNING:...] tags for self-improvement
    if (reply.includes('[LEARNING:')) {
      const { reportLearning } = await import('@/lib/agents/agent-memory');
      const learnings = reply.match(/\[LEARNING:([^\]]+)\]/g) || [];
      for (const learning of learnings) {
        const insight = learning.replace(/^\[LEARNING:/, '').replace(/\]$/, '').trim();
        await reportLearning(agentId, {
          insight,
          metric_name: 'chat_insight',
          recommendation: insight,
        });
      }
    }

    return NextResponse.json({ ok: true, reply });

  } catch (error: any) {
    console.error(`[AgentChat:${agentId}] Error:`, error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
