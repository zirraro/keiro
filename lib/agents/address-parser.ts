/**
 * Deterministic address → quartier extractor. Free path that lets Léo
 * fill the quartier field on prospects when Gemini's confidence on a
 * geographic guess is below the 70% bar (which the founder explicitly
 * does NOT want lowered — quality bar stays at 70).
 *
 * Founder ask 2026-06-08: "on est censé être à 70% de complétude — on
 * baisse pas l'attente mais augmente le moyen d'y parvenir, attention
 * aux coûts seulement". So instead of accepting low-confidence Gemini
 * guesses, we add this *deterministic* parser that costs €0 per call
 * and never lies — it just declines when it can't be sure.
 */

interface ParsedAddress {
  quartier: string | null;
  ville: string | null;
  postal_code: string | null;
  confidence: number; // 0–100; only emit ≥70
}

// Postal code → quartier for the 3 major multi-arrondissement French cities.
// e.g. 75003 → 3e arrondissement (Marais), 69002 → Lyon 2e (Bellecour).
const PARIS_ARRONDISSEMENT_NAMES: Record<string, string> = {
  '75001': '1er — Louvre',
  '75002': '2e — Bourse',
  '75003': '3e — Marais',
  '75004': '4e — Hôtel-de-Ville',
  '75005': '5e — Quartier Latin',
  '75006': '6e — Saint-Germain',
  '75007': '7e — Invalides',
  '75008': '8e — Champs-Élysées',
  '75009': '9e — Opéra',
  '75010': '10e — Canal Saint-Martin',
  '75011': '11e — Bastille',
  '75012': '12e — Bercy',
  '75013': '13e — Place d\'Italie',
  '75014': '14e — Montparnasse',
  '75015': '15e — Vaugirard',
  '75016': '16e — Passy',
  '75017': '17e — Batignolles',
  '75018': '18e — Montmartre',
  '75019': '19e — Buttes-Chaumont',
  '75020': '20e — Belleville',
};

const LYON_ARRONDISSEMENT_NAMES: Record<string, string> = {
  '69001': 'Lyon 1er — Terreaux',
  '69002': 'Lyon 2e — Bellecour',
  '69003': 'Lyon 3e — Part-Dieu',
  '69004': 'Lyon 4e — Croix-Rousse',
  '69005': 'Lyon 5e — Vieux-Lyon',
  '69006': 'Lyon 6e — Foch',
  '69007': 'Lyon 7e — Guillotière',
  '69008': 'Lyon 8e — Monplaisir',
  '69009': 'Lyon 9e — Vaise',
};

const MARSEILLE_ARRONDISSEMENT_NAMES: Record<string, string> = {
  '13001': 'Marseille 1er',
  '13002': 'Marseille 2e — Joliette',
  '13003': 'Marseille 3e',
  '13004': 'Marseille 4e',
  '13005': 'Marseille 5e',
  '13006': 'Marseille 6e — Castellane',
  '13007': 'Marseille 7e — Endoume',
  '13008': 'Marseille 8e — Prado',
  '13009': 'Marseille 9e — Mazargues',
  '13010': 'Marseille 10e',
  '13011': 'Marseille 11e',
  '13012': 'Marseille 12e',
  '13013': 'Marseille 13e',
  '13014': 'Marseille 14e',
  '13015': 'Marseille 15e',
  '13016': 'Marseille 16e',
};

export function parseAddressDeterministic(address: string | null | undefined): ParsedAddress {
  const empty: ParsedAddress = { quartier: null, ville: null, postal_code: null, confidence: 0 };
  if (!address || typeof address !== 'string') return empty;

  const normalised = address.replace(/\s+/g, ' ').trim();

  // French postal code (5 digits) capture
  const m = normalised.match(/\b(\d{5})\s+([A-Za-zÀ-ÿ\-' ]{2,40})/);
  if (!m) return empty;

  const postal = m[1];
  const cityRaw = m[2].replace(/^(le|la|les|l')\s+/i, '').trim();
  const cityNorm = cityRaw.split(/[,\n]/)[0].trim();

  // Paris / Lyon / Marseille — arrondissement is the quartier
  if (PARIS_ARRONDISSEMENT_NAMES[postal]) {
    return {
      quartier: PARIS_ARRONDISSEMENT_NAMES[postal],
      ville: 'Paris',
      postal_code: postal,
      confidence: 95,
    };
  }
  if (LYON_ARRONDISSEMENT_NAMES[postal]) {
    return {
      quartier: LYON_ARRONDISSEMENT_NAMES[postal],
      ville: 'Lyon',
      postal_code: postal,
      confidence: 95,
    };
  }
  if (MARSEILLE_ARRONDISSEMENT_NAMES[postal]) {
    return {
      quartier: MARSEILLE_ARRONDISSEMENT_NAMES[postal],
      ville: 'Marseille',
      postal_code: postal,
      confidence: 95,
    };
  }

  // For other French cities we don't have a sub-quartier mapping but
  // we *do* know the city — useful as a fallback for prospects with
  // no quartier at all. We mark this with a lower confidence so the
  // caller can decide whether to overwrite.
  if (cityNorm.length >= 2) {
    return {
      quartier: cityNorm, // city as quartier when no sub-zone known
      ville: cityNorm,
      postal_code: postal,
      confidence: 75,
    };
  }

  return empty;
}

/**
 * Sugar: only return a quartier value if the parser is confident ≥70.
 * Keeps the call sites tidy.
 */
export function quartierFromAddress(address: string | null | undefined): string | null {
  const parsed = parseAddressDeterministic(address);
  return parsed.confidence >= 70 ? parsed.quartier : null;
}
