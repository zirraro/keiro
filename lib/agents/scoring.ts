// KeiroAI Agent System - Prospect Scoring & Temperature Engine

/**
 * Scoring rules: each event or attribute adds (or subtracts) points.
 * Final score is capped between 0 and 100.
 */
const SCORING_RULES: Record<string, number> = {
  // Source scoring
  source_website_chatbot: 20,
  source_chatbot_lead: 30,
  source_crm_import: 5,
  // Email engagement (highest value = replied)
  email_opened: 10,
  email_opened_step2: 15,
  email_clicked: 25,
  email_replied: 50,
  // Website behavior
  visited_pricing: 15,
  visited_generate: 20,
  started_free_trial: 40,
  // Business type scoring (higher = more likely to convert + higher LTV)
  type_boutique: 10,
  type_coach: 10,
  type_barbershop: 8,
  type_traiteur: 8,
  type_restaurant_soir: 5,
  type_caviste: 5,
  type_fleuriste: 5,
  type_boulangerie: 0,
  type_cafe: 0,
  type_freelance: 10,
  type_agence: 12,
  type_professionnel: 10,
  type_services: 8,
  type_pme: 10,
  // Social media presence (prospects with social = better fit for KeiroAI)
  has_instagram: 8,
  has_tiktok: 5,
  has_website: 3,
  has_google_rating: 3,
  high_google_rating: 5, // >4.0
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
  freelance: '1 client en plus gr\u00E2ce \u00E0 vos r\u00E9seaux et c\'est pay\u00E9 pour 3 mois. Le personal branding, c\'est le meilleur investissement.',
  services: '1 devis en plus par mois. Une photo avant/apr\u00E8s bien post\u00E9e = +30% de demandes.',
  professionnel: '1 consultation en plus et c\'est rembours\u00E9. L\'image de marque attire la confiance.',
  agence: '2h gagn\u00E9es par client par semaine. Contenu automatis\u00E9 = plus de clients sans embaucher.',
  pme: 'Communication corporate pro en 3 min. Marque employeur + r\u00E9seaux = recrutement et visibilit\u00E9.',
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
  freelance: 'freelance',
  consultant: 'freelance',
  ind\u00E9pendant: 'freelance',
  d\u00E9veloppeur: 'freelance',
  designer: 'freelance',
  photographe: 'freelance',
  copywriter: 'freelance',
  r\u00E9dacteur: 'freelance',
  graphiste: 'freelance',
  formateur: 'freelance',
  plombier: 'services',
  \u00E9lectricien: 'services',
  chauffagiste: 'services',
  menuisier: 'services',
  artisan: 'services',
  serrurier: 'services',
  peintre: 'services',
  carreleur: 'services',
  avocat: 'professionnel',
  notaire: 'professionnel',
  comptable: 'professionnel',
  m\u00E9decin: 'professionnel',
  kin\u00E9: 'professionnel',
  ost\u00E9opathe: 'professionnel',
  dentiste: 'professionnel',
  th\u00E9rapeute: 'professionnel',
  pharmacien: 'professionnel',
  agence: 'agence',
  'community manager': 'agence',
  studio: 'agence',
  entreprise: 'pme',
  soci\u00E9t\u00E9: 'pme',
  startup: 'pme',
  pme: 'pme',
  tpe: 'pme',
  sarl: 'pme',
  sas: 'pme',
  eurl: 'pme',
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
  } else if (bizType.includes('freelance') || bizType.includes('consultant') || bizType.includes('ind\u00E9pendant')) {
    score += SCORING_RULES.type_freelance;
  } else if (bizType.includes('agence') || bizType.includes('studio')) {
    score += SCORING_RULES.type_agence;
  } else if (bizType.includes('avocat') || bizType.includes('m\u00E9decin') || bizType.includes('comptable') || bizType.includes('notaire') || bizType.includes('kin\u00E9') || bizType.includes('dentiste')) {
    score += SCORING_RULES.type_professionnel;
  } else if (bizType.includes('plombier') || bizType.includes('\u00E9lectricien') || bizType.includes('artisan') || bizType.includes('menuisier')) {
    score += SCORING_RULES.type_services;
  } else if (bizType.includes('entreprise') || bizType.includes('pme') || bizType.includes('startup') || bizType.includes('société')) {
    score += SCORING_RULES.type_pme;
  }

  // Social media presence scoring (prospects with social = ideal KeiroAI customers)
  if (prospect.instagram) score += SCORING_RULES.has_instagram;
  if (prospect.tiktok_handle) score += SCORING_RULES.has_tiktok;
  if (prospect.website) score += SCORING_RULES.has_website;
  if (prospect.google_rating) {
    score += SCORING_RULES.has_google_rating;
    if (prospect.google_rating >= 4.0) score += SCORING_RULES.high_google_rating;
  }

  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

/**
 * Determine temperature label based on REAL engagement signals.
 * - cold: no email engagement (just imported or contacted)
 * - warm: opened at least one email (last_email_opened_at set by Brevo webhook)
 * - hot: clicked a link OR replied to an email
 * Score alone does NOT determine temperature — engagement does.
 */
export function calculateTemperature(score: number, prospect?: any): 'cold' | 'warm' | 'hot' {
  if (prospect) {
    const events: string[] = prospect.events ?? [];
    const hasClicked = events.includes('email_clicked') || !!prospect.last_email_clicked_at;
    const hasReplied = events.includes('email_replied');
    const hasOpened = events.includes('email_opened') || events.includes('email_opened_step2') || !!prospect.last_email_opened_at;
    const startedTrial = events.includes('started_free_trial');
    const visitedPricing = events.includes('visited_pricing');

    if (hasReplied || hasClicked || startedTrial) return 'hot';
    if (hasOpened || visitedPricing) return 'warm';
    return 'cold';
  }
  // Fallback for score-only calls (legacy)
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
  const temperature = calculateTemperature(score, updatedProspect);

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
  return 'pme';
}

/**
 * Get the ROI phrase for a given email category.
 * Falls back to the boutique phrase if category is unknown.
 */
export function getROIPhrase(category: string): string {
  return ROI_PHRASES[category] ?? ROI_PHRASES.pme;
}
