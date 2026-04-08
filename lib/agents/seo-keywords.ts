// KeiroAI SEO Agent - Keyword Clusters
// Organized by intent: how-to, comparison, business type, People Also Ask

export interface SeoKeyword {
  primary: string;
  secondary: string[];
  volume: number;
  difficulty: number;
  priority: 'haute' | 'moyenne' | 'basse';
}

export interface KeywordClusters {
  how_to: SeoKeyword[];
  comparison: SeoKeyword[];
  by_business: Record<string, SeoKeyword[]>;
  paa: SeoKeyword[];
}

export const KEYWORD_CLUSTERS: KeywordClusters = {
  // ---- How-to articles (comment faire) ----
  how_to: [
    {
      primary: 'comment faire du marketing sur instagram pour restaurant',
      secondary: ['marketing instagram restaurant', 'post instagram restaurant', 'reels restaurant idees'],
      volume: 1200,
      difficulty: 35,
      priority: 'haute',
    },
    {
      primary: 'comment creer du contenu instagram pour boutique',
      secondary: ['contenu instagram boutique', 'idees posts boutique', 'strategie instagram boutique'],
      volume: 900,
      difficulty: 30,
      priority: 'haute',
    },
    {
      primary: 'comment utiliser l ia pour le marketing',
      secondary: ['ia marketing', 'intelligence artificielle marketing', 'outils ia marketing'],
      volume: 2500,
      difficulty: 55,
      priority: 'haute',
    },
    {
      primary: 'comment faire des visuels marketing sans graphiste',
      secondary: ['creer visuels marketing', 'visuels marketing gratuit', 'design marketing facile'],
      volume: 1800,
      difficulty: 40,
      priority: 'haute',
    },
    {
      primary: 'comment creer des tiktok pour son commerce',
      secondary: ['tiktok commerce local', 'tiktok pour boutique', 'idees tiktok entreprise'],
      volume: 1500,
      difficulty: 30,
      priority: 'haute',
    },
    {
      primary: 'comment trouver des idees de posts instagram',
      secondary: ['idees posts instagram', 'inspiration posts instagram', 'calendrier editorial instagram'],
      volume: 3200,
      difficulty: 50,
      priority: 'moyenne',
    },
    {
      primary: 'comment faire du marketing pour un coach',
      secondary: ['marketing coach', 'communication coach sportif', 'attirer clients coaching'],
      volume: 800,
      difficulty: 25,
      priority: 'moyenne',
    },
    {
      primary: 'comment faire de la publicite pour un salon de coiffure',
      secondary: ['publicite coiffeur', 'marketing salon coiffure', 'attirer clients coiffeur'],
      volume: 1100,
      difficulty: 30,
      priority: 'haute',
    },
    {
      primary: 'comment automatiser son marketing sur les reseaux sociaux',
      secondary: ['automatisation reseaux sociaux', 'planifier posts automatiquement', 'marketing automation social media'],
      volume: 1400,
      difficulty: 45,
      priority: 'moyenne',
    },
    {
      primary: 'comment generer des images avec l intelligence artificielle',
      secondary: ['generateur image ia', 'creer image ia', 'ia generation image'],
      volume: 4500,
      difficulty: 60,
      priority: 'moyenne',
    },
  ],

  // ---- Comparison / Alternative articles ----
  comparison: [
    {
      primary: 'alternative a canva pour marketing',
      secondary: ['canva alternative', 'mieux que canva', 'remplacer canva ia'],
      volume: 2200,
      difficulty: 50,
      priority: 'haute',
    },
    {
      primary: 'chatgpt vs outil ia marketing specialise',
      secondary: ['chatgpt marketing', 'alternative chatgpt marketing', 'chatgpt pour reseaux sociaux'],
      volume: 1800,
      difficulty: 45,
      priority: 'haute',
    },
    {
      primary: 'community manager vs ia marketing',
      secondary: ['remplacer community manager', 'ia vs community manager', 'cout community manager vs ia'],
      volume: 1500,
      difficulty: 40,
      priority: 'haute',
    },
    {
      primary: 'meilleur outil ia pour creer du contenu reseaux sociaux',
      secondary: ['outil ia contenu social', 'generateur contenu ia', 'ia pour instagram tiktok'],
      volume: 2800,
      difficulty: 55,
      priority: 'moyenne',
    },
  ],

  // ---- By business type ----
  by_business: {
    coiffeur: [
      {
        primary: 'marketing digital salon de coiffure',
        secondary: ['communication coiffeur', 'instagram coiffeur', 'attirer clients salon coiffure'],
        volume: 1300,
        difficulty: 30,
        priority: 'haute',
      },
      {
        primary: 'idees posts instagram coiffeur',
        secondary: ['contenu instagram coiffeur', 'reels coiffure', 'stories coiffeur'],
        volume: 900,
        difficulty: 20,
        priority: 'haute',
      },
      {
        primary: 'comment avoir plus de clients en salon de coiffure',
        secondary: ['trouver clients coiffure', 'developper clientele coiffeur', 'fidéliser clients coiffeur'],
        volume: 1600,
        difficulty: 35,
        priority: 'haute',
      },
      {
        primary: 'tiktok pour salon de coiffure',
        secondary: ['tiktok coiffure', 'video tiktok coiffeur', 'tendances tiktok coiffure'],
        volume: 700,
        difficulty: 15,
        priority: 'moyenne',
      },
      {
        primary: 'publicite facebook salon de coiffure',
        secondary: ['ads facebook coiffeur', 'facebook coiffure', 'promouvoir salon coiffure'],
        volume: 800,
        difficulty: 30,
        priority: 'basse',
      },
    ],
    fleuriste: [
      {
        primary: 'marketing digital fleuriste',
        secondary: ['communication fleuriste', 'promouvoir boutique fleurs', 'fleuriste reseaux sociaux'],
        volume: 600,
        difficulty: 20,
        priority: 'haute',
      },
      {
        primary: 'instagram pour fleuriste idees de posts',
        secondary: ['contenu instagram fleuriste', 'photos fleurs instagram', 'stories fleuriste'],
        volume: 500,
        difficulty: 15,
        priority: 'haute',
      },
      {
        primary: 'comment vendre des fleurs en ligne',
        secondary: ['vente fleurs internet', 'fleuriste en ligne', 'e-commerce fleuriste'],
        volume: 1100,
        difficulty: 40,
        priority: 'moyenne',
      },
      {
        primary: 'fleuriste comment attirer des clients',
        secondary: ['clientele fleuriste', 'developper boutique fleurs', 'marketing fleuriste local'],
        volume: 700,
        difficulty: 25,
        priority: 'haute',
      },
      {
        primary: 'visuels marketing fleuriste ia',
        secondary: ['creer visuels fleuriste', 'design fleuriste', 'affiche fleuriste'],
        volume: 300,
        difficulty: 10,
        priority: 'moyenne',
      },
    ],
    restaurant: [
      {
        primary: 'marketing digital restaurant',
        secondary: ['communication restaurant', 'strategie marketing restaurant', 'promouvoir restaurant'],
        volume: 2500,
        difficulty: 45,
        priority: 'haute',
      },
      {
        primary: 'instagram pour restaurant idees de posts',
        secondary: ['contenu instagram restaurant', 'photos plats instagram', 'reels restaurant'],
        volume: 1800,
        difficulty: 30,
        priority: 'haute',
      },
      {
        primary: 'comment attirer des clients au restaurant',
        secondary: ['trouver clients restaurant', 'remplir restaurant', 'augmenter couverts restaurant'],
        volume: 2200,
        difficulty: 40,
        priority: 'haute',
      },
      {
        primary: 'tiktok pour restaurant idees videos',
        secondary: ['tiktok restaurant', 'video tiktok cuisine', 'viral restaurant tiktok'],
        volume: 1200,
        difficulty: 25,
        priority: 'moyenne',
      },
      {
        primary: 'visuels marketing restaurant ia',
        secondary: ['creer visuels restaurant', 'design menu restaurant', 'affiche restaurant ia'],
        volume: 500,
        difficulty: 15,
        priority: 'moyenne',
      },
    ],
    boutique: [
      {
        primary: 'marketing digital boutique vetements',
        secondary: ['communication boutique', 'promouvoir boutique mode', 'strategie digitale boutique'],
        volume: 1400,
        difficulty: 35,
        priority: 'haute',
      },
      {
        primary: 'instagram pour boutique idees de posts',
        secondary: ['contenu instagram boutique', 'photos produits instagram', 'stories boutique'],
        volume: 1100,
        difficulty: 25,
        priority: 'haute',
      },
      {
        primary: 'comment vendre plus en boutique grace aux reseaux sociaux',
        secondary: ['reseaux sociaux boutique', 'augmenter ventes boutique', 'social selling boutique'],
        volume: 1600,
        difficulty: 40,
        priority: 'haute',
      },
      {
        primary: 'tiktok pour boutique de mode',
        secondary: ['tiktok boutique', 'video tiktok vetements', 'tendances tiktok mode'],
        volume: 800,
        difficulty: 20,
        priority: 'moyenne',
      },
      {
        primary: 'visuels marketing boutique ia',
        secondary: ['creer visuels boutique', 'design boutique', 'affiche promo boutique'],
        volume: 400,
        difficulty: 10,
        priority: 'moyenne',
      },
    ],
    coach: [
      {
        primary: 'marketing digital coach sportif',
        secondary: ['communication coach', 'promouvoir coaching', 'trouver clients coaching'],
        volume: 900,
        difficulty: 30,
        priority: 'haute',
      },
      {
        primary: 'instagram pour coach idees de contenu',
        secondary: ['contenu instagram coach', 'posts coaching', 'stories coach sportif'],
        volume: 700,
        difficulty: 20,
        priority: 'haute',
      },
      {
        primary: 'comment trouver des clients en tant que coach',
        secondary: ['clients coaching', 'developper activite coach', 'prospection coach'],
        volume: 1800,
        difficulty: 40,
        priority: 'haute',
      },
      {
        primary: 'creer du contenu video pour coach',
        secondary: ['video coaching', 'tiktok coach sportif', 'reels coach'],
        volume: 600,
        difficulty: 20,
        priority: 'moyenne',
      },
      {
        primary: 'personal branding coach avec ia',
        secondary: ['branding coach', 'image de marque coach', 'ia pour coach'],
        volume: 400,
        difficulty: 15,
        priority: 'moyenne',
      },
    ],
  },

  // ---- People Also Ask ----
  paa: [
    {
      primary: 'combien coute un community manager pour un petit commerce',
      secondary: ['prix community manager', 'tarif cm freelance', 'budget marketing petit commerce'],
      volume: 1800,
      difficulty: 35,
      priority: 'haute',
    },
    {
      primary: 'est ce que l ia peut remplacer un community manager',
      secondary: ['ia vs cm', 'automatiser community management', 'ia gestion reseaux sociaux'],
      volume: 1200,
      difficulty: 40,
      priority: 'haute',
    },
    {
      primary: 'quel est le meilleur moment pour poster sur instagram',
      secondary: ['heure publication instagram', 'quand poster instagram', 'meilleur horaire instagram'],
      volume: 5500,
      difficulty: 65,
      priority: 'basse',
    },
    {
      primary: 'comment faire un visuel marketing professionnel',
      secondary: ['creer visuel marketing', 'design marketing', 'visuel pro sans graphiste'],
      volume: 2000,
      difficulty: 45,
      priority: 'moyenne',
    },
    {
      primary: 'quelle ia utiliser pour creer des images marketing',
      secondary: ['ia image marketing', 'generateur image marketing', 'outil ia visuel'],
      volume: 1500,
      difficulty: 40,
      priority: 'haute',
    },
    {
      primary: 'comment surfer sur l actualite pour son marketing',
      secondary: ['newsjacking marketing', 'marketing actualite', 'contenu tendance marketing'],
      volume: 800,
      difficulty: 25,
      priority: 'haute',
    },
    {
      primary: 'faut il etre sur tiktok quand on a un commerce',
      secondary: ['tiktok commerce', 'tiktok petit commerce', 'interet tiktok entreprise'],
      volume: 900,
      difficulty: 20,
      priority: 'moyenne',
    },
    {
      primary: 'comment creer un calendrier editorial pour son commerce',
      secondary: ['calendrier editorial', 'planning posts', 'organiser contenu reseaux sociaux'],
      volume: 1100,
      difficulty: 30,
      priority: 'moyenne',
    },
    {
      primary: 'combien de posts par semaine sur instagram pour un commerce',
      secondary: ['frequence posts instagram', 'nombre posts instagram', 'rythme publication instagram'],
      volume: 2200,
      difficulty: 40,
      priority: 'basse',
    },
    {
      primary: 'comment mesurer le retour sur investissement des reseaux sociaux',
      secondary: ['roi reseaux sociaux', 'mesurer impact instagram', 'kpi marketing social media'],
      volume: 1400,
      difficulty: 50,
      priority: 'moyenne',
    },
  ],
};

/**
 * Get a flat list of all keywords sorted by priority then volume.
 */
export function getAllKeywordsSorted(): SeoKeyword[] {
  const all: SeoKeyword[] = [
    ...KEYWORD_CLUSTERS.how_to,
    ...KEYWORD_CLUSTERS.comparison,
    ...Object.values(KEYWORD_CLUSTERS.by_business).flat(),
    ...KEYWORD_CLUSTERS.paa,
  ];

  const priorityOrder = { haute: 0, moyenne: 1, basse: 2 };
  return all.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.volume - a.volume;
  });
}

/**
 * Pick the next best keyword to write about, excluding already-used primaries.
 */
export function pickNextKeyword(usedPrimaries: string[]): SeoKeyword | null {
  const sorted = getAllKeywordsSorted();
  const usedSet = new Set(usedPrimaries.map((k) => k.toLowerCase()));
  const unused = sorted.find((k) => !usedSet.has(k.primary.toLowerCase()));
  if (unused) return unused;

  // All static keywords used — generate dynamic variations
  // Pick a random used keyword and create a variation
  const businessTypes = ['restaurant', 'boutique', 'coach', 'coiffeur', 'caviste', 'fleuriste', 'freelance', 'artisan'];
  const formats = [
    'comment augmenter sa visibilité sur instagram pour',
    'stratégie marketing digital pour',
    'comment attirer des clients avec instagram pour',
    'comment créer du contenu viral pour',
    'guide complet marketing IA pour',
    'automatiser sa communication pour',
    'comment gérer ses réseaux sociaux pour',
    'idées de posts instagram pour',
    'comment utiliser l\'IA pour le marketing de',
    'gagner des clients sur les réseaux sociaux pour',
  ];
  const year = new Date().getFullYear();
  const month = new Date().toLocaleString('fr-FR', { month: 'long' });

  // Generate a unique combination not yet used
  for (const format of formats) {
    for (const biz of businessTypes) {
      const keyword = `${format} ${biz} ${year}`;
      if (!usedSet.has(keyword.toLowerCase())) {
        return {
          primary: keyword,
          secondary: [`marketing ${biz}`, `instagram ${biz}`, `IA marketing ${biz}`],
          volume: 500 + Math.floor(Math.random() * 1000),
          difficulty: 20 + Math.floor(Math.random() * 30),
          priority: 'moyenne',
        };
      }
    }
  }

  // Ultimate fallback — monthly trending topic
  const trending = `tendances marketing digital ${month} ${year}`;
  if (!usedSet.has(trending.toLowerCase())) {
    return { primary: trending, secondary: ['tendances marketing', 'digital marketing'], volume: 800, difficulty: 25, priority: 'haute' };
  }

  return null;
}
