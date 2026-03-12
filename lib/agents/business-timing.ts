/**
 * Smart Business Timing System
 * Optimal contact hours per business type and channel.
 *
 * Based on when each business type has downtime to read messages:
 * - Restaurant/bar: after service (14h-15h, avoid 11h-14h and 18h-22h)
 * - Boutique: opening or quiet hours (9h-10h, 14h-15h)
 * - Coiffeur/fleuriste: early morning before clients (8h-9h)
 * - Freelance/agence/PME: office hours mid-morning (9h30-11h)
 * - Coach/formateur: between sessions (12h-13h)
 * - Artisan/services: early morning before chantier (7h-8h) or evening (18h-19h)
 * - Professionnel (avocat, medecin): lunch break (12h30-13h30)
 *
 * All hours in Paris timezone (UTC+1 winter / UTC+2 summer).
 */

export type ContactChannel = 'email' | 'dm_instagram' | 'dm_tiktok' | 'dm_google';

interface TimingSlot {
  /** Optimal send hour (Paris time, 0-23) */
  optimalHour: number;
  /** Acceptable range start (Paris time) */
  rangeStart: number;
  /** Acceptable range end (Paris time) */
  rangeEnd: number;
  /** Best days of week (1=Mon, 7=Sun). Empty = all days. */
  bestDays: number[];
  /** Days to avoid */
  avoidDays: number[];
}

/**
 * Timing configuration per business category and channel.
 * Email: professional, can be slightly later (people check email in batches)
 * DM Instagram/TikTok: more casual, can be evenings for some types
 * DM Google: business hours only (perceived as professional)
 */
const TIMING_CONFIG: Record<string, Record<ContactChannel, TimingSlot>> = {
  restaurant: {
    email:        { optimalHour: 14, rangeStart: 14, rangeEnd: 16, bestDays: [2, 3, 4], avoidDays: [5, 6, 7] },
    dm_instagram: { optimalHour: 15, rangeStart: 14, rangeEnd: 16, bestDays: [1, 2, 3, 4], avoidDays: [5, 6] },
    dm_tiktok:    { optimalHour: 15, rangeStart: 14, rangeEnd: 16, bestDays: [1, 2, 3, 4], avoidDays: [5, 6] },
    dm_google:    { optimalHour: 14, rangeStart: 14, rangeEnd: 16, bestDays: [2, 3, 4], avoidDays: [5, 6, 7] },
  },
  boutique: {
    email:        { optimalHour: 9, rangeStart: 9, rangeEnd: 10, bestDays: [1, 2, 3, 4], avoidDays: [6, 7] },
    dm_instagram: { optimalHour: 14, rangeStart: 13, rangeEnd: 15, bestDays: [1, 2, 3, 4, 5], avoidDays: [] },
    dm_tiktok:    { optimalHour: 14, rangeStart: 13, rangeEnd: 15, bestDays: [1, 2, 3, 4, 5], avoidDays: [] },
    dm_google:    { optimalHour: 9, rangeStart: 9, rangeEnd: 11, bestDays: [1, 2, 3, 4], avoidDays: [6, 7] },
  },
  coach: {
    email:        { optimalHour: 12, rangeStart: 12, rangeEnd: 13, bestDays: [1, 2, 3, 4], avoidDays: [6, 7] },
    dm_instagram: { optimalHour: 20, rangeStart: 19, rangeEnd: 21, bestDays: [1, 2, 3, 4, 5], avoidDays: [7] },
    dm_tiktok:    { optimalHour: 20, rangeStart: 19, rangeEnd: 21, bestDays: [1, 2, 3, 4, 5], avoidDays: [7] },
    dm_google:    { optimalHour: 12, rangeStart: 12, rangeEnd: 14, bestDays: [1, 2, 3, 4], avoidDays: [6, 7] },
  },
  coiffeur: {
    email:        { optimalHour: 8, rangeStart: 8, rangeEnd: 9, bestDays: [1, 2, 3], avoidDays: [7] },
    dm_instagram: { optimalHour: 20, rangeStart: 19, rangeEnd: 21, bestDays: [1, 2, 3, 4], avoidDays: [7] },
    dm_tiktok:    { optimalHour: 20, rangeStart: 19, rangeEnd: 21, bestDays: [1, 2, 3, 4], avoidDays: [7] },
    dm_google:    { optimalHour: 8, rangeStart: 8, rangeEnd: 9, bestDays: [1, 2, 3], avoidDays: [7] },
  },
  caviste: {
    email:        { optimalHour: 10, rangeStart: 9, rangeEnd: 11, bestDays: [1, 2, 3, 4], avoidDays: [7] },
    dm_instagram: { optimalHour: 18, rangeStart: 17, rangeEnd: 19, bestDays: [1, 2, 3, 4, 5], avoidDays: [] },
    dm_tiktok:    { optimalHour: 18, rangeStart: 17, rangeEnd: 19, bestDays: [1, 2, 3, 4, 5], avoidDays: [] },
    dm_google:    { optimalHour: 10, rangeStart: 9, rangeEnd: 11, bestDays: [1, 2, 3, 4], avoidDays: [7] },
  },
  fleuriste: {
    email:        { optimalHour: 8, rangeStart: 7, rangeEnd: 9, bestDays: [1, 2, 3], avoidDays: [7] },
    dm_instagram: { optimalHour: 19, rangeStart: 18, rangeEnd: 20, bestDays: [1, 2, 3, 4], avoidDays: [7] },
    dm_tiktok:    { optimalHour: 19, rangeStart: 18, rangeEnd: 20, bestDays: [1, 2, 3, 4], avoidDays: [7] },
    dm_google:    { optimalHour: 8, rangeStart: 7, rangeEnd: 9, bestDays: [1, 2, 3], avoidDays: [7] },
  },
  traiteur: {
    email:        { optimalHour: 14, rangeStart: 14, rangeEnd: 16, bestDays: [1, 2, 3], avoidDays: [5, 6, 7] },
    dm_instagram: { optimalHour: 15, rangeStart: 14, rangeEnd: 16, bestDays: [1, 2, 3], avoidDays: [5, 6] },
    dm_tiktok:    { optimalHour: 15, rangeStart: 14, rangeEnd: 16, bestDays: [1, 2, 3], avoidDays: [5, 6] },
    dm_google:    { optimalHour: 14, rangeStart: 14, rangeEnd: 16, bestDays: [1, 2, 3], avoidDays: [5, 6, 7] },
  },
  freelance: {
    email:        { optimalHour: 10, rangeStart: 9, rangeEnd: 11, bestDays: [1, 2, 3, 4], avoidDays: [6, 7] },
    dm_instagram: { optimalHour: 12, rangeStart: 11, rangeEnd: 13, bestDays: [1, 2, 3, 4, 5], avoidDays: [7] },
    dm_tiktok:    { optimalHour: 12, rangeStart: 11, rangeEnd: 13, bestDays: [1, 2, 3, 4, 5], avoidDays: [7] },
    dm_google:    { optimalHour: 10, rangeStart: 9, rangeEnd: 11, bestDays: [1, 2, 3, 4], avoidDays: [6, 7] },
  },
  services: {
    email:        { optimalHour: 7, rangeStart: 7, rangeEnd: 8, bestDays: [1, 2, 3, 4], avoidDays: [6, 7] },
    dm_instagram: { optimalHour: 18, rangeStart: 18, rangeEnd: 20, bestDays: [1, 2, 3, 4, 5], avoidDays: [7] },
    dm_tiktok:    { optimalHour: 18, rangeStart: 18, rangeEnd: 20, bestDays: [1, 2, 3, 4, 5], avoidDays: [7] },
    dm_google:    { optimalHour: 7, rangeStart: 7, rangeEnd: 8, bestDays: [1, 2, 3, 4], avoidDays: [6, 7] },
  },
  professionnel: {
    email:        { optimalHour: 12, rangeStart: 12, rangeEnd: 14, bestDays: [2, 3, 4], avoidDays: [6, 7] },
    dm_instagram: { optimalHour: 13, rangeStart: 12, rangeEnd: 14, bestDays: [2, 3, 4], avoidDays: [6, 7] },
    dm_tiktok:    { optimalHour: 13, rangeStart: 12, rangeEnd: 14, bestDays: [2, 3, 4], avoidDays: [6, 7] },
    dm_google:    { optimalHour: 12, rangeStart: 12, rangeEnd: 14, bestDays: [2, 3, 4], avoidDays: [6, 7] },
  },
  agence: {
    email:        { optimalHour: 10, rangeStart: 9, rangeEnd: 11, bestDays: [1, 2, 3, 4], avoidDays: [6, 7] },
    dm_instagram: { optimalHour: 10, rangeStart: 9, rangeEnd: 11, bestDays: [1, 2, 3, 4, 5], avoidDays: [7] },
    dm_tiktok:    { optimalHour: 10, rangeStart: 9, rangeEnd: 11, bestDays: [1, 2, 3, 4, 5], avoidDays: [7] },
    dm_google:    { optimalHour: 10, rangeStart: 9, rangeEnd: 11, bestDays: [1, 2, 3, 4], avoidDays: [6, 7] },
  },
  pme: {
    email:        { optimalHour: 10, rangeStart: 9, rangeEnd: 11, bestDays: [2, 3, 4], avoidDays: [6, 7] },
    dm_instagram: { optimalHour: 10, rangeStart: 9, rangeEnd: 11, bestDays: [2, 3, 4], avoidDays: [6, 7] },
    dm_tiktok:    { optimalHour: 10, rangeStart: 9, rangeEnd: 11, bestDays: [2, 3, 4], avoidDays: [6, 7] },
    dm_google:    { optimalHour: 10, rangeStart: 9, rangeEnd: 11, bestDays: [2, 3, 4], avoidDays: [6, 7] },
  },
};

/**
 * Get the optimal timing for a business category and channel.
 * Returns the config or a sensible default (10h Paris, weekdays).
 */
export function getOptimalTiming(category: string, channel: ContactChannel): TimingSlot {
  return TIMING_CONFIG[category]?.[channel] ?? {
    optimalHour: 10,
    rangeStart: 9,
    rangeEnd: 11,
    bestDays: [1, 2, 3, 4],
    avoidDays: [6, 7],
  };
}

/**
 * Check if NOW (Paris time) is within the acceptable send window for a category+channel.
 */
export function isGoodTimeToContact(category: string, channel: ContactChannel): boolean {
  const timing = getOptimalTiming(category, channel);
  const parisNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const hour = parisNow.getHours();
  const dayOfWeek = parisNow.getDay() || 7; // 1=Mon...7=Sun

  if (timing.avoidDays.includes(dayOfWeek)) return false;
  if (timing.bestDays.length > 0 && !timing.bestDays.includes(dayOfWeek)) return false;
  return hour >= timing.rangeStart && hour < timing.rangeEnd;
}

/**
 * Get the cron slot ('early_morning'|'morning'|'midday'|'afternoon'|'evening')
 * that best matches the optimal hour for a category+channel.
 */
export function getOptimalCronSlot(category: string, channel: ContactChannel): string {
  const timing = getOptimalTiming(category, channel);
  const h = timing.optimalHour;
  if (h < 8) return 'early_morning';   // 7h Paris = 5h UTC (hiver) / 6h UTC (été)
  if (h < 11) return 'morning';        // 9-10h Paris = 7-8h UTC
  if (h < 14) return 'midday';         // 12-13h Paris = 10-11h UTC
  if (h < 17) return 'afternoon';      // 14-16h Paris = 12-14h UTC
  return 'evening';                     // 18-20h Paris = 16-18h UTC
}

/**
 * Filter a list of prospects to only those whose business type matches the current time slot.
 * Used by cron jobs to send at the right time for each business type.
 */
export function filterProspectsByTimingSlot(
  prospects: any[],
  channel: ContactChannel,
  getCategoryFn: (prospect: any) => string
): any[] {
  return prospects.filter(p => {
    const category = getCategoryFn(p);
    return isGoodTimeToContact(category, channel);
  });
}

/**
 * Verify prospect data quality before outreach.
 * Returns { valid: boolean, issues: string[] }.
 */
export function verifyProspectData(prospect: any): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Must have email for email outreach
  if (!prospect.email || !prospect.email.includes('@')) {
    issues.push('email_missing');
  }

  // Must have company name
  if (!prospect.company || prospect.company.trim().length < 2) {
    issues.push('company_missing');
  }

  // Must have business type
  if (!prospect.type || prospect.type.trim().length < 2) {
    issues.push('type_missing');
  }

  // Verify type consistency with company name (avoid bar/resto confusion)
  if (prospect.type && prospect.company) {
    const type = prospect.type.toLowerCase();
    const name = prospect.company.toLowerCase();

    // Common confusions to flag
    if (type.includes('restaurant') && (name.includes('bar ') || name.includes(' bar') || name.includes('pub '))) {
      issues.push('type_name_mismatch_bar_resto');
    }
    if (type.includes('boutique') && (name.includes('restaurant') || name.includes('resto') || name.includes('brasserie'))) {
      issues.push('type_name_mismatch_boutique_resto');
    }
    if (type.includes('coiffeur') && (name.includes('bar') || name.includes('restaurant'))) {
      issues.push('type_name_mismatch_coiffeur');
    }
  }

  // City should be present for personalization
  if (!prospect.quartier && !prospect.city && !prospect.ville) {
    issues.push('location_missing');
  }

  // Email should not be generic (info@, contact@, etc.) — less likely to convert
  if (prospect.email) {
    const localPart = prospect.email.split('@')[0].toLowerCase();
    if (['info', 'contact', 'admin', 'webmaster', 'noreply', 'no-reply'].includes(localPart)) {
      issues.push('generic_email');
    }
  }

  // Don't contact dead/lost prospects
  if (prospect.temperature === 'dead' || prospect.status === 'perdu') {
    issues.push('prospect_dead');
  }

  // Already a client
  if (prospect.status === 'client' || prospect.status === 'sprint') {
    issues.push('already_client');
  }

  // type_missing is NOT blocking — getSequenceForProspect() defaults to 'pme' when type is null
  // location_missing and generic_email are warnings only
  const blockingIssues = ['email_missing', 'company_missing', 'prospect_dead', 'already_client'];
  const hasBlockingIssue = issues.some(i => blockingIssues.includes(i));

  return {
    valid: !hasBlockingIssue,
    issues,
  };
}
