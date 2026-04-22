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
  freelance: ['freelance', 'consultant', 'ind\u00E9pendant', 'd\u00E9veloppeur', 'designer', 'photographe', 'copywriter', 'r\u00E9dacteur', 'graphiste', 'formateur', 'cr\u00E9ateur'],
  services: ['plombier', '\u00E9lectricien', 'chauffagiste', 'menuisier', 'artisan', 'serrurier', 'peintre', 'carreleur', 'ma\u00E7on', 'couvreur'],
  professionnel: ['avocat', 'notaire', 'comptable', 'expert-comptable', 'm\u00E9decin', 'kin\u00E9', 'ost\u00E9opathe', 'dentiste', 'th\u00E9rapeute', 'psychologue', 'pharmacien'],
  agence: ['agence', 'community manager', 'studio cr\u00E9atif', 'studio', 'agence web', 'agence marketing', 'agence com'],
  pme: ['entreprise', 'soci\u00E9t\u00E9', 'startup', 'pme', 'tpe', 'sarl', 'sas', 'eurl', 'auto-entrepreneur'],
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
 * Returns 'fondateurs', 'pro', 'free_trial', or null.
 */
export function detectPlanInterest(message: string): string | null {
  const lowered = message.toLowerCase();

  // Check for Fondateurs / 149
  if (lowered.includes('fondateur') || lowered.includes('149')) {
    return 'fondateurs';
  }

  // Check for Pro / 49
  if (
    /\bpro\b/.test(lowered) ||
    /\b49\s*\u20AC?\b/.test(lowered)
  ) {
    return 'pro';
  }

  // Check for free trial / gratuit / tester / essai
  if (
    lowered.includes('gratuit') ||
    lowered.includes('essai') ||
    lowered.includes('tester') ||
    lowered.includes('7 jours') ||
    lowered.includes('7 jours')
  ) {
    return 'free_trial';
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
  hasInteracted: boolean,
  locale: 'fr' | 'en' = 'fr'
): string | null {
  // Never re-engage if the visitor has already interacted
  if (hasInteracted) {
    return null;
  }

  const page = currentPage.toLowerCase();
  const fr = locale === 'fr';

  // Homepage after 90 seconds
  if (
    (page === '/' || page === '' || page.includes('accueil')) &&
    timeOnPage > 90
  ) {
    return fr
      ? 'Salut ! Tu cherches à créer du contenu pro pour tes réseaux sociaux ? Je peux te montrer en 30 secondes ce que KeiroAI fait \uD83D\uDE80'
      : 'Hey! Looking to create pro content for your social feeds? I can show you what KeiroAI does in 30 seconds \uD83D\uDE80';
  }

  // Pricing page after 60 seconds
  if (page.includes('/pricing') && timeOnPage > 60) {
    return fr
      ? 'Une question sur les plans ? Le Business est le plus choisi \u2014 logo partout, 3 formats, TikTok.'
      : 'Question about plans? Business is the most popular \u2014 branded everywhere, 3 formats, TikTok.';
  }

  // Generate page — DON'T interrupt, user is working (only after 3 minutes)
  if (page.includes('/generate') && timeOnPage > 180) {
    return fr
      ? 'Besoin d\u2019aide pour ta création ? Je suis là si tu as des questions \uD83D\uDE0A'
      : 'Need a hand with your creation? I\u2019m here if you have questions \uD83D\uDE0A';
  }

  // Any page after 3 minutes
  if (timeOnPage > 180) {
    return fr
      ? 'Au fait, on génère aussi des VIDÉOS pour TikTok et Instagram Reels. Aucun outil gratuit ne fait ça \uD83C\uDFAC'
      : 'By the way, we also generate VIDEOS for TikTok and Instagram Reels. No free tool does that \uD83C\uDFAC';
  }

  return null;
}
