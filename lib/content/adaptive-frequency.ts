/**
 * Cadence de publication adaptative.
 *
 * Un quota fixe en posts/jour ne tient pas : le budget crédits du
 * client sert aussi aux DM, aux emails, au chatbot et à la vidéo. On raisonne
 * donc en OBJECTIF HEBDOMADAIRE par plan, ajusté au budget restant.
 *
 * ── Recalibrage 2026-07-31 (demande fondateur : « vérifie la grille des
 * crédits et nos crédits dits en page accueil et tarifs avec nos marges ») ──
 *
 * L'ancien socle (5 / 10 / 18) promettait deux fois moins que les pages de
 * vente (10 / 20 / 30 par semaine). Le client payait pour une cadence qu'il
 * ne recevait pas — le pire des deux mondes, puisque le pool de crédits, lui,
 * pouvait la financer.
 *
 * Coût réel d'un post, mesuré sur le pipeline en place :
 *   • reel  = 1 image hero générée (~0,025€) + 60% du temps une animation i2v
 *             ≤10s (~0,30€), 40% du temps un Ken Burns local (gratuit) + QC
 *             vision → ~0,23€ en moyenne, soit ~44 crédits débités ;
 *   • post/carrousel = 1 à 3 images (~0,06€) → 5 à 15 crédits.
 *
 * Au mix 50/50 réel, à la cadence annoncée :
 *   Créateur  8/sem  → ~930 cr sur 1 000 (93%)  · marge ≈ 78%
 *   Pro      20/sem  → ~2 540 cr sur 3 000 (85%) · marge ≈ 81%
 *   Business 30/sem  → ~3 840 cr sur 6 000 (64%) · marge ≈ 82%
 *
 * Créateur est plafonné à 8 et non 10 : à 10, la consommation dépasse le pool
 * vers le 26 du mois et le client tombe en panne sèche avant la fin. Mieux
 * vaut promettre 8 et les tenir.
 *
 * Le multiplicateur ci-dessous protège ensuite le pool au cas par cas.
 */
export type ContentPlan = 'free' | 'createur' | 'pro' | 'fondateurs' | 'business' | 'elite' | 'agence' | 'admin';

/**
 * Socle hebdomadaire par plan — c'est ce chiffre que les pages de vente
 * annoncent. Toute modification ici doit être répercutée dans les textes
 * (lib/i18n/translations) et inversement : deux chiffres différents, c'est
 * une promesse non tenue.
 */
export const WEEKLY_BASELINE: Record<string, number> = {
  free: 0,
  createur: 8,
  pro: 20,
  fondateurs: 25,
  business: 30,
  elite: 35,
  agence: 42,
  admin: 42,
};

export type AdaptiveContext = {
  plan: string;
  creditsBalance: number;
  creditsAllowance: number;
  creditsUsedThisMonth: number;
  dayOfMonth: number;   // 1..31
  daysInMonth: number;  // 28..31
};

export type AdaptiveResult = {
  weeklyTarget: number;
  dailyCap: number;      // 0, 1, 2, or 3 — max slots per day allowed
  multiplier: number;    // applied to baseline
  reason: string;
};

/**
 * Compute the adaptive weekly target + daily cap given current credit state.
 *
 * Multiplier logic:
 *   - lowBalance  (< 15% remaining)   → 0.5 (protect remaining credits)
 *   - overspend   (burn > 130% pace)  → 0.7 (slow down)
 *   - underspend  (burn < 60% pace)   → 1.30 (room to boost)
 *   - else                             → 1.0 (baseline)
 *
 * Daily cap:
 *   Target/7 rounded up, capped at 6 (max slots the cron fires per day).
 */
export function getWeeklyContentTarget(ctx: AdaptiveContext): AdaptiveResult {
  const baseline = WEEKLY_BASELINE[ctx.plan] ?? WEEKLY_BASELINE.free;
  if (baseline === 0) {
    return { weeklyTarget: 0, dailyCap: 0, multiplier: 0, reason: 'plan_has_no_auto_content' };
  }

  const allowance = ctx.creditsAllowance || 1;
  const progressRatio = Math.max(0.05, Math.min(1, ctx.dayOfMonth / ctx.daysInMonth));
  const expectedBurn = allowance * progressRatio;
  const burnRatio = ctx.creditsUsedThisMonth / Math.max(1, expectedBurn);
  const balanceRatio = ctx.creditsBalance / allowance;

  let multiplier = 1;
  let reason = 'baseline';

  if (balanceRatio < 0.15) {
    multiplier = 0.5;
    reason = 'low_credits';
  } else if (burnRatio > 1.3) {
    multiplier = 0.7;
    reason = 'overspend_pace';
  } else if (burnRatio < 0.6 && balanceRatio > 0.4) {
    multiplier = 1.3;
    reason = 'underspend_boost';
  }

  const weeklyTarget = Math.max(1, Math.round(baseline * multiplier));
  const dailyCap = Math.min(6, Math.max(1, Math.ceil(weeklyTarget / 7)));

  return { weeklyTarget, dailyCap, multiplier, reason };
}

/**
 * Convert a weekly target to an explicit daily cap, which the scheduler
 * uses to decide whether to skip the midday/evening slot for a specific
 * call. Preserves the existing `posts_per_day_ig` gate semantics:
 *   dailyCap < 2 → skip midday
 *   dailyCap < 3 → skip evening
 */
export function shouldRunSlot(slotType: 'morning' | 'midday' | 'evening', dailyCap: number): boolean {
  if (dailyCap <= 0) return false;
  if (slotType === 'morning') return true;
  if (slotType === 'midday') return dailyCap >= 2;
  if (slotType === 'evening') return dailyCap >= 3;
  return false;
}
