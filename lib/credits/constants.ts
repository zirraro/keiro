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
  video_15s: 35,
  video_30s: 50,
  video_45s: 70,
  video_60s: 85,
  video_90s: 120,
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
  solo_promo: 220,
  pro: 400,
  fondateurs: 700,
  standard: 880,
  business: 1750,
  elite: 5500,
  admin: 999999,
};

// Prix des plans
export const PLAN_PRICES: Record<string, string> = {
  free: '0€',
  sprint: '4,99€',
  solo: '89€',
  solo_promo: '89€',
  pro: '89€',
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
  solo_promo: 'Solo (Promo)',
  pro: 'Pro',
  fondateurs: 'Fondateurs Pro',
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
  { id: 'starter', name: 'Starter', credits: 50, price: 14.99, priceLabel: '14,99€', perCredit: '0,30€' },
  { id: 'pro', name: 'Pro', credits: 150, price: 39.99, priceLabel: '39,99€', perCredit: '0,27€' },
  { id: 'expert', name: 'Expert', credits: 300, price: 69.99, priceLabel: '69,99€', perCredit: '0,23€' },
] as const;

// Crédits offerts code promo (= Fondateurs)
export const PROMO_CODE_CREDITS = 700;

// Crédits offerts à l'inscription
export const SIGNUP_BONUS_CREDITS = 30;

// Limite mode gratuit
export const FREE_MONTHLY_LIMIT = 3;

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
  if (duration <= 5) return 25;
  if (duration <= 10) return 40;
  if (duration <= 15) return 35;
  if (duration <= 30) return 50;
  if (duration <= 45) return 70;
  if (duration <= 60) return 85;
  return 120; // 90s
}
