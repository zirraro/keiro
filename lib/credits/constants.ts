/**
 * Système de crédits Keiro
 * Grille de coûts par fonctionnalité et crédits par plan
 */

// Coût en crédits par fonctionnalité
// Philosophie : images accessibles, vidéos progressives, IA cheap pour engagement
export const CREDIT_COSTS = {
  image_t2i: 4,
  image_i2i: 3,
  video_5s: 15,
  video_10s: 25,
  video_15s: 35,
  video_30s: 50,
  video_45s: 65,
  video_60s: 80,
  video_90s: 110,
  audio_tts: 2,
  text_suggest: 1,
  narration_suggest: 1,
  marketing_chat: 1,
  agent_chat: 1,
} as const;

/**
 * Free agent-chat quota: every user gets N free messages per agent per month
 * before 1 credit is deducted per additional message. With 15+ agents that's
 * 150+ free chat msgs/month — enough for 95% of users to never hit a paywall
 * while still capping power-user abuse (~$0.007 AI cost per msg vs €0.12
 * credit value = ~94% margin once we bill).
 */
export const AGENT_CHAT_FREE_PER_MONTH = 10;

/**
 * Per-plan hard monthly caps on COGS-heavy generation features.
 *
 * Philosophy: credits alone don't protect unit economics because 400 credits
 * spent on video_90s (4 videos × €2.70 API cost) costs us much more than the
 * same 400 credits spent on images (100 × €0.025). We impose hard monthly
 * caps per feature so the worst-case client can't blow through our margin
 * target of 75-80%. Duration caps on video are the single biggest lever
 * (video cost scales linearly with seconds).
 *
 * These caps are CEILINGS, not budgets — the user still consumes credits
 * normally, and the cap just prevents overshoot on the dimensions we can't
 * price per-credit (agent ambient DMs, emails, scoring, etc.).
 */
export const PLAN_QUOTAS: Record<string, {
  images_per_month: number;
  videos_per_month: number;
  video_max_seconds: number;
  tts_minutes_per_month: number;
  dms_per_day: number;        // Jade Instagram DM cap
  chatbot_sessions_per_day: number; // Max website chatbot cap
  agent_chat_free_per_month: number;
}> = {
  free: {
    images_per_month: 3,
    videos_per_month: 0,
    video_max_seconds: 0,
    tts_minutes_per_month: 0,
    dms_per_day: 0,
    chatbot_sessions_per_day: 0,
    agent_chat_free_per_month: 5,
  },
  createur: {
    images_per_month: 30,
    videos_per_month: 5,
    video_max_seconds: 15,
    tts_minutes_per_month: 10,
    dms_per_day: 30,
    chatbot_sessions_per_day: 0,   // Max not included on Créateur
    agent_chat_free_per_month: 10,
  },
  pro: {
    images_per_month: 80,
    videos_per_month: 8,
    video_max_seconds: 30,
    tts_minutes_per_month: 30,
    dms_per_day: 70,
    chatbot_sessions_per_day: 15,
    agent_chat_free_per_month: 10,
  },
  fondateurs: {
    images_per_month: 200,
    videos_per_month: 20,
    video_max_seconds: 60,
    tts_minutes_per_month: 60,
    dms_per_day: 150,
    chatbot_sessions_per_day: 40,
    agent_chat_free_per_month: 10,
  },
  business: {
    images_per_month: 200,
    videos_per_month: 20,
    video_max_seconds: 60,
    tts_minutes_per_month: 60,
    dms_per_day: 150,
    chatbot_sessions_per_day: 40,
    agent_chat_free_per_month: 10,
  },
  elite: {
    images_per_month: 999999,
    videos_per_month: 200,
    video_max_seconds: 90,
    tts_minutes_per_month: 300,
    dms_per_day: 500,
    chatbot_sessions_per_day: 999999,
    agent_chat_free_per_month: 20,
  },
  agence: {
    images_per_month: 999999,
    videos_per_month: 999999,
    video_max_seconds: 90,
    tts_minutes_per_month: 999999,
    dms_per_day: 999999,
    chatbot_sessions_per_day: 999999,
    agent_chat_free_per_month: 50,
  },
  admin: {
    images_per_month: 999999,
    videos_per_month: 999999,
    video_max_seconds: 90,
    tts_minutes_per_month: 999999,
    dms_per_day: 999999,
    chatbot_sessions_per_day: 999999,
    agent_chat_free_per_month: 999999,
  },
};

/** Resolve the quotas object for a given plan id (falls back to `free`). */
export function getPlanQuotas(plan: string | null | undefined) {
  const key = (plan || 'free').toLowerCase();
  return PLAN_QUOTAS[key] || PLAN_QUOTAS.free;
}

// Crédits par plan — Nouvelle grille tarifaire mars 2026
export const PLAN_CREDITS: Record<string, number> = {
  free: 20,
  // New plans
  createur: 400,
  pro: 800,
  fondateurs: 2000,   // = Business complet, offre jusqu'au 25 mai 2026
  business: 2000,
  elite: 6000,
  agence: 999999,
  admin: 999999,
  // Deprecated plans (kept for existing user data)
  sprint: 120,
  pro_promo: 250,
  standard: 950,
  solo: 250,
  solo_promo: 250,
};

// Prix des plans
export const PLAN_PRICES: Record<string, string> = {
  free: '0€',
  createur: '49€',
  pro: '99€',
  fondateurs: '149€',
  business: '199€',
  elite: '999€',
  agence: 'Sur devis',
  // Deprecated
  sprint: '4,99€',
  pro_promo: '89€',
  standard: '199€',
  solo: '49€',
  solo_promo: '49€',
};

// Prix agent addon — 3 paliers pour simplifier Stripe (3 liens seulement)
// Palier 1: 8€/mois — agents légers (Gemini, peu d'appels)
// Palier 2: 12€/mois — agents moyens (Gemini, plus d'appels)
// Palier 3: 15€/mois — agents lourds (Seedream/Sonnet, génération IA)
export const ADDON_TIER_1 = 8;
export const ADDON_TIER_2 = 12;
export const ADDON_TIER_3 = 15;

export const AGENT_ADDON_PRICES: Record<string, number> = {
  // Tier 3 (15€) — génération IA lourde
  content: ADDON_TIER_3,       // Lena — images/vidéos Seedream
  comptable: ADDON_TIER_3,     // Louis — devis/factures Sonnet

  // Tier 2 (12€) — agents avec volume d'appels moyen
  seo: ADDON_TIER_2,           // Oscar — articles SEO
  dm_instagram: ADDON_TIER_2,  // Jade — DM auto + webhook
  email: ADDON_TIER_2,         // Hugo — séquences email
  chatbot: ADDON_TIER_2,       // Max — chatbot 24/7

  // Tier 1 (8€) — agents légers
  commercial: ADDON_TIER_1,    // Léo — prospection CRM
  gmaps: ADDON_TIER_1,         // Théo — avis Google
  rh: ADDON_TIER_1,            // Sara — juridique/RH

  // Gratuits (inclus dans tout plan)
  marketing: 0,                // Ami
  onboarding: 0,               // Clara
};

// Quels agents sont disponibles en addon pour chaque plan
// = tous les agents qui ne sont PAS dans le plan du client
export function getAvailableAddons(plan: string): Array<{ agentId: string; name: string; price: number; tier: number }> {
  // Agent access per plan — higher plans unlock more agents
  // Créateur: visibility + prospection essentials (boutiques, restos, hotels)
  // Pro: + SEO, chatbot, legal (growth stage)
  // Business: + finance, LinkedIn, ads, WhatsApp (full automation)
  const CREATEUR_AGENTS = new Set(['marketing', 'onboarding', 'content', 'dm_instagram', 'email', 'commercial', 'gmaps']);
  // Pro: + SEO. Chatbot reste OFF sur Pro (réservé Business car il s'intègre sur le SITE client, lourd à supporter).
  const PRO_AGENTS = new Set([...CREATEUR_AGENTS, 'seo']);
  // Business: + chatbot Max (intégration site client). ads/rh/tiktok_comments/linkedin/whatsapp/comptable désactivés temporairement
  // le temps de peaufiner les autres agents — ils seront réactivés plus tard.
  const BUSINESS_AGENTS = new Set([...PRO_AGENTS, 'chatbot']);
  const planAgents: Record<string, Set<string>> = {
    free: new Set(['marketing', 'onboarding']),
    gratuit: new Set(['marketing', 'onboarding']),
    createur: CREATEUR_AGENTS,
    pro: PRO_AGENTS,
    fondateurs: BUSINESS_AGENTS,
    business: BUSINESS_AGENTS,
    elite: BUSINESS_AGENTS,
  };

  const AGENT_NAMES: Record<string, string> = {
    content: 'Lena (Contenu)', dm_instagram: 'Jade (DM)', email: 'Hugo (Email)',
    commercial: 'Léo (Prospection)', gmaps: 'Théo (Avis Google)', seo: 'Oscar (SEO)',
    chatbot: 'Max (Chatbot)', rh: 'Sara (RH)', comptable: 'Louis (Finance)',
  };

  const included = planAgents[plan] || planAgents.free;
  return Object.entries(AGENT_ADDON_PRICES)
    .filter(([id, price]) => price > 0 && !included.has(id))
    .map(([id, price]) => ({
      agentId: id,
      name: AGENT_NAMES[id] || id,
      price,
      tier: price === ADDON_TIER_3 ? 3 : price === ADDON_TIER_2 ? 2 : 1,
    }))
    .sort((a, b) => a.tier - b.tier);
}

// Noms affichés
export const PLAN_NAMES: Record<string, string> = {
  free: 'Gratuit',
  createur: 'Créateur',
  pro: 'Pro',
  fondateurs: 'Fondateurs Pro',
  business: 'Business',
  elite: 'Elite',
  agence: 'Agence',
  // Deprecated
  sprint: 'Sprint Fondateur',
  pro_promo: 'Pro (Promo)',
  standard: 'Standard',
  solo: 'Solo',
  solo_promo: 'Solo (Promo)',
};

// Labels lisibles pour l'historique
export const FEATURE_LABELS: Record<string, string> = {
  image_t2i: 'Image (génération)',
  image_i2i: 'Image (modification)',
  video_t2v: 'Vidéo (texte)',
  video_i2v: 'Vidéo (image)',
  video_5s: 'Vidéo 5s',
  video_10s: 'Vidéo 10s',
  video_15s: 'Vidéo 15s',
  video_30s: 'Vidéo 30s',
  video_45s: 'Vidéo 45s',
  video_60s: 'Vidéo 60s',
  video_90s: 'Vidéo 90s',
  audio_tts: 'Audio narration',
  text_suggest: 'Suggestion texte IA',
  narration_suggest: 'Suggestion narration IA',
  marketing_chat: 'Assistant marketing',
  agent_chat: 'Conversation avec un agent',
  promo_code: 'Code promo',
  monthly_reset: 'Renouvellement mensuel',
  credit_pack: 'Pack crédits',
  signup_bonus: 'Bonus inscription',
};

// Fonctionnalités gratuites (pas de crédits requis)
export const FREE_FEATURES = [
  'Dashboard',
  'Masterclass',
  'Galerie',
  'Publication réseaux sociaux',
  'Conversion vidéo',
] as const;

// Packs crédits à l'achat (plus cher que l'abonnement pour pousser vers l'abo)
// Référence : Fondateurs = 700cr/149€ = 0,21€/cr
export const CREDIT_PACKS = [
  { id: 'starter', name: 'Starter', credits: 60, price: 14.99, priceLabel: '14,99€', perCredit: '0,25€' },
  { id: 'pro', name: 'Pro', credits: 180, price: 39.99, priceLabel: '39,99€', perCredit: '0,22€' },
  { id: 'expert', name: 'Expert', credits: 400, price: 69.99, priceLabel: '69,99€', perCredit: '0,17€' },
] as const;

// Crédits offerts code promo (= Fondateurs)
export const PROMO_CODE_CREDITS = 750;

// Crédits offerts à l'inscription (6 visuels × 4cr + 1 vidéo 10s × 25cr = 49cr)
export const SIGNUP_BONUS_CREDITS = 49;

// Durée de l'essai gratuit en jours
export const FREE_TRIAL_DAYS = 7;

// Limite mode gratuit (avant inscription)
export const FREE_MONTHLY_LIMIT = 1; // 1 visuel gratuit sans compte, puis popup

// Features bloquées en mode gratuit
export const FREE_BLOCKED_FEATURES = [
  'video_t2v', 'video_i2v', 'audio_tts',
  'text_suggest', 'narration_suggest', 'marketing_chat',
] as const;

// Durées vidéo disponibles (en secondes)
export const VIDEO_DURATIONS = [5, 10, 15, 30, 45, 60, 90] as const;

/**
 * Calcule le coût en crédits d'une vidéo selon sa durée
 */
export function getVideoCreditCost(duration: number): number {
  if (duration <= 5) return 15;
  if (duration <= 10) return 25;
  if (duration <= 15) return 35;
  if (duration <= 30) return 50;
  if (duration <= 45) return 65;
  if (duration <= 60) return 80;
  return 110; // 90s
}
