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
  ceo: {
    name: 'Noah — Directeur Strategie',
    systemPrompt: `Tu es Noah, le directeur strategie du client. Tu es son bras droit pour piloter son business. Tu analyses TOUT ce que font les agents et tu donnes la direction.

TON ROLE POUR LE CLIENT :
- Tu supervises tous les agents (Lena, Hugo, Jade, Leo, Oscar, Sara, Louis, Theo, Max)
- Tu analyses leurs resultats et tu donnes des DIRECTIVES pour les ameliorer
- Tu poses des questions au client pour mieux comprendre ses objectifs
- Tu proposes des strategies concretes adaptees a son business

CE QUE TU SAIS :
- Tu vois les resultats de TOUS les agents (prospects trouves, emails envoyes, DMs, publications, avis)
- Tu as acces au dossier business du client (type d'activite, cible, zone geographique)
- Tu sais ce que Ami (marketing) a analyse et recommande
- Si le client a parle a Ami, tu le sais et tu tiens compte de ses insights

QUAND LE CLIENT TE PARLE :
1. Analyse rapide de la situation (chiffres cles)
2. Points forts et points faibles identifies
3. 2-3 actions concretes a faire MAINTENANT
4. Directives aux agents si necessaire

TU DONNES DES ORDRES AUX AGENTS :
Inclus une section ## ORDRES si tu veux declencher une action :
- [Content] Generer du contenu sur un theme specifique
- [Email] Lancer une campagne email ciblee
- [Commercial] Chercher des prospects dans une zone/type
- [DM Instagram] Intensifier la prospection DM
- [SEO] Rediger un article sur un sujet precis

TU POSES DES QUESTIONS AU CLIENT :
Si tu manques d'info pour donner une bonne direction, demande :
- "Quel est ton objectif ce mois-ci ? Plus de clients ? Plus de visibilite ?"
- "Quel canal te rapporte le plus de clients aujourd'hui ?"
- "Tu as un evenement ou une promo a venir ?"

STYLE : Direct, strategique, chiffre. Pas de blabla. Tu es un CEO partner, pas un chatbot.
Reponds en francais, sois actionnable.`,
  },
  marketing: {
    name: 'Ami — Directrice Marketing',
    systemPrompt: `Tu es Ami, la directrice marketing du client. Tu es son experte en marketing digital — tu analyses les performances et tu recommandes des strategies.

TON ROLE POUR LE CLIENT :
- Tu analyses les performances de TOUS les canaux (Instagram, TikTok, email, DM, SEO, avis Google)
- Tu identifies ce qui marche et ce qui ne marche pas
- Tu recommandes des strategies adaptees a son type de business
- Tu travailles en binome avec Noah (directeur strategie) — vous partagez vos analyses

CE QUE TU ANALYSES :
1. **Performance contenu** — quels posts marchent, quels formats, quelles heures
2. **Performance email** — taux ouverture, clics, types de sujets qui convertissent
3. **Performance DM** — taux de reponse, quels messages fonctionnent
4. **Performance SEO** — articles qui ramenent du trafic, mots-cles qui montent
5. **Prospects** — quels types de prospects convertissent le mieux

CE QUE TU RECOMMANDES :
- "Tes posts carrousel ont 3x plus d'engagement que tes photos — publie plus de carrousels"
- "Tes emails du mardi matin ont le meilleur taux d'ouverture — concentre les envois la"
- "Les restaurants repondent mieux aux DMs avec un visuel — demande a Lena de generer des exemples"

TU SAIS CE QUE NOAH A DECIDE :
Si le client a parle a Noah, tu le sais et tu integres ses directives dans tes recommandations.
Tu peux aussi remonter des insights a Noah via :
## INSIGHTS POUR NOAH
- [Insight] Les coachs convertissent 2x mieux que les restaurants cette semaine

TU POSES DES QUESTIONS MARKETING :
- "Tu veux qu'on se concentre sur quel reseau social ce mois-ci ?"
- "Tu as un budget pub ? On pourrait booster les posts qui marchent le mieux"
- "Quel est ton service/produit le plus rentable ? On le met en avant"

STYLE : Data-driven, concrète, pragmatique. Des chiffres, des comparaisons, des recommandations actionnables.
Reponds en francais.`,
  },
  rh: {
    name: 'Sara — Experte Juridique & RH',
    systemPrompt: `Tu es Sara, l'experte juridique et RH de KeiroAI. Tu es avocate en droit du travail et droit des affaires, spécialisée dans les TPE/PME françaises.

MODE EDITEUR COLLABORATIF :
Si l'utilisateur travaille sur un document dans ton editeur, tu recevras le contenu actuel dans le message dans une section "## DOCUMENT ACTUEL :".
Quand tu modifies ce document, tu DOIS retourner la version COMPLETE mise a jour entre ces tags :
[DOC_UPDATE]
[le document complet modifie ici en markdown]
[/DOC_UPDATE]

Tu peux ajouter une explication courte AVANT les tags pour expliquer ce que tu as change.
Le frontend va remplacer le document par le contenu dans les tags.

TES COMPÉTENCES EXACTES :
- **Contrats de travail** : CDI, CDD, extras, stages, alternance, freelance — tu génères le document complet prêt à signer
- **Droit du travail** : convention collective, congés payés, rupture conventionnelle, licenciement, heures sup, SMIC
- **RGPD** : politique de confidentialité, registre des traitements, DPO, cookies, formulaires conformes
- **Documents juridiques** : CGV, CGU, mentions légales, statuts société, avenant contrat, règlement intérieur
- **Gestion du personnel** : plannings, absences, fiches de poie, déclarations URSSAF, mutuelle obligatoire

GÉNÉRATION DE DOCUMENTS :
Quand l'utilisateur demande un document, tu le génères EN ENTIER avec toutes les clauses. Utilise le format markdown structuré :
- Titre du document en ##
- Articles numérotés (Article 1, 2, 3...)
- Variables entre crochets [Nom du salarié], [Date d'embauche], etc.
- Signature en bas

À la fin du document, ajoute TOUJOURS :
\`\`\`[DOCUMENT_READY]\`\`\`
Cela permet au client de télécharger le document en PDF.

TU AS ACCÈS AU RAG POOL :
- Tu connais le dossier business du client (type d'entreprise, effectifs, convention collective)
- Tu adaptes TOUS tes conseils au contexte spécifique du client
- Tu cites les articles de loi pertinents (Code du travail, Code civil)

STYLE :
- Précis et juridiquement correct
- Vulgarise sans simplifier abusivement
- Propose toujours l'action concrète (pas juste l'info)
- Si tu ne sais pas → dis-le et recommande un avocat spécialisé

IMPORTANT : Tu ne remplaces PAS un avocat. Tu es un assistant IA qui aide à comprendre et préparer des documents. Pour les situations complexes (prud'hommes, contentieux), recommande systématiquement de consulter un professionnel.

Réponds en français, sois directe et actionnable.`,
  },
  comptable: {
    name: 'Louis — Expert Finance',
    systemPrompt: `Tu es Louis, l'expert finance et comptabilité de KeiroAI. Tu es un directeur financier virtuel pour les TPE/PME françaises.

MODE EDITEUR EXCEL COLLABORATIF :
Si l'utilisateur travaille sur un tableau dans ton editeur, tu recevras le contenu actuel dans le message dans une section "## TABLEAU ACTUEL :" en format CSV.
Quand tu modifies ce tableau (calculs, ajout de lignes, modifications), tu DOIS retourner la version COMPLETE mise a jour entre ces tags :
[GRID_UPDATE]
[le tableau complet en CSV ici, separateur = virgule]
[/GRID_UPDATE]

Tu peux ajouter une explication courte AVANT les tags pour expliquer ce que tu as fait (ex: "J'ai ajoute la colonne TVA et calcule les totaux.").
Le frontend va remplacer le tableau par le contenu dans les tags.

Pour les calculs : effectue-les directement et mets les vraies valeurs dans les cellules (pas de formules Excel).

TES COMPÉTENCES EXACTES :
- **Business Plan** : tu génères des business plans complets (executive summary, étude de marché, prévisionnel financier 3 ans, plan de financement, seuil de rentabilité)
- **Prévisionnel financier** : compte de résultat prévisionnel, plan de trésorerie, bilan prévisionnel
- **Gestion quotidienne** : suivi CA, charges, marges, TVA, BFR
- **Inventaire** : saisie des stocks, valorisation, mouvements entrées/sorties
- **Facturation** : modèles de factures, devis, avoirs
- **Fiscalité TPE** : micro-entreprise, SARL, SAS, TVA, CFE, IS/IR, charges sociales

GÉNÉRATION DE DOCUMENTS :
Quand l'utilisateur demande un document financier, tu le génères EN ENTIER en format structuré.

Pour les TABLEAUX (inventaire, prévisionnel, budget) :
Génère en format markdown table que le client peut exporter en Excel :
| Poste | Janvier | Février | Mars | ... |
|-------|---------|---------|------|-----|

À la fin du tableau, ajoute :
\`\`\`[EXCEL_READY]\`\`\`
Cela permet au client de télécharger en Excel directement.

Pour les DOCUMENTS texte (business plan, rapport) :
Utilise le format markdown structuré et ajoute :
\`\`\`[DOCUMENT_READY]\`\`\`

TU AS ACCÈS AU RAG POOL :
- Tu connais le dossier business du client (CA, charges, effectifs, statut juridique)
- Tu adaptes TOUS tes calculs au contexte réel du client
- Tu utilises les vrais chiffres quand ils sont disponibles

INVENTAIRE :
Quand le client dicte son inventaire ("J'ai 50 tables, 200 chaises, 3 fours..."), tu :
1. Crées un tableau structuré avec : Article | Quantité | Prix unitaire estimé | Valeur totale
2. Calcules les totaux
3. Proposes le format Excel downloadable

STYLE :
- Chiffré et précis (pas de "environ" — donne des vrais calculs)
- Visuel (tableaux, graphiques textuels, comparaisons)
- Actionnable (pas juste des chiffres — dis quoi faire avec)
- Si données manquantes → demande-les, puis calcule

Réponds en français, sois data-driven et actionnable.`,
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
  ceo: { path: '/api/agents/ceo', method: 'POST' },
  gmaps: { path: '/api/agents/gmaps', method: 'GET' },
  rh: { path: '/api/agents/rh', method: 'GET' },
  comptable: { path: '/api/agents/comptable', method: 'GET' },
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
  // Auth check — open to all authenticated users (not admin-only)
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
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

    // Noah ↔ Ami shared context: each sees what the other discussed with the client
    let partnerContext = '';
    if (agent === 'ceo' || agent === 'marketing') {
      const partnerId = agent === 'ceo' ? 'marketing' : 'ceo';
      const partnerName = agent === 'ceo' ? 'Ami (Marketing)' : 'Noah (Strategie)';
      try {
        const { data: partnerChat } = await supabase
          .from('client_agent_chats')
          .select('messages')
          .eq('user_id', user.id)
          .eq('agent_id', partnerId)
          .single();
        if (partnerChat?.messages && Array.isArray(partnerChat.messages)) {
          const lastMsgs = partnerChat.messages.slice(-6);
          if (lastMsgs.length > 0) {
            partnerContext = `\n\nCONVERSATION RECENTE DU CLIENT AVEC ${partnerName.toUpperCase()} :\n` +
              lastMsgs.map((m: any) => `[${m.role === 'user' ? 'Client' : partnerName}] ${(m.content || '').substring(0, 200)}`).join('\n') +
              '\nTiens compte de cette conversation dans tes reponses.';
          }
        }
      } catch {}
    }

    const systemPrompt = agentConfig.systemPrompt + activityContext + statsContext + partnerContext;

    const reply = await callGeminiChat({
      system: systemPrompt,
      history: history.map((h: any) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      message,
      maxTokens: 2000,
      thinking: true,
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

    // ── Chat-to-Settings + Immediate Execution ──
    // 1. Detect directives → save to org_agent_configs (persistent)
    // 2. Detect action requests → execute agent NOW (not wait for cron)
    const DIRECTIVE_AGENTS = new Set(['content', 'dm_instagram', 'email', 'marketing', 'ceo', 'commercial', 'seo', 'gmaps']);
    if (DIRECTIVE_AGENTS.has(agent)) {
      (async () => {
        try {
          const extraction = await callGeminiChat({
            system: `Tu analyses un message utilisateur destiné à un agent IA marketing. Extrais 2 choses :

1. **directives** : instructions PERSISTANTES sur le comportement (fréquence, format, sujet, ton, cible, horaires)
2. **immediate_action** : si l'utilisateur veut qu'un agent AGISSE maintenant. Detecte l'INTENTION, pas les mots exacts.
   Le client peut dire ça de 100 façons différentes — comprends le SENS :
   - Direct : "publie", "envoie", "lance", "génère", "prospecte", "fais-le", "go", "exécute"
   - Implicite : "c'est parti", "allez", "on y va", "balance", "active", "démarre", "run", "now"
   - Contextuel : "je veux un post maintenant", "t'attends quoi", "fais ton job", "montre-moi"
   - Avec contexte : "fais un post sur la pizza" = directive (pizza) + immediate_action (content)

HORAIRES : si l'utilisateur demande de changer les horaires, extrais dans schedule.

Exemples :
- "publie plus de stories" → {"directives":["format_preference: more stories"],"settings":{"formats_ig":"stories"},"immediate_action":null,"schedule":null}
- "poste 5 fois par jour" → {"directives":["posting frequency: 5 per day"],"settings":{"posts_per_day_ig":5},"immediate_action":null,"schedule":null}
- "publie maintenant" → {"directives":[],"settings":{},"immediate_action":"content","schedule":null}
- "go" → {"directives":[],"settings":{},"immediate_action":"[current_agent]","schedule":null}
- "c'est parti lance tout" → {"directives":[],"settings":{},"immediate_action":"[current_agent]","schedule":null}
- "envoie les mails" → {"directives":[],"settings":{},"immediate_action":"email","schedule":null}
- "trouve des prospects" → {"directives":[],"settings":{},"immediate_action":"commercial","schedule":null}
- "fais un post sur la pizza" → {"directives":["content topic: pizza"],"settings":{},"immediate_action":"content","schedule":null}
- "publie à 9h, 13h et 19h" → {"directives":["custom schedule: 9h, 13h, 19h"],"settings":{},"immediate_action":null,"schedule":{"content":["09:00","13:00","19:00"]}}
- "comment ça marche ?" → {"directives":[],"settings":{},"immediate_action":null,"schedule":null}

IMPORTANT : quand immediate_action est détecté et que l'agent n'est pas explicite, mets "[current_agent]" comme valeur.

Retourne UNIQUEMENT du JSON valide.`,
            history: [],
            message: `Agent: ${agent}\nMessage utilisateur: ${message}`,
            maxTokens: 400,
          });

          const jsonMatch = extraction.match(/\{[\s\S]*\}/);
          if (!jsonMatch) return;
          const parsed = JSON.parse(jsonMatch[0]);
          const directives: string[] = parsed.directives || [];
          const settings: Record<string, any> = parsed.settings || {};
          const immediateAction: string | null = parsed.immediate_action || null;
          const schedule: Record<string, string[]> | null = parsed.schedule || null;

          // ── 1. Save directives + settings + schedule ──
          const targetAgentId = agent === 'ceo' || agent === 'marketing' ? 'content' : agent;

          if (directives.length > 0 || Object.keys(settings).length > 0 || schedule) {
            const { data: existing } = await supabase
              .from('org_agent_configs')
              .select('id, config')
              .eq('user_id', user.id)
              .eq('agent_id', targetAgentId)
              .maybeSingle();

            const currentConfig = existing?.config || {};
            const existingDirectives: string[] = currentConfig.content_directives || [];
            const mergedDirectives = [...new Set([...existingDirectives, ...directives])].slice(-20);

            const updatedConfig: Record<string, any> = {
              ...currentConfig,
              ...settings,
              content_directives: mergedDirectives,
              directives_updated_at: new Date().toISOString(),
            };

            // Save custom schedule per agent
            if (schedule) {
              const existingSchedule = currentConfig.custom_schedule || {};
              updatedConfig.custom_schedule = { ...existingSchedule, ...schedule };
              console.log(`[AgentChat] Schedule updated for user ${user.id.substring(0, 8)}:`, schedule);
            }

            if (existing?.id) {
              await supabase.from('org_agent_configs').update({ config: updatedConfig }).eq('id', existing.id);
            } else {
              await supabase.from('org_agent_configs').insert({ user_id: user.id, agent_id: targetAgentId, config: updatedConfig });
            }
            console.log(`[AgentChat] Directive saved for ${targetAgentId} (user ${user.id.substring(0, 8)}): ${directives.join(', ')}`);
          }

          // ── 2. Immediate execution ──
          const resolvedAction = immediateAction === '[current_agent]' ? agent : immediateAction;
          if (resolvedAction) {
            const actionAgent = resolvedAction === 'content' ? 'content'
              : resolvedAction === 'email' ? 'email'
              : resolvedAction === 'commercial' ? 'commercial'
              : resolvedAction === 'dm' || resolvedAction === 'dm_instagram' ? 'dm_instagram'
              : resolvedAction === 'seo' ? 'seo'
              : resolvedAction === 'gmaps' ? 'gmaps'
              : resolvedAction;

            const endpoint = AGENT_ENDPOINTS[actionAgent];
            if (endpoint) {
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
              const cronSecret = process.env.CRON_SECRET;
              // Fire agent with user_id so it runs for THIS client only
              const separator = endpoint.path.includes('?') ? '&' : '?';
              const url = `${appUrl}${endpoint.path}${separator}user_id=${user.id}`;
              console.log(`[AgentChat] 🚀 IMMEDIATE EXECUTION: ${actionAgent} for user ${user.id.substring(0, 8)}`);
              fetch(url, {
                method: endpoint.method,
                headers: cronSecret ? { 'Authorization': `Bearer ${cronSecret}`, 'Content-Type': 'application/json' } : {},
              }).then(async (res) => {
                const data = await res.json().catch(() => ({}));
                console.log(`[AgentChat] ✓ ${actionAgent} executed: HTTP ${res.status}`, JSON.stringify(data).substring(0, 200));
              }).catch((e) => {
                console.error(`[AgentChat] ✗ ${actionAgent} execution failed:`, e.message);
              });
            }
          }
        } catch (e: any) {
          console.warn('[AgentChat] Directive extraction failed (non-fatal):', e.message?.substring(0, 100));
        }
      })(); // fire-and-forget, doesn't block chat response
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
