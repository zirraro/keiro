// KeiroAI Chatbot Agent - Detection utilities for business type, contact info, and engagement

/**
 * Keyword patterns for business type detection.
 * Keys are category names, values are arrays of lowercase keywords.
 */
const BUSINESS_KEYWORDS: Record<string, string[]> = {
  restaurant: [
    'resto',
    'restaurant',
    'bistrot',
    'brasserie',
    'cuisine',
    'chef',
    'couvert',
    'menu',
    'plat',
  ],
  boutique: [
    'boutique',
    'magasin',
    'shop',
    'v\u00EAtement',
    'mode',
    'd\u00E9co',
    'bijoux',
  ],
  coach: [
    'coach',
    'sport',
    'fitness',
    'yoga',
    'bien-\u00EAtre',
    'salle',
    's\u00E9ance',
  ],
  coiffeur: [
    'coiffeur',
    'coiffeuse',
    'barbier',
    'barber',
    'salon',
    'coupe',
    'cheveux',
  ],
  caviste: ['vin', 'cave', 'caviste', 'fromage', 'fromagerie', '\u00E9picerie'],
  fleuriste: ['fleur', 'fleuriste', 'bouquet', 'composition'],
  traiteur: ['traiteur', '\u00E9v\u00E9nement', 'buffet', 'mariage', 's\u00E9minaire'],
};

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detects the business type from a user message by matching keywords.
 * Returns the first matching category or null.
 */
export function detectBusinessType(message: string): string | null {
  const lowered = message.toLowerCase();

  for (const [type, keywords] of Object.entries(BUSINESS_KEYWORDS)) {
    for (const keyword of keywords) {
      // Word boundary-like check: keyword must appear as a standalone token
      const pattern = `(?:^|[\\s,;.!?'"()])${escapeRegex(keyword)}(?:$|[\\s,;.!?'"()s])`;
      const regex = new RegExp(pattern, 'i');
      if (regex.test(lowered) || regex.test(` ${lowered} `)) {
        return type;
      }
    }
  }

  return null;
}

/**
 * Detects an email address in a message.
 * Returns the email string or null.
 */
export function detectEmail(message: string): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = message.match(emailRegex);
  return match ? match[0] : null;
}

/**
 * Detects a French phone number in a message (06, 07, +33).
 * Returns the phone string or null.
 */
export function detectPhone(message: string): string | null {
  const phoneRegex = /(?:\+33\s?[67]|0[67])(?:[\s.\-]?\d{2}){4}/;
  const match = message.match(phoneRegex);
  return match ? match[0] : null;
}

/**
 * Detects which plan the visitor is interested in from their message.
 * Returns 'fondateurs', 'pro', 'sprint', or null.
 */
export function detectPlanInterest(message: string): string | null {
  const lowered = message.toLowerCase();

  // Check for Fondateurs / 149
  if (lowered.includes('fondateur') || lowered.includes('149')) {
    return 'fondateurs';
  }

  // Check for Pro / 89 / 49
  if (
    /\bpro\b/.test(lowered) ||
    lowered.includes('89') ||
    /\b49\s*\u20AC?\b/.test(lowered)
  ) {
    return 'pro';
  }

  // Check for Sprint / 4.99 / tester
  if (
    lowered.includes('sprint') ||
    lowered.includes('4.99') ||
    lowered.includes('4,99') ||
    lowered.includes('tester')
  ) {
    return 'sprint';
  }

  return null;
}

/**
 * Detects if the message contains an objection or comparison.
 * Returns true if the visitor mentions cost, competitors, or free alternatives.
 */
export function detectObjection(message: string): boolean {
  const lowered = message.toLowerCase();
  const objectionKeywords = ['cher', 'budget', 'chatgpt', 'canva', 'gratuit'];
  return objectionKeywords.some((keyword) => lowered.includes(keyword));
}

/**
 * Returns a re-engagement message based on the visitor's current page,
 * time spent on that page, and whether they've already interacted.
 * Returns null if no re-engagement is needed.
 */
export function getReengagementMessage(
  currentPage: string,
  timeOnPage: number,
  hasInteracted: boolean
): string | null {
  // Never re-engage if the visitor has already interacted
  if (hasInteracted) {
    return null;
  }

  const page = currentPage.toLowerCase();

  // Homepage after 15 seconds
  if (
    (page === '/' || page === '' || page.includes('accueil')) &&
    timeOnPage > 15
  ) {
    return 'Salut ! Vous \u00EAtes commer\u00E7ant ? Je peux vous montrer en 30 secondes ce que KeiroAI fait pour les commerces du quartier \uD83D\uDE80';
  }

  // Pricing page after 10 seconds
  if (page.includes('/pricing') && timeOnPage > 10) {
    return 'Une question sur les plans ? Le Fondateurs est le plus choisi \u2014 votre logo partout, 3 formats, TikTok. Il reste des places \u00E0 149\u20AC avant le passage \u00E0 199\u20AC.';
  }

  // Generate page after 20 seconds
  if (page.includes('/generate') && timeOnPage > 20) {
    return 'Pas mal ce que vous venez de cr\u00E9er non ? \uD83D\uDE0A Imaginez \u00E7a avec VOTRE logo et vos couleurs. C\u2019est le plan Fondateurs.';
  }

  // Any page after 60 seconds
  if (timeOnPage > 60) {
    return 'Au fait, on g\u00E9n\u00E8re aussi des VID\u00C9OS pour TikTok et Instagram Reels. Aucun outil IA gratuit ne fait \u00E7a \uD83C\uDFAC';
  }

  return null;
}
