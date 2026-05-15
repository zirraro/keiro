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
  // ── Founder rule (15 mai 2026): chaque plan doit permettre de
  // publier 3-4 vidéos TikTok par semaine (2× 15s + 1× 30s minimum)
  // qu'on réutilise en Reel Instagram (donc 1 génération = 2 publi).
  // Plus images génération pour les jours sans video. Marges 80%
  // visées sur l'agrégat — légèrement moins acceptable pour les
  // plans bas si ça permet d'aligner la promesse client.
  //
  // Calcul Créateur (49€) :
  //   3 vids/sem × 4 = 12 vids/mois (2× 15s + 1× 30s par sem)
  //   = (8 × 35) + (4 × 50) = 280 + 200 = 480 cr de vidéos
  //   + ~30 images supp (i2i sur photos client) × 3 = 90 cr
  //   + agent_chat + suggestions = 30 cr
  //   ≈ 600 cr budget mensuel
  createur: {
    images_per_month: 60,
    videos_per_month: 12,           // 3 vids/sem × 4 sem
    video_max_seconds: 30,          // 30s max (relaxed from 15s)
    tts_minutes_per_month: 15,
    dms_per_day: 50,
    chatbot_sessions_per_day: 0,    // Max not included on Créateur
    agent_chat_free_per_month: 15,
  },
  // Pro (99€) : 4 vids/sem × 4 = 16 vids/mois en mix 15s/30s/45s
  //   = (8 × 35) + (6 × 50) + (2 × 65) = 280 + 300 + 130 = 710 cr
  //   + 60 images supp × 3 = 180 cr
  //   + actions agents = 60 cr
  //   ≈ 950-1000 cr budget. Plan size = 1500 pour confort.
  pro: {
    images_per_month: 150,
    videos_per_month: 18,           // 4-5 vids/sem
    video_max_seconds: 45,
    tts_minutes_per_month: 45,
    dms_per_day: 100,
    chatbot_sessions_per_day: 20,
    agent_chat_free_per_month: 20,
  },
  fondateurs: {
    images_per_month: 300,
    videos_per_month: 28,
    video_max_seconds: 60,
    tts_minutes_per_month: 90,
    dms_per_day: 200,
    chatbot_sessions_per_day: 60,
    agent_chat_free_per_month: 25,
  },
  // Business (199€) — anciennement Elite. Multi-account 1+5,
  // tous les agents inclus, vidéos longues.
  business: {
    images_per_month: 400,
    videos_per_month: 35,
    video_max_seconds: 90,
    tts_minutes_per_month: 180,
    dms_per_day: 300,
    chatbot_sessions_per_day: 100,
    agent_chat_free_per_month: 30,
  },
  // Elite plan retired May 15 2026 — kept here for legacy users who
  // were grandfathered in. New signups go through Business or Sur
  // devis (agence). Quotas mirror Business + agence headroom.
  elite: {
    images_per_month: 999999,
    videos_per_month: 200,
    video_max_seconds: 90,
    tts_minutes_per_month: 300,
    dms_per_day: 500,
    chatbot_sessions_per_day: 999999,
    agent_chat_free_per_month: 40,
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

// Crédits par plan — Grille mai 2026 (rev pour cadence vidéo TikTok)
// Logique : chaque plan doit financer 3-4 vidéos TikTok par semaine
// (réutilisées en Reels Instagram, donc 1 generation = 2 publications)
// + des images supplémentaires + les actions des agents inclus.
// Marge cible ~80% sur agrégat. Voir PLAN_QUOTAS pour le détail.
export const PLAN_CREDITS: Record<string, number> = {
  free: 20,
  createur: 600,       // ~3 vids/sem + 60 images = ~600 cr
  pro: 1500,           // ~4-5 vids/sem + 150 images + actions = ~1500 cr
  fondateurs: 2500,    // Tier intermédiaire (early adopters)
  business: 3500,      // ~5+ vids/sem + 400 images + multi-account
  elite: 6000,         // Plan retiré pour les nouveaux signups — kept for legacy
  agence: 999999,      // Sur devis — illimité
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

// Agent addon prices — May 2026 consolidation.
// Oscar (seo) absorbed by Théo, Sara/Max/Louis admin_only, Emma/Axel
// absorbed by Jade. The remaining sellable addon roster is now:
// Léna, Jade, Hugo, Léo, Théo. Ami & Clara stay free across all plans.
export const AGENT_ADDON_PRICES: Record<string, number> = {
  // Tier 3 (15€) — génération IA lourde
  content: ADDON_TIER_3,       // Léna — images/vidéos Seedream sur 3 réseaux

  // Tier 2 (12€) — agents avec volume d'appels moyen
  dm_instagram: ADDON_TIER_2,  // Jade — DM + comments + engagement (IG/TT/LI)
  email: ADDON_TIER_2,         // Hugo — séquences email + classification
  gmaps: ADDON_TIER_2,         // Théo — réputation + SEO (absorbe Oscar)

  // Tier 1 (8€) — agents légers
  commercial: ADDON_TIER_1,    // Léo — prospection CRM

  // Gratuits (inclus dans tout plan, y compris gratuit)
  marketing: 0,                // Ami
  onboarding: 0,               // Clara
};

/**
 * Per-plan included agent set. The founder rule (May 2026) is that
 * any client can buy missing agents 1-by-1 starting from Créateur up
 * to the next tier — so Créateur clients can grab Léna or Théo as an
 * addon without upgrading to Pro.
 *
 * Créateur — 2 free + 1 paid agent of choice already inside (Jade by
 *   default for DM revenue). Other paid agents available as addons.
 * Pro — all 5 paid agents + 2 free. Multi-network publishing unlocked.
 * Business — same agents + multi-account, higher quotas, dedicated
 *   support. Anciennement Elite.
 */
export function getAvailableAddons(plan: string): Array<{ agentId: string; name: string; price: number; tier: number }> {
  const FREE_AGENTS = new Set(['marketing', 'onboarding']);
  // Créateur : DM included, others optional addons
  const CREATEUR_AGENTS = new Set([...FREE_AGENTS, 'content']);
  // Pro : all paid agents
  const PRO_AGENTS = new Set([...CREATEUR_AGENTS, 'dm_instagram', 'email', 'commercial', 'gmaps']);
  // Business = Pro + multi-account + multi-platform support
  const BUSINESS_AGENTS = new Set([...PRO_AGENTS]);

  const planAgents: Record<string, Set<string>> = {
    free: FREE_AGENTS,
    gratuit: FREE_AGENTS,
    createur: CREATEUR_AGENTS,
    pro: PRO_AGENTS,
    fondateurs: BUSINESS_AGENTS,
    business: BUSINESS_AGENTS,
    elite: BUSINESS_AGENTS,
  };

  const AGENT_NAMES: Record<string, string> = {
    content: 'Léna (Contenu IG/TT/LI)',
    dm_instagram: 'Jade (DM, comments, engagement)',
    email: 'Hugo (Email)',
    commercial: 'Léo (Prospection)',
    gmaps: 'Théo (Réputation + SEO)',
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
