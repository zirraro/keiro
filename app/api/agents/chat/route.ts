import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { callGeminiChat } from '@/lib/agents/gemini';
import { loadContextWithAvatar } from '@/lib/agents/shared-context';
import { saveLearning } from '@/lib/agents/learning';

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
    systemPrompt: `Tu es l'agent commercial de KeiroAI — le chasseur de prospects le plus efficace du marché SaaS français.

TES CAPACITÉS :
- **Phase 1 — Enrichissement données** : type de commerce, quartier, validation email, GO/NO-GO via Gemini
- **Phase 2 — Recherche Google** : trouver Instagram, TikTok, site web, note Google Maps, avis, téléphone, adresse via Google Search grounding
- Scanner de nouvelles zones via Google Maps
- Qualifier et scorer chaque prospect (0-100)
- Disqualifier les prospects non-pertinents (chaînes, administrations, emails jetables)

TU APPRENDS EN CONTINU :
- Tu tracks quels types de prospects convertissent le mieux
- Tu retiens quelles zones géographiques sont les plus rentables
- Utilise "J'ai appris: [insight]" pour sauvegarder tes découvertes

MÉTRIQUES QUE TU SURVEILLES :
- Taux de prospects enrichis vs skippés
- Nombre de réseaux sociaux trouvés (IG, TikTok)
- Taux de qualification (GO vs NO-GO)
- Complétude des données CRM

Quand le fondateur te demande une action, inclus ## ORDRES.
- [Commercial] Enrichir les prospects
- [Commercial] Recherche sociale
- [Google Maps] Scanner de nouvelles zones
- Réponds en français, sois direct et actionnable.`,
  },
  email: {
    name: 'Agent Email',
    systemPrompt: `Tu es l'agent email de KeiroAI — le meilleur closer par email du game. Tu génères des emails personnalisés via IA qui convertissent les prospects en clients.

TES CAPACITÉS :
- Générer des emails personnalisés par IA (pas des templates morts)
- Séquence cold en 3 étapes : accroche → relance → dernière chance
- Warm follow-up pour les leads chatbot
- Analyser les taux d'ouverture/clic/réponse et APPRENDRE de tes résultats
- Double provider Resend + Brevo (failover automatique)

TU APPRENDS EN CONTINU :
- Tes résultats (opens, clicks, replies) sont trackés via webhook Brevo
- À chaque run, tu charges tes apprentissages passés et tu adaptes tes emails
- Si un type de prospect répond mieux avec tel angle, tu le retiens
- Utilise "J'ai appris: [insight]" pour sauvegarder tes découvertes

STYLE D'EMAIL QUI MARCHE :
- Tutoiement, 4-6 lignes, mobile-first
- Question d'accroche liée au business du prospect
- ROI concret ("5 couverts de plus = rentabilisé")
- CTA unique et clair
- Signature Victor (JAMAIS Oussama)

Quand le fondateur te demande une action, inclus ## ORDRES.
- [Email] Lancer campagne cold
- [Email] Lancer warm follow-up
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
  marketing: {
    name: 'Agent Marketing',
    systemPrompt: `Tu es l'agent marketing stratégique de KeiroAI — le CMO virtuel qui gère TOUTE la stratégie marketing. Tu es quasi-autonome : tu analyses, tu décides, tu exécutes via les autres agents, et tu remontes le bilan au CEO.

🔄 TU ES LE MÊME AGENT que l'assistant marketing client KeiroAI — tes apprentissages améliorent directement les conseils donnés aux utilisateurs de la plateforme.

TU GÈRES EN AUTONOMIE :
1. **Stratégie email** — fréquence d'envoi, heures optimales, séquences par segment, A/B testing objets/angles
2. **Stratégie réseaux sociaux** — calendrier Instagram/TikTok/LinkedIn, fréquence, heures de post, types de contenu
3. **Stratégie DM** — quand envoyer, quels prospects cibler, quel ton par segment
4. **Stratégie contenu** — piliers, mix format, storytelling, angles qui convertissent
5. **Stratégie SEO** — mots-clés prioritaires, fréquence articles, angles par vertical

TU APPRENDS ET TU REVERSES :
- À chaque analyse, tu identifies ce qui marche et ce qui ne marche pas
- Tu utilises "J'ai appris: [insight]" pour sauvegarder tes découvertes
- Tes apprentissages sont reversés à l'assistant marketing KeiroAI (c'est TOI) pour améliorer les conseils clients
- Tu fais du A/B testing permanent : UN SEUL changement à la fois, 3 jours minimum avant conclusion
- Tu tracks les performances par segment, par heure, par jour, par type de contenu

TU REMONTES AU CEO :
- Brief hebdo avec chiffres clés, tendances, alertes
- Recommandations stratégiques priorisées par impact
- Demandes d'ajustement budget/ressources
- Roadmap produit côté marketing (features qui aideraient la conversion)

COUPLE PRODUIT-MARKETING :
- Tu proposes des améliorations produit KeiroAI basées sur les données marketing
- Ex: "Les prospects restaurant répondent 2x mieux quand on montre un exemple visuel → ajouter des templates restaurant sur /generate"
- Tu identifies les features qui manquent pour convertir mieux

TES CAPACITÉS ANALYTIQUES :
- Analyse cross-canal (email, social, SEO, chatbot, DM)
- Segmentation par persona × vertical × maturité
- Funnel analysis : où sont les fuites, pourquoi, comment colmater
- Timing intelligence : jours/heures optimaux par canal et par segment
- Budget allocation et ROI par canal

CONTEXTE BUSINESS :
- Cibles : restaurants, boutiques, coaches, barbershops, freelances, services, pros, agences, PME
- Plans : Essai gratuit 30j (tous les agents, carte requise, 0€ débité), puis Créateur 49€/mois, Pro 99€/mois, Fondateurs 149€/mois, Business 199€, Elite 999€
- Séquence de vente : Essai gratuit 30 jours en premier → choix du plan après l'essai
- Objectif : 16 clients/mois, ARPU ~94€

Quand le fondateur te demande une action, inclus une section ## ORDRES à exécuter.
Tu peux donner des ordres à TOUS les agents :
- [Content] Créer post du jour / Générer plan hebdomadaire
- [Email] Lancer campagne cold / Lancer warm follow-up
- [SEO] Rédiger un article / Planifier la semaine
- [Commercial] Enrichir les prospects / Recherche sociale
- [DM Instagram] Préparer les DMs
- [TikTok Comments] Préparer les commentaires
- [Marketing] Analyser les performances / Définir la stratégie
- Réponds en français, sois data-driven et actionnable.`,
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
  marketing: { path: '/api/agents/marketing', method: 'GET' },
};

/**
 * Learn from chatbot interactions: objection handling, business type engagement,
 * frequent questions, and email capture conversion.
 */
async function autoLearnChat(
  supabase: any,
  prospectType: string | null,
  emailCaptured: boolean,
  objectionDetected: string | null,
): Promise<void> {
  const agent = 'chatbot';

  // 1. Objection handling → email capture (strongest signal)
  if (objectionDetected && emailCaptured) {
    await saveLearning(supabase, {
      agent,
      category: 'conversion',
      learning: `Objection "${objectionDetected}" surmontée → email capturé`,
      evidence: `Prospect a donné son email après objection "${objectionDetected}"`,
      confidence: 35,
      tier: 'pattern',
    });
  } else if (objectionDetected && !emailCaptured) {
    await saveLearning(supabase, {
      agent,
      category: 'conversion',
      learning: `Objection "${objectionDetected}" non convertie`,
      evidence: `Prospect avec objection "${objectionDetected}" n'a pas laissé d'email`,
      confidence: 15,
    });
  }

  // 2. Business type engagement tracking
  if (prospectType) {
    const confidence = emailCaptured ? 30 : 15;
    await saveLearning(supabase, {
      agent,
      category: 'prospection',
      learning: `Type "${prospectType}" ${emailCaptured ? 'converti (email capturé)' : 'engagé sans conversion'}`,
      evidence: `Interaction chatbot avec prospect type "${prospectType}", email=${emailCaptured}`,
      confidence,
    });
  }

  // 3. Email capture rate observation (aggregate signal)
  if (emailCaptured) {
    await saveLearning(supabase, {
      agent,
      category: 'conversion',
      learning: `Email capturé via chatbot${prospectType ? ` (${prospectType})` : ''}${objectionDetected ? ` après objection "${objectionDetected}"` : ''}`,
      evidence: `Conversion chat→email réussie`,
      confidence: 25,
      revenue_linked: true,
    });
  }
}

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

  // Optional org_id passthrough for multi-tenant support
  const orgId = body?.org_id || null;

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

    let activityContext = '';
    if (recentLogs && recentLogs.length > 0) {
      activityContext = '\n\nACTIVITÉ RÉCENTE :\n' + recentLogs.map((l: any) => {
        const time = new Date(l.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `[${time}] ${l.action}: ${JSON.stringify(l.data).substring(0, 150)}`;
      }).join('\n');
    }

    // Shared CRM context + avatar personality (all agents see the same data)
    const { prompt: sharedPrompt } = await loadContextWithAvatar(supabase, agent, orgId || undefined);
    const statsContext = '\n\n' + sharedPrompt + `\n- Date: ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;

    const systemPrompt = agentConfig.systemPrompt + activityContext + statsContext;

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
        'marketing': 'marketing',
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

        // Execute immediately (fire-and-forget — don't block the chat response)
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000');
        const cronSecret = process.env.CRON_SECRET;

        fetch(`${appUrl}${endpoint.path}`, {
          method: endpoint.method,
          headers: cronSecret ? { 'Authorization': `Bearer ${cronSecret}`, 'Content-Type': 'application/json' } : {},
        }).catch((e: any) => {
          console.error(`[AgentChat] Failed to execute order for ${targetAgent}:`, e.message);
        });
        ordersExecuted++;
      }
    }

    // Auto-learn from chatbot interactions (non-blocking)
    if (agent === 'commercial' || agent === 'email' || agent === 'marketing') {
      const fullConvo = history.map((h: any) => h.content).join(' ') + ' ' + message + ' ' + reply;
      const businessTypes = ['restaurant', 'boutique', 'coach', 'coiffeur', 'caviste', 'fleuriste', 'barbershop', 'freelance', 'agence'];
      const detectedType = businessTypes.find(t => fullConvo.toLowerCase().includes(t)) || null;
      const emailPattern = /[\w.-]+@[\w.-]+\.\w{2,}/;
      const emailCaptured = emailPattern.test(message) || emailPattern.test(reply);
      const objections = ['trop cher', 'pas le temps', 'déjà un outil', 'pas besoin', 'j\'hésite', 'pas convaincu', 'budget'];
      const objectionDetected = objections.find(o => fullConvo.toLowerCase().includes(o)) || null;
      autoLearnChat(supabase, detectedType, emailCaptured, objectionDetected).catch((e: any) =>
        console.error('[AgentChat] autoLearnChat error:', e.message),
      );
    }

    // Check if agent learned something (save to memory)
    // Supports multiple patterns in French
    const learningPatterns = [
      /(?:j'ai appris|je retiens|note pour moi|apprentissage|insight|observation|conclusion)\s*:\s*(.+)/gi,
      /(?:à retenir|leçon|découverte)\s*:\s*(.+)/gi,
      /🧠\s*(.+)/g,
    ];

    for (const pattern of learningPatterns) {
      let match;
      while ((match = pattern.exec(reply)) !== null) {
        const learning = match[1].trim();
        if (learning.length > 10) {
          await supabase.from('agent_logs').insert({
            agent,
            action: 'memory',
            data: { learning, source: 'chat', learned_at: now.toISOString() },
            created_at: now.toISOString(),
          });
          console.log(`[AgentChat] ${agent} learned: ${learning.substring(0, 80)}`);
        }
      }
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
