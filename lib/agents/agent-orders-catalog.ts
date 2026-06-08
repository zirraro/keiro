/**
 * Catalog of orders a client can give each agent via chat. Built from
 * the typed-directives system (lib/agents/typed-directives.ts) so the
 * UI documentation stays in sync with what each agent actually
 * understands.
 *
 * Founder ask: "tu peux faire la liste des ordre bien demandés" —
 * show the client what they can ask each agent so they don't have to
 * guess.
 */

export interface OrderExample {
  intent: string;
  example: string;
}

export interface AgentOrdersDoc {
  agentId: string;
  agentName: string;
  description: string;
  orders: OrderExample[];
}

export const AGENT_ORDERS_CATALOG: AgentOrdersDoc[] = [
  {
    agentId: 'content',
    agentName: 'Léna',
    description: "Demande-lui de varier le contenu, changer les horaires, t'inspirer d'un compte, mettre en avant un sujet…",
    orders: [
      { intent: 'Heures de publication', example: 'Publie à 9h, 13h et 19h' },
      { intent: 'Inspiration', example: "Inspire-toi du compte Insta @bouillon_chartier" },
      { intent: 'Sujet à pousser', example: "Parle plus de notre nouvelle pizza truffe" },
      { intent: 'Actualité à exploiter', example: "Fais un post sur Roland-Garros cette semaine" },
      { intent: 'Sujet interdit', example: 'Ne parle pas de promo' },
      { intent: 'Format préféré', example: 'Plus de reels, moins de carrousels' },
      { intent: 'Ton', example: 'Adopte un ton plus haut de gamme' },
      { intent: 'Cadence', example: 'Publie un peu moins' },
      { intent: 'Plateforme prioritaire', example: 'Concentre-toi sur TikTok' },
      { intent: 'Signature de marque', example: 'Termine chaque post par "À très vite à la maison"' },
      { intent: 'Audience cible', example: "Vise les 25-40 ans urbains" },
      { intent: 'Action immédiate', example: 'Publie maintenant' },
    ],
  },
  {
    agentId: 'dm_instagram',
    agentName: 'Jade',
    description: "Demande-lui le ton des DMs, qui blacklister, sur quelles niches scraper…",
    orders: [
      { intent: 'Ton des DMs', example: 'Sois plus direct, moins commercial' },
      { intent: 'Comptes à éviter', example: 'Ne DM jamais @mon_concurrent_principal' },
      { intent: 'Niches à cibler', example: 'Concentre-toi sur les pizzerias du 11e et 12e' },
      { intent: 'Action immédiate', example: 'Lance la prochaine vague de DM' },
    ],
  },
  {
    agentId: 'email',
    agentName: 'Hugo',
    description: "Demande-lui le ton, la signature, le rythme des relances, les sujets à éviter…",
    orders: [
      { intent: 'Signature', example: 'Termine tous les emails par "Léa - Bonjour Pizza, 06 12 34 56 78"' },
      { intent: 'Style des objets', example: 'Objets plus courts, sans emoji' },
      { intent: 'Ton', example: 'Tutoiement systématique' },
      { intent: 'Cadence relances', example: '4 jours entre les relances' },
      { intent: 'Action immédiate', example: 'Envoie la prochaine vague' },
    ],
  },
  {
    agentId: 'commercial',
    agentName: 'Léo',
    description: "Demande-lui où prospecter, quels types exclure, à quelle fréquence enrichir le CRM…",
    orders: [
      { intent: 'Zones de prospection', example: 'Scrape Bastille, Marais et Canal Saint-Martin' },
      { intent: 'Types exclus', example: 'Pas de chaînes ni de franchises' },
      { intent: 'Action immédiate', example: "Enrichis le CRM avec 50 nouveaux prospects ce soir" },
    ],
  },
  {
    agentId: 'reviews',
    agentName: 'Théo',
    description: "Demande-lui le ton des réponses aux avis, la signature, les sujets sensibles à escalader…",
    orders: [
      { intent: 'Ton', example: 'Plus chaleureux, moins formel' },
      { intent: 'Signature', example: 'Signe "L\'équipe de Bonjour Pizza"' },
      { intent: 'Escalade', example: 'Tout avis <3 étoiles me prévient avant de répondre' },
    ],
  },
  {
    agentId: 'ceo',
    agentName: 'Noah',
    description: "Demande-lui un focus stratégique, des priorités, ce qu'il doit surveiller…",
    orders: [
      { intent: 'Priorité business', example: 'Concentre-toi sur la rétention ce mois' },
      { intent: 'KPI à surveiller', example: 'Alerte-moi si le CA hebdo baisse de plus de 15%' },
      { intent: 'Style des briefs', example: 'Briefs plus courts, juste les actions urgentes' },
    ],
  },
  {
    agentId: 'seo',
    agentName: 'Léa SEO',
    description: "Demande-lui les mots-clés cibles, les angles d'articles, la fréquence…",
    orders: [
      { intent: 'Mot-clé à pousser', example: 'Article sur "pizza napolitaine livraison Paris 11"' },
      { intent: 'Angle', example: "Plus de comparatifs, moins d'avis" },
    ],
  },
  {
    agentId: 'marketing',
    agentName: 'Marketing',
    description: "Donne-lui des objectifs business, des arbitrages cross-canal…",
    orders: [
      { intent: 'Objectif', example: 'Priorité acquisition ce mois, pas rétention' },
      { intent: 'Budget canal', example: 'Plus de temps sur TikTok, moins sur LinkedIn' },
    ],
  },
];

export function getOrdersForAgent(agentId: string): AgentOrdersDoc | null {
  return AGENT_ORDERS_CATALOG.find(a => a.agentId === agentId) || null;
}
