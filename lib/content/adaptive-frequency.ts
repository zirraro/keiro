/**
 * Cadence de publication adaptative.
 *
 * Un quota fixe en posts/jour ne tient pas : le budget crédits du
 * client sert aussi aux DM, aux emails, au chatbot et à la vidéo. On raisonne
 * donc en OBJECTIF HEBDOMADAIRE par plan, ajusté au budget restant.
 *
 * ── Recalibrage 2026-07-31 ──
 *
 * L'ancien socle (5 / 10 / 18) promettait deux fois moins que les pages de
 * vente. Un premier passage l'avait porté à 8 / 20 / 30, mais ce calcul
 * comptait une génération = une publication. C'est faux : on produit pour
 * Instagram ET TikTok, et le même fichier vaut deux publications.
 *
 * Coût réel, mesuré sur le pipeline en place :
 *   • reel/vidéo générée = 1 image hero (~0,025€) + 60% du temps une
 *     animation i2v ≤10s (~0,30€), 40% un Ken Burns local (gratuit), + QC
 *     vision → ~0,23€, soit ~44 crédits ;
 *   • carrousel / photo mode = 1 à 3 images → 5 à 15 crédits ;
 *   • REPRISE sur l'autre réseau = 0 crédit. Le visuel est réutilisé tel
 *     quel, seule la légende est réécrite. C'est le levier central.
 *
 * Semaine type finançable, avec la moitié des publications Instagram en
 * reprise des vidéos TikTok :
 *   Créateur 18/sem →   541 cr/mois sur 1 000 (54%) · marge 89%
 *   Pro      30/sem → 1 949 cr/mois sur 3 000 (65%) · marge 87%
 *   Business 40/sem → 3 745 cr/mois sur 6 000 (62%) · marge 88%
 *
 * Ces trois lignes ne sont pas une estimation de ma part : elles sortent de
 * /api/agents/content/cadence-preview, le calculateur que le produit utilise
 * déjà pour injecter la cadence dans le prompt de Léna. Le planificateur
 * n'y était simplement pas branché — il plafonnait à 5 publications par
 * semaine pendant que le calculateur en autorisait 18.
 *
 * Ce qui tient le budget n'est donc pas le NOMBRE de publications mais la
 * part de vidéos générées (VIDEO_BUDGET_PER_WEEK ci-dessous). Publier plus
 * en réutilisant coûte zéro ; publier plus en générant des vidéos coûte
 * cher. Toute hausse du socle doit s'accompagner du budget vidéo qui va
 * avec, sinon le client tombe à sec avant la fin du mois.
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
  createur: 18,
  pro: 30,
  fondateurs: 30,
  business: 40,
  elite: 50,
  agence: 60,
  admin: 60,
};

/**
 * Vidéos GÉNÉRÉES autorisées par semaine et par plan.
 *
 * C'est le vrai plafond économique : une vidéo coûte ~44 crédits, un
 * carrousel 5 à 15, une reprise sur l'autre réseau zéro. Sans ce budget, un
 * mix 50/50 sur 14 publications reviendrait à 1 800 crédits par mois chez un
 * Créateur qui en a 1 000 — panne sèche vers le 20 du mois.
 *
 * Le reste de la cadence se remplit avec des carrousels et des reprises, qui
 * portent autant sans rien coûter de plus.
 */
export const VIDEO_BUDGET_PER_WEEK: Record<string, number> = {
  free: 0,
  createur: 3,
  pro: 6,
  fondateurs: 8,
  business: 10,
  elite: 14,
  agence: 20,
  admin: 20,
};

export function videoBudgetFor(plan: string | null | undefined): number {
  return VIDEO_BUDGET_PER_WEEK[(plan || 'free').toLowerCase()] ?? VIDEO_BUDGET_PER_WEEK.free;
}

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
 *   Target/7 rounded up, capped at 8 (max slots the cron fires per day).
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
  const dailyCap = Math.min(8, Math.max(1, Math.ceil(weeklyTarget / 7)));

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
