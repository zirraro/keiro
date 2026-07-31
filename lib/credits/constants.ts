/**
 * Système de crédits Keiro
 * Grille de coûts par fonctionnalité et crédits par plan
 */

// Coût en crédits par fonctionnalité
// Founder rule 2026-06-09: "augmenter le cout des generations video/
// images certainement" — l'ancien ratio image/video ne reflétait pas
// la réalité économique (vidéo = 7x plus cher en € que image, le
// crédit doit suivre).
//
// Nouveau pricing reflète : 1 crédit ≈ 0,01€ de coût réel.
//   - image_t2i Seedream → 0.045€ → 5 cr
//   - video Seedance 5s  → 0.31€  → 35 cr (×7 vs image)
//   - video 10s          → 0.55€  → 60 cr
//   - video 15s          → 0.83€  → 90 cr
//   - video 30s          → 1.65€  → 165 cr (mais cap 130 pour offrir
//                                              un sweet-spot client)
//
// Conséquence : la courbe slider mix devient monotone (plus de
// vidéo = plus de crédits consommés) et l'upsell se déclenche
// vraiment quand le client pousse vers vidéo.
export const CREDIT_COSTS = {
  // image_t2i ratio cr/€ ≈ 110, video_5s ratio ≈ 129 → video plus
  // "premium" en crédits que image → courbe slider monotone (plus
  // de vidéo = plus de crédits consommés).
  image_t2i: 5,
  image_i2i: 4,
  video_5s: 40,        // 0.31€ → 40 cr (ratio 129 cr/€)
  video_10s: 65,       // 0.55€ → 65 cr (ratio 118 cr/€)
  video_15s: 95,       // 0.83€ → 95 cr
  video_30s: 140,      // 1.65€ → 140 cr
  video_45s: 185,
  video_60s: 235,
  video_90s: 320,
  audio_tts: 3,
  // Recherche prospection Google (Léo) : refacture le coût Places API au client.
  // ~0,017€/prospect × ratio 110 cr/€ ≈ 2 cr → 3 cr/prospect (coût + marge).
  // Utilisé comme coût PAR PROSPECT importé (via costOverride = N × 3).
  prospection_search: 3,
  text_suggest: 1,
  narration_suggest: 1,
  marketing_chat: 1,
  agent_chat: 1,
  review_email_notify: 1, // notif email "nouvel avis Google + réponse Théo" (opt-in client)
} as const;

/**
 * Free agent-chat quota: every user gets N free messages per agent per month
 * before 1 credit is deducted per additional message. With tous les agents that's
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

// Crédits par plan — Grille juin 2026 (recalibrée founder ask 2026-06-09).
//
// PRINCIPE : le pool doit couvrir A) publications (valeur principale),
// B) studio édition (i2i, retouches), C) agent chat / suggestions, D)
// génération libre. Marge cible 80% sur publications, légère baisse
// acceptée si le client pousse sur les usages annexes.
//
// CRÉATEUR (49 EUR, pool 1000 cr) — calibrage 2026-06-09 :
//   Publications target (3 TT reels 5s + 1 IG reel 5s + 1 IG/jour) :
//     - 13 TT vids/mois × 15 cr (video_5s) = 195 cr
//     - 4 IG reels/mois × 15 cr             = 60 cr
//     - 30 IG posts/mois × 4 cr             = 120 cr
//     - Stories recycle (gratuit)           = 0 cr
//     ≈ 375 cr publications (37.5% du pool)
//   Reste 625 cr pour studio, chat, gen libre.
//   Coût réel publi : ~6.62 EUR/mois + 1.50 briefs + 1.94 fixes = ~10.06
//   Marge : (49 - 10.06) / 49 ≈ 80.5% ✓
//
// PRO (99 EUR, pool 2000 cr) :
//   4 TT vids/sem en 10s (25 cr) = 17 × 25 = 425 cr
//   2 IG reels/sem en 10s        = 9 × 25 = 225 cr
//   60 IG posts/mois             = 240 cr
//   ≈ 890 cr publications, 1110 pour annexe.
//
// BUSINESS (199 EUR, pool 4500 cr) : multi-account + vidéos 15-30s.
export const PLAN_CREDITS: Record<string, number> = {
  free: 20,
  // 2026-06-09 recalibrage après bump CREDIT_COSTS (video 5s 15→40,
  // 10s 25→65, 15s 35→95). Les pools doivent suivre pour que la
  // cadence cible reste sustainable au mix 50% (~80% pool).
  createur: 1000,      // 5s vids : 50% mix = ~990 cr (99% pool) - close → pack
  pro: 3000,           // 10s vids : 50% mix = ~2400 cr (80% pool) - confort
  fondateurs: 4000,    // tier intermédiaire
  business: 6000,      // 15s vids + multi-account
  elite: 8000,         // Legacy
  agence: 999999,      // Sur devis
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
  business: '149€',
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

// Agent addon prices.
// 2026-07-29 — Après la révision du découpage par plan, la plupart de ces
// tarifs ne correspondent plus à une vente possible : Léna, Jade, Théo, Sara
// et Louis sont inclus dès Créateur, donc il n'y a rien à leur vendre à ce
// niveau. Les seuls add-ons qui gardent un sens sont ceux d'un agent absent du
// plan du client — aujourd'hui Stella (WhatsApp, 19€, facturée séparément) et,
// pour un compte gratuit, les agents payants. On garde les tarifs ici comme
// référence de coût par agent ; c'est getAvailableAddons() qui décide ce qui
// est réellement proposé, à partir du minPlan réel.
export const AGENT_ADDON_PRICES: Record<string, number> = {
  // Tier 3 (15€) — génération IA lourde / Sonnet
  content: ADDON_TIER_3,       // Léna — images/vidéos Seedream sur 3 réseaux
  rh: ADDON_TIER_3,            // Sara — RH + juridique (Sonnet + rédaction docs brandés). Payant = couvre le coût Claude (~80% marge)

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
 * Add-ons réellement achetables pour un plan donné.
 *
 * 2026-07-29 — Réécrit. Cette fonction portait sa PROPRE table de ce que
 * contient chaque plan, en doublon de `CLIENT_AGENTS` (lib/agents/client-context).
 * Après la révision du découpage par plan du 25/07, les deux avaient divergé :
 * on aurait proposé à un client Créateur d'acheter Théo ou Sara qu'il possède
 * déjà. Elle dérive maintenant du `minPlan` réel — plus de doublon, donc plus
 * de dérive possible.
 *
 * Doctrine add-on (règle fondateur 29/07) : la vente à l'agent près reste
 * possible, mais elle ne doit PAS noyer les plans. On ne propose donc un
 * add-on que pour un agent réellement absent du plan, et on n'en met qu'un en
 * avant côté marketing (Stella). Le reste suit les plans.
 */
export function getAvailableAddons(
  plan: string,
  planAgents?: Array<{ id: string; minPlan: string; displayName?: string }>,
): Array<{ agentId: string; name: string; price: number; tier: number }> {
  const PLAN_ORDER = ['gratuit', 'free', 'sprint', 'solo', 'createur', 'pro', 'fondateurs', 'standard', 'business', 'elite', 'agence'];
  const userIdx = PLAN_ORDER.indexOf((plan || 'gratuit').toLowerCase());

  const AGENT_NAMES: Record<string, string> = {
    content: 'Léna (Contenu IG/TT/LI)',
    dm_instagram: 'Jade (DM, commentaires, engagement)',
    email: 'Hugo (Emails + gestion de boîte)',
    commercial: 'Léo (Prospection + CRM)',
    gmaps: 'Théo (Avis, fiche Google + SEO)',
    rh: 'Sara (RH + Juridique)',
    comptable: 'Louis (Finance)',
  };

  // Sans le roster passé en argument (contexte client-only), on ne peut pas
  // savoir ce qui est inclus : on ne propose rien plutôt que de proposer à tort.
  if (!planAgents || planAgents.length === 0) return [];

  return planAgents
    .filter(a => {
      const price = AGENT_ADDON_PRICES[a.id];
      if (!price || price <= 0) return false;                 // agent gratuit
      const requiredIdx = PLAN_ORDER.indexOf(a.minPlan);
      return requiredIdx > userIdx;                           // pas encore inclus
    })
    .map(a => {
      const price = AGENT_ADDON_PRICES[a.id];
      return {
        agentId: a.id,
        name: AGENT_NAMES[a.id] || a.displayName || a.id,
        price,
        tier: price === ADDON_TIER_3 ? 3 : price === ADDON_TIER_2 ? 2 : 1,
      };
    })
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

// Packs de crédits à l'achat — recalibrés le 2026-07-31.
//
// L'ancienne grille (0,25 à 0,17€/crédit) datait d'un temps où Fondateurs
// donnait 700 crédits pour 149€. Les pools ont été multipliés par 5 depuis
// (Créateur = 1 000 crédits pour 49€, soit 0,049€/crédit) mais pas les packs :
// on vendait donc le crédit à l'unité 5 à 6 fois le prix de l'abonnement. Pour
// un client qui vient juste de tomber en panne sèche, c'est une punition.
//
// Nouvelle règle : le pack reste PLUS CHER que l'abonnement (sinon personne ne
// s'abonne) mais dans un rapport défendable — environ 1,5× le tarif Créateur.
// Le coût réel étant d'environ 0,01€ par crédit, la marge reste au-dessus de
// 80% sur les trois paliers.
export const CREDIT_PACKS = [
  { id: 'starter', name: 'Starter', credits: 300, price: 24.99, priceLabel: '24,99€', perCredit: '0,083€' },
  { id: 'pro', name: 'Pro', credits: 800, price: 59.99, priceLabel: '59,99€', perCredit: '0,075€' },
  { id: 'expert', name: 'Expert', credits: 2000, price: 129.99, priceLabel: '129,99€', perCredit: '0,065€' },
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
 * Calcule le coût en crédits d'une vidéo selon sa durée.
 * Source de vérité : CREDIT_COSTS (mis à jour 2026-06-09 avec
 * ratio cr/€ supérieur au image_t2i pour cohérence économique).
 */
export function getVideoCreditCost(duration: number): number {
  if (duration <= 5) return CREDIT_COSTS.video_5s;
  if (duration <= 10) return CREDIT_COSTS.video_10s;
  if (duration <= 15) return CREDIT_COSTS.video_15s;
  if (duration <= 30) return CREDIT_COSTS.video_30s;
  if (duration <= 45) return CREDIT_COSTS.video_45s;
  if (duration <= 60) return CREDIT_COSTS.video_60s;
  return CREDIT_COSTS.video_90s; // 90s
}
