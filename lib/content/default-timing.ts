/**
 * Expert-recommended default posting hours per business type.
 *
 * When a client has fewer than 10 published posts, the performance
 * analyzer's `optimal_hours` is empty or low-confidence. Instead of
 * falling back to a static 9:00/13:30/20:00, we seed with what social
 * media specialists recommend for that specific vertical — the content
 * agent posts at "reasonable expert hours" from day 0, and gradually
 * drifts toward the data-driven optimal hours as the ranking confidence
 * grows (medium ≥ 10 posts, high ≥ 25).
 *
 * Sources (summarised, 2024-2025 industry benchmarks):
 *   - Restaurants: Sprout Social, Hootsuite 2024 — meal-adjacent times
 *   - Retail/Boutique: Later, Buffer 2024 — browse peaks around lunch +
 *     evening commute
 *   - Coach/Fitness: IG Creator Insights 2024 — early AM motivation +
 *     lunch + post-work
 *   - Beauty: Influencer Marketing Hub 2024 — women audience peaks
 *     mid-morning + early evening
 *   - B2B/Services: LinkedIn + Sprout — start-of-workday + lunch + late-
 *     afternoon
 *   - Freelance/Agency: mixed LinkedIn/IG, weekday pro hours
 */

export type SlotType = 'morning' | 'midday' | 'evening';

/**
 * Expert-recommended hours per business type.
 * Each slot returns 1-2 candidate hours; we pick the first as default and
 * the second as a small random variation so clients don't always post at
 * the exact same minute (which some algos down-rank for predictability).
 */
export const DEFAULT_HOURS_BY_BUSINESS_TYPE: Record<
  string,
  Record<SlotType, string[]>
> = {
  // Restaurants: drive foot traffic at meal times
  restaurant: {
    morning: ['09:30', '10:00'],
    midday: ['11:45', '12:15'],
    evening: ['18:30', '19:15'],
  },
  // Boutiques / retail: lunch browse + after-work unwind
  boutique: {
    morning: ['10:00', '10:30'],
    midday: ['12:30', '13:00'],
    evening: ['19:00', '19:30'],
  },
  // Coaches / fitness: motivation early + lunch + post-workout evening
  coach: {
    morning: ['06:45', '07:15'],
    midday: ['12:15', '12:45'],
    evening: ['18:45', '19:30'],
  },
  // Beauty / hair / esthétique: mid-morning + early evening
  coiffeur: {
    morning: ['10:15', '10:45'],
    midday: ['14:00', '14:30'],
    evening: ['18:00', '18:45'],
  },
  beauty: {
    morning: ['10:15', '10:45'],
    midday: ['14:00', '14:30'],
    evening: ['18:00', '18:45'],
  },
  // Caviste / épicerie: weekend-leaning, afternoon + early evening
  caviste: {
    morning: ['10:30', '11:00'],
    midday: ['12:30', '13:15'],
    evening: ['18:00', '19:00'],
  },
  // Fleuriste: before-lunch + late afternoon (surprise purchases)
  fleuriste: {
    morning: ['09:45', '10:30'],
    midday: ['12:15', '13:00'],
    evening: ['17:30', '18:15'],
  },
  // Traiteur / événementiel: B2B with B2C edges
  traiteur: {
    morning: ['09:00', '09:30'],
    midday: ['12:45', '13:15'],
    evening: ['18:15', '19:00'],
  },
  // Freelance / indépendants: weekday pro hours
  freelance: {
    morning: ['08:30', '09:15'],
    midday: ['12:30', '13:00'],
    evening: ['17:45', '18:30'],
  },
  // Services (plumbers, electricians, artisans)
  services: {
    morning: ['08:00', '08:30'],
    midday: ['12:00', '12:45'],
    evening: ['17:00', '18:00'],
  },
  // Professional services (lawyers, accountants, doctors)
  professionnel: {
    morning: ['08:30', '09:00'],
    midday: ['12:30', '13:00'],
    evening: ['17:30', '18:15'],
  },
  // Agencies / studios: LinkedIn + IG hybrid
  agence: {
    morning: ['09:00', '09:30'],
    midday: ['13:00', '13:30'],
    evening: ['17:30', '18:00'],
  },
  // SMBs / PME: generalist B2B
  pme: {
    morning: ['08:45', '09:15'],
    midday: ['12:45', '13:15'],
    evening: ['17:30', '18:15'],
  },
  // Hotel / hospitality: evening peaks for leisure, morning for corporate
  hotel: {
    morning: ['09:30', '10:15'],
    midday: ['13:30', '14:00'],
    evening: ['19:00', '20:00'],
  },
  // Real estate / agence immo
  immobilier: {
    morning: ['09:00', '09:30'],
    midday: ['12:30', '13:15'],
    evening: ['18:30', '19:15'],
  },
};

/**
 * Global fallback — based on Sprout Social's 2024 "best times to post on
 * Instagram" aggregate across all industries: 9:00-11:00 Tuesday-Friday
 * for reach, 12:00-14:00 for engagement, 19:00-21:00 for community.
 */
const GLOBAL_DEFAULT: Record<SlotType, string[]> = {
  morning: ['09:00', '09:30'],
  midday: ['13:00', '13:30'],
  evening: ['19:30', '20:00'],
};

/**
 * Returns the expert-recommended hour for a given business type + slot.
 * Adds a small random offset (±10 min) across the two candidate hours so
 * publications don't look mechanically identical across days.
 */
export function getDefaultOptimalHour(
  businessType: string | null | undefined,
  slotType: SlotType,
): string {
  const bt = (businessType || '').toLowerCase().trim();
  const map = DEFAULT_HOURS_BY_BUSINESS_TYPE[bt] ?? GLOBAL_DEFAULT;
  const candidates = map[slotType] || GLOBAL_DEFAULT[slotType];
  // Simple deterministic-ish pick based on the date so morning hour today
  // stays consistent across the cron's multiple internal fires (retry etc.)
  const dateSeed = new Date().getDate();
  return candidates[dateSeed % candidates.length];
}
