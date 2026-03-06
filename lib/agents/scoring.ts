// KeiroAI Agent System - Prospect Scoring & Temperature Engine

/**
 * Scoring rules: each event or attribute adds (or subtracts) points.
 * Final score is capped between 0 and 100.
 */
const SCORING_RULES: Record<string, number> = {
  source_website_chatbot: 20,
  source_chatbot_lead: 30,
  source_crm_import: 5,
  email_opened: 10,
  email_opened_step2: 15,
  email_clicked: 25,
  email_replied: 50,
  visited_pricing: 15,
  visited_generate: 20,
  started_free_trial: 40,
  type_boutique: 10,
  type_coach: 10,
  type_barbershop: 8,
  type_traiteur: 8,
  type_restaurant_soir: 5,
  type_caviste: 5,
  type_fleuriste: 5,
  type_boulangerie: -5,
  type_cafe: -10,
};

/**
 * ROI phrases per business category, used in emails and chatbot.
 */
const ROI_PHRASES: Record<string, string> = {
  restaurant:
    '5 couverts en plus par mois et votre abonnement est rentabilis\u00E9. Tout le reste, c\u2019est du profit pur.',
  boutique:
    'UNE vente en plus par mois. Une seule. Et votre abonnement est rembours\u00E9.',
  coach:
    'UNE s\u00E9ance en plus et c\u2019est rembours\u00E9. Et un client coaching reste en moyenne 8 \u00E0 12 mois.',
  coiffeur:
    '3 coupes en plus par mois. Un client fid\u00E8le en coiffure, c\u2019est 1000\u20AC sur 2 ans.',
  caviste:
    '2 paniers en plus. Avant No\u00EBl, 1 post bien fait = 10 commandes minimum.',
  fleuriste:
    '2 bouquets en plus par mois. Et la f\u00EAte des m\u00E8res ? C\u2019est le jackpot.',
  traiteur:
    '1 contrat \u00E9v\u00E9nementiel en plus et c\u2019est pay\u00E9 pour 6 mois.',
};

/**
 * Mapping from business type to email sequence category.
 */
const SEQUENCE_MAP: Record<string, string> = {
  restaurant: 'restaurant',
  resto: 'restaurant',
  bistrot: 'restaurant',
  brasserie: 'restaurant',
  boutique: 'boutique',
  magasin: 'boutique',
  shop: 'boutique',
  coach: 'coach',
  fitness: 'coach',
  yoga: 'coach',
  coiffeur: 'coiffeur',
  coiffeuse: 'coiffeur',
  barbier: 'coiffeur',
  barber: 'coiffeur',
  barbershop: 'coiffeur',
  caviste: 'caviste',
  cave: 'caviste',
  fromagerie: 'caviste',
  fleuriste: 'fleuriste',
  fleur: 'fleuriste',
  traiteur: 'traiteur',
};

/**
 * Calculate a prospect's score (0-100) based on their attributes and events.
 * Reads from prospect.source, prospect.type, prospect.events (array of event strings),
 * and prospect.pages_visited (array of page paths).
 */
export function calculateScore(prospect: any): number {
  let score = 0;

  // Source-based scoring
  if (prospect.source === 'chatbot') {
    score += SCORING_RULES.source_website_chatbot;
  }
  if (prospect.email && prospect.source === 'chatbot') {
    score += SCORING_RULES.source_chatbot_lead;
  }
  if (prospect.source === 'import') {
    score += SCORING_RULES.source_crm_import;
  }

  // Email engagement scoring
  const events: string[] = prospect.events ?? [];
  for (const event of events) {
    if (event === 'email_opened') score += SCORING_RULES.email_opened;
    if (event === 'email_opened_step2') score += SCORING_RULES.email_opened_step2;
    if (event === 'email_clicked') score += SCORING_RULES.email_clicked;
    if (event === 'email_replied') score += SCORING_RULES.email_replied;
    if (event === 'visited_pricing') score += SCORING_RULES.visited_pricing;
    if (event === 'visited_generate') score += SCORING_RULES.visited_generate;
    if (event === 'started_free_trial') score += SCORING_RULES.started_free_trial;
  }

  // Pages visited scoring (fallback if events not populated)
  const pagesVisited: string[] = prospect.pages_visited ?? [];
  if (
    !events.includes('visited_pricing') &&
    pagesVisited.some((p: string) => p.includes('/pricing'))
  ) {
    score += SCORING_RULES.visited_pricing;
  }
  if (
    !events.includes('visited_generate') &&
    pagesVisited.some((p: string) => p.includes('/generate'))
  ) {
    score += SCORING_RULES.visited_generate;
  }

  // Business type scoring
  const bizType = (prospect.type ?? '').toLowerCase();
  if (
    bizType.includes('boutique') ||
    bizType.includes('magasin') ||
    bizType.includes('shop')
  ) {
    score += SCORING_RULES.type_boutique;
  } else if (
    bizType.includes('coach') ||
    bizType.includes('fitness') ||
    bizType.includes('yoga')
  ) {
    score += SCORING_RULES.type_coach;
  } else if (
    bizType.includes('barber') ||
    bizType.includes('barbier') ||
    bizType.includes('barbershop')
  ) {
    score += SCORING_RULES.type_barbershop;
  } else if (bizType.includes('traiteur')) {
    score += SCORING_RULES.type_traiteur;
  } else if (
    bizType.includes('restaurant') ||
    bizType.includes('resto') ||
    bizType.includes('bistrot')
  ) {
    score += SCORING_RULES.type_restaurant_soir;
  } else if (bizType.includes('caviste') || bizType.includes('cave')) {
    score += SCORING_RULES.type_caviste;
  } else if (bizType.includes('fleuriste') || bizType.includes('fleur')) {
    score += SCORING_RULES.type_fleuriste;
  } else if (
    bizType.includes('boulangerie') ||
    bizType.includes('boulanger')
  ) {
    score += SCORING_RULES.type_boulangerie;
  } else if (bizType.includes('caf\u00E9') || bizType.includes('cafe')) {
    score += SCORING_RULES.type_cafe;
  }

  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

/**
 * Determine temperature label from a numeric score.
 */
export function calculateTemperature(score: number): 'cold' | 'warm' | 'hot' {
  if (score >= 51) return 'hot';
  if (score >= 26) return 'warm';
  return 'cold';
}

/**
 * Recalculate a prospect's score after a new event, and return
 * the updated score and temperature.
 */
export function recalculateProspect(
  prospect: any,
  event: string
): { score: number; temperature: string } {
  // Ensure events array exists and append the new event
  const updatedProspect = {
    ...prospect,
    events: [...(prospect.events ?? []), event],
  };

  const score = calculateScore(updatedProspect);
  const temperature = calculateTemperature(score);

  return { score, temperature };
}

/**
 * Determine which email sequence category to use for a prospect
 * based on their business type.
 * Falls back to 'boutique' if no match is found.
 */
export function getSequenceForProspect(prospect: any): string {
  const bizType = (prospect.type ?? '').toLowerCase().trim();

  // Direct match
  if (SEQUENCE_MAP[bizType]) {
    return SEQUENCE_MAP[bizType];
  }

  // Partial match
  for (const [keyword, category] of Object.entries(SEQUENCE_MAP)) {
    if (bizType.includes(keyword)) {
      return category;
    }
  }

  // Default fallback
  return 'boutique';
}

/**
 * Get the ROI phrase for a given email category.
 * Falls back to the boutique phrase if category is unknown.
 */
export function getROIPhrase(category: string): string {
  return ROI_PHRASES[category] ?? ROI_PHRASES.boutique;
}
