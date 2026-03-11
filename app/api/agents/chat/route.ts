import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { callGeminiChat } from '@/lib/agents/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Agent definitions with their system prompts for direct chat */
const AGENT_CHAT_PROMPTS: Record<string, { name: string; systemPrompt: string }> = {
  commercial: {
    name: 'Agent Commercial',
    systemPrompt: `Tu es l'agent commercial de KeiroAI. Tu gères la prospection, la qualification et l'enrichissement des prospects dans le CRM.

TES CAPACITÉS :
- Scanner de nouveaux prospects via Google Maps
- Enrichir et qualifier les prospects existants
- Donner le GO/NO-GO pour le contact
- Analyser la qualité du CRM

Quand le fondateur te demande une action, inclus une section ## ORDRES à exécuter.
Ordres possibles :
- [Commercial] Enrichir les prospects
- [Google Maps] Scanner de nouvelles zones
- Réponds en français, sois direct et actionnable.`,
  },
  email: {
    name: 'Agent Email',
    systemPrompt: `Tu es l'agent email de KeiroAI. Tu gères les séquences d'emails cold et warm pour convertir les prospects.

TES CAPACITÉS :
- Envoyer des campagnes cold email (séquence de 3 emails)
- Suivre les prospects chauds (warm follow-up)
- Vérifier la qualité des données avant envoi
- Analyser les taux d'ouverture et de conversion

Quand le fondateur te demande une action, inclus une section ## ORDRES à exécuter.
Ordres possibles :
- [Email] Lancer campagne cold
- [Email] Lancer warm follow-up
- [Email] Pause séquences
- Réponds en français, sois direct et actionnable.`,
  },
  content: {
    name: 'Agent Contenu',
    systemPrompt: `Tu es l'agent contenu de KeiroAI. Tu crées et publies du contenu sur les réseaux sociaux (Instagram, TikTok, LinkedIn) en utilisant KeiroAI lui-même comme preuve produit.

TES CAPACITÉS :
- Générer le plan de contenu hebdomadaire
- Créer des posts (carrousel, reel, story, vidéo, texte)
- Générer les visuels via Seedream IA
- Auto-publier le contenu

Quand le fondateur te demande une action, inclus une section ## ORDRES à exécuter.
Ordres possibles :
- [Content] Générer plan hebdomadaire
- [Content] Créer post du jour
- Réponds en français, sois direct et actionnable.`,
  },
  seo: {
    name: 'Agent SEO',
    systemPrompt: `Tu es l'agent SEO de KeiroAI. Tu rédiges des articles de blog optimisés SEO et gères le calendrier éditorial.

TES CAPACITÉS :
- Planifier le calendrier éditorial SEO
- Rédiger des articles optimisés pour les mots-clés cibles
- Suivre le ranking et les performances

Quand le fondateur te demande une action, inclus une section ## ORDRES à exécuter.
Ordres possibles :
- [SEO] Rédiger un article
- [SEO] Planifier la semaine
- Réponds en français, sois direct et actionnable.`,
  },
  dm_instagram: {
    name: 'Agent DM Instagram',
    systemPrompt: `Tu es l'agent DM Instagram de KeiroAI. Tu prépares et personnalises les messages directs Instagram pour la prospection.

TES CAPACITÉS :
- Préparer les DMs personnalisés du jour
- Adapter le ton selon le type de commerce
- Gérer les follow-ups

Quand le fondateur te demande une action, inclus une section ## ORDRES à exécuter.
Ordres possibles :
- [DM Instagram] Préparer les DMs
- Réponds en français, sois direct et actionnable.`,
  },
  tiktok_comments: {
    name: 'Agent TikTok',
    systemPrompt: `Tu es l'agent TikTok de KeiroAI. Tu prépares des commentaires TikTok stratégiques pour générer de la visibilité auprès des prospects.

TES CAPACITÉS :
- Préparer les commentaires TikTok du jour
- Cibler les prospects avec une présence TikTok
- Adapter le message au contenu du prospect

Quand le fondateur te demande une action, inclus une section ## ORDRES à exécuter.
Ordres possibles :
- [TikTok Comments] Préparer les commentaires
- Réponds en français, sois direct et actionnable.`,
  },
  onboarding: {
    name: 'Agent Onboarding',
    systemPrompt: `Tu es l'agent onboarding de KeiroAI. Tu gères l'accueil et l'accompagnement des nouveaux utilisateurs.

TES CAPACITÉS :
- Envoyer les séquences d'onboarding
- Suivre l'activation des utilisateurs
- Alerter quand un utilisateur premium est inactif

Quand le fondateur te demande une action, inclus une section ## ORDRES à exécuter.
Ordres possibles :
- [Onboarding] Lancer la séquence
- Réponds en français, sois direct et actionnable.`,
  },
  retention: {
    name: 'Agent Rétention',
    systemPrompt: `Tu es l'agent rétention de KeiroAI. Tu gères la fidélisation des clients existants et préviens le churn.

TES CAPACITÉS :
- Détecter les utilisateurs à risque de churn
- Envoyer des messages de rétention personnalisés
- Célébrer les succès des utilisateurs
- Proposer des upgrades au bon moment

Quand le fondateur te demande une action, inclus une section ## ORDRES à exécuter.
Ordres possibles :
- [Retention] Vérifier les utilisateurs à risque
- Réponds en français, sois direct et actionnable.`,
  },
};

/** Agent ID to endpoint mapping for order execution */
const AGENT_ENDPOINTS: Record<string, { path: string; method: string }> = {
  commercial: { path: '/api/agents/commercial', method: 'GET' },
  email: { path: '/api/agents/email/daily', method: 'GET' },
  content: { path: '/api/agents/content', method: 'GET' },
  seo: { path: '/api/agents/seo', method: 'GET' },
  dm_instagram: { path: '/api/agents/dm-instagram?slot=morning', method: 'POST' },
  tiktok_comments: { path: '/api/agents/tiktok-comments', method: 'GET' },
  onboarding: { path: '/api/agents/onboarding', method: 'GET' },
  retention: { path: '/api/agents/retention', method: 'GET' },
  gmaps: { path: '/api/agents/gmaps', method: 'POST' },
};

/**
 * POST /api/agents/chat
 * Direct conversation with any agent.
 * Body: { agent: string, message: string, history: Array<{role, content}> }
 */
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

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configurée' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { agent, message, history = [] } = body;

  if (!agent || !message) {
    return NextResponse.json({ ok: false, error: 'agent and message required' }, { status: 400 });
  }

  const agentConfig = AGENT_CHAT_PROMPTS[agent];
  if (!agentConfig) {
    return NextResponse.json({ ok: false, error: `Unknown agent: ${agent}` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();

  try {
    // Load agent's recent activity for context
    const { data: recentLogs } = await supabase
      .from('agent_logs')
      .select('action, data, created_at')
      .eq('agent', agent)
      .order('created_at', { ascending: false })
      .limit(5);

    // Load agent memory (learnings)
    const { data: memories } = await supabase
      .from('agent_logs')
      .select('data')
      .eq('agent', agent)
      .eq('action', 'memory')
      .order('created_at', { ascending: false })
      .limit(10);

    let activityContext = '';
    if (recentLogs && recentLogs.length > 0) {
      activityContext = '\n\nACTIVITÉ RÉCENTE :\n' + recentLogs.map((l: any) => {
        const time = new Date(l.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `[${time}] ${l.action}: ${JSON.stringify(l.data).substring(0, 150)}`;
      }).join('\n');
    }

    let memoryContext = '';
    if (memories && memories.length > 0) {
      const learnings = memories.map((m: any) => m.data?.learning).filter(Boolean);
      if (learnings.length > 0) {
        memoryContext = '\n\nMÉMOIRE (ce que tu as appris) :\n' + learnings.join('\n');
      }
    }

    // CRM stats for context
    const { count: totalProspects } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true });
    const { count: hotProspects } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'hot');

    const statsContext = `\n\nCRM : ${totalProspects ?? 0} prospects total, ${hotProspects ?? 0} chauds.`;

    const systemPrompt = agentConfig.systemPrompt + activityContext + memoryContext + statsContext;

    const reply = await callGeminiChat({
      system: systemPrompt,
      history: history.map((h: any) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      message,
      maxTokens: 2000,
    });

    // Log conversation
    await supabase.from('agent_logs').insert({
      agent,
      action: 'chat',
      data: { message, reply, history_length: history.length },
      created_at: now.toISOString(),
    });

    // Extract and execute orders from agent reply
    let ordersExecuted = 0;
    const orderMatch = reply.match(/##\s*ORDRES[\s\S]*?(?=##|$)/i);
    if (orderMatch) {
      const orderText = orderMatch[0];
      const orderLines = orderText.split('\n').filter((l: string) => l.match(/\[.+\]/));

      const VALID_AGENTS = Object.keys(AGENT_ENDPOINTS);
      const agentMapping: Record<string, string> = {
        'commercial': 'commercial', 'enrichir': 'commercial',
        'email': 'email', 'campagne': 'email',
        'content': 'content', 'contenu': 'content',
        'seo': 'seo',
        'dm instagram': 'dm_instagram', 'dm': 'dm_instagram', 'instagram': 'dm_instagram',
        'tiktok': 'tiktok_comments', 'tiktok comments': 'tiktok_comments',
        'onboarding': 'onboarding',
        'retention': 'retention', 'rétention': 'retention',
        'google maps': 'gmaps', 'gmaps': 'gmaps',
      };

      for (const line of orderLines) {
        const bracketMatch = line.match(/\[([^\]]+)\]/);
        if (!bracketMatch) continue;

        const agentName = bracketMatch[1].toLowerCase().trim();
        const targetAgent = agentMapping[agentName];
        if (!targetAgent) continue;

        const endpoint = AGENT_ENDPOINTS[targetAgent];
        if (!endpoint) continue;

        // Insert order
        await supabase.from('agent_orders').insert({
          from_agent: agent,
          to_agent: targetAgent,
          order_type: line.replace(/\[.*?\]/, '').trim().substring(0, 100),
          priority: 'haute',
          payload: { description: line.trim(), source: 'agent_chat' },
          status: 'pending',
          created_at: now.toISOString(),
        });

        // Execute immediately
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000');
          const cronSecret = process.env.CRON_SECRET;

          await fetch(`${appUrl}${endpoint.path}`, {
            method: endpoint.method,
            headers: cronSecret ? { 'Authorization': `Bearer ${cronSecret}`, 'Content-Type': 'application/json' } : {},
          });
          ordersExecuted++;
        } catch (e: any) {
          console.error(`[AgentChat] Failed to execute order for ${targetAgent}:`, e.message);
        }
      }
    }

    // Check if agent learned something (save to memory)
    const learningMatch = reply.match(/(?:j'ai appris|je retiens|note pour moi|apprentissage)\s*:\s*(.+)/i);
    if (learningMatch) {
      await supabase.from('agent_logs').insert({
        agent,
        action: 'memory',
        data: { learning: learningMatch[1].trim(), source: 'chat', learned_at: now.toISOString() },
        created_at: now.toISOString(),
      });
    }

    return NextResponse.json({
      ok: true,
      reply,
      agent: agentConfig.name,
      orders: ordersExecuted > 0 ? { executed: ordersExecuted } : undefined,
    });
  } catch (error: any) {
    console.error(`[AgentChat] Error for ${agent}:`, error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/agents/chat?agent=<name>&history=true
 * Load chat history for a specific agent.
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Auth failed' }, { status: 401 });
  }

  const agent = request.nextUrl.searchParams.get('agent');
  if (!agent) {
    return NextResponse.json({ ok: false, error: 'agent parameter required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: chatLogs } = await supabase
    .from('agent_logs')
    .select('data, created_at')
    .eq('agent', agent)
    .eq('action', 'chat')
    .order('created_at', { ascending: false })
    .limit(20);

  const messages: Array<{ role: string; content: string }> = [];
  for (const log of (chatLogs || []).reverse()) {
    if (log.data?.message) messages.push({ role: 'user', content: log.data.message });
    if (log.data?.reply) messages.push({ role: 'assistant', content: log.data.reply });
  }

  return NextResponse.json({ ok: true, messages });
}
