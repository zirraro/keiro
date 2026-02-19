/**
 * Système de crédits Keiro
 * Grille de coûts par fonctionnalité et crédits par plan
 */

// Coût en crédits par fonctionnalité
export const CREDIT_COSTS = {
  image_t2i: 5,
  image_i2i: 3,
  video_5s: 25,
  video_10s: 40,
  video_30s: 100,
  audio_tts: 1,
  text_suggest: 1,
  narration_suggest: 1,
  marketing_chat: 1,
} as const;

// Crédits par plan (~10% de marge sur usage réaliste)
export const PLAN_CREDITS: Record<string, number> = {
  free: 15,
  sprint: 110,
  solo: 220,
  fondateurs: 660,
  standard: 880,
  business: 1750,
  elite: 5500,
  admin: 999999,
};

// Prix des plans
export const PLAN_PRICES: Record<string, string> = {
  free: '0€',
  sprint: '4,99€',
  solo: '49€',
  fondateurs: '149€',
  standard: '199€',
  business: '349€',
  elite: '999€',
};

// Noms affichés
export const PLAN_NAMES: Record<string, string> = {
  free: 'Gratuit',
  sprint: 'Sprint Fondateur',
  solo: 'Solo',
  fondateurs: 'Fondateurs',
  standard: 'Standard',
  business: 'Business',
  elite: 'Elite',
};

// Labels lisibles pour l'historique
export const FEATURE_LABELS: Record<string, string> = {
  image_t2i: 'Image (génération)',
  image_i2i: 'Image (modification)',
  video_t2v: 'Vidéo (texte)',
  video_i2v: 'Vidéo (image)',
  audio_tts: 'Audio narration',
  text_suggest: 'Suggestion texte IA',
  narration_suggest: 'Suggestion narration IA',
  marketing_chat: 'Assistant marketing',
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

// Packs crédits à l'achat
export const CREDIT_PACKS = [
  { id: 'starter', name: 'Starter', credits: 100, price: 19, priceLabel: '19€', perCredit: '0,19€' },
  { id: 'pro', name: 'Pro', credits: 300, price: 49, priceLabel: '49€', perCredit: '0,16€' },
  { id: 'expert', name: 'Expert', credits: 500, price: 69, priceLabel: '69€', perCredit: '0,14€' },
] as const;

// Crédits offerts code promo (= Fondateurs)
export const PROMO_CODE_CREDITS = 660;

// Crédits offerts à l'inscription
export const SIGNUP_BONUS_CREDITS = 30;

// Limite mode gratuit
export const FREE_MONTHLY_LIMIT = 3;

// Features bloquées en mode gratuit
export const FREE_BLOCKED_FEATURES = [
  'video_t2v', 'video_i2v', 'audio_tts',
  'text_suggest', 'narration_suggest', 'marketing_chat',
] as const;

/**
 * Calcule le coût en crédits d'une vidéo selon sa durée
 */
export function getVideoCreditCost(duration: number): number {
  if (duration <= 5) return CREDIT_COSTS.video_5s;
  if (duration <= 10) return CREDIT_COSTS.video_10s;
  return CREDIT_COSTS.video_30s;
}
