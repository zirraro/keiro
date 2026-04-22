/**
 * Adaptive content publication frequency.
 *
 * Fixed daily post quotas (`posts_per_day_ig = 3`) made sense for a demo
 * but don't hold when the customer's whole credit budget has to serve
 * content + DMs + chatbot + video + TTS. A Créateur (400 cr/mo) who
 * publishes 3×/day on image posts (12 cr/day = 360 cr) blows 90% of their
 * monthly allowance on content alone and starves every other agent.
 *
 * So we shift from daily gate to a WEEKLY TARGET per plan, adaptive to:
 *   - plan baseline (Créateur 5, Pro 10, Business 18, Elite 25 posts/week)
 *   - credits remaining vs. expected month-to-date burn
 *   - how much the OTHER agents are already consuming
 *
 * The scheduler calls `getWeeklyContentTarget()` before firing a slot.
 * If posts already published this week >= target, the slot is skipped.
 * This way every agent shares the credit pie adaptively instead of a
 * fixed lane eating it all.
 */

export type ContentPlan = 'free' | 'createur' | 'pro' | 'fondateurs' | 'business' | 'elite' | 'agence' | 'admin';

/**
 * Baseline weekly targets per plan. Matches the "promised cadence" of each
 * tier while leaving room for DMs/emails/chatbot/video on the same budget.
 *
 * Créateur 5/week × ~10 cr (mix image post + carousel) = 50 cr/week = 200
 * cr/month ≈ 50% of allowance. Other 50% goes to DM enrichment, video (5
 * vids max per month), emails, CRM scoring, daily analytics.
 */
export const WEEKLY_BASELINE: Record<string, number> = {
  free: 0,
  createur: 5,
  pro: 10,
  fondateurs: 18,
  business: 18,
  elite: 25,
  agence: 35,
  admin: 35,
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
 *   Target/7 rounded up, capped at 3 (max slots the cron fires per day).
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
  const dailyCap = Math.min(3, Math.max(1, Math.ceil(weeklyTarget / 7)));

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
