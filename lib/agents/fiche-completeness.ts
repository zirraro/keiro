/**
 * Type-aware fiche completeness scoring — 3-tier model.
 *
 * Founder ask 2026-05-27: "verifier ce qui est essentiel ce qu on doit
 * scrapper comme defini poour personaliser les visuels et ajouter des
 * noter personalises sur la fiche au besoin et donc ajuster le %".
 *
 * Three tiers per business type:
 *   - ESSENTIAL: what we ABSOLUTELY need to email / DM / publish (weight 70 %)
 *   - IMPORTANT: nice boosts (instagram, website, address) — weight 25 %
 *   - OPTIONAL:  cherry on top (LinkedIn for B2C, TikTok for non-creators) — 5 %
 *
 * Final pct = essentialPct*0.70 + importantPct*0.25 + optionalPct*0.05.
 *
 * A fiche with all essentials filled and no extras = 70 %.
 * Add the important ones and you reach ~95 %.
 * Add all the optionals and you reach 100 %.
 *
 * This is much more achievable than the old "everything is essential"
 * model that bottomed out around 30 % on real-world fiches.
 */

const FIELD_LABEL: Record<string, string> = {
  company: 'nom',
  email: 'email',
  type: 'secteur',
  quartier: 'ville/quartier',
  address: 'adresse',
  phone: 'téléphone',
  note_google: 'note Google',
  website: 'site web',
  instagram: 'Instagram',
  linkedin_url: 'LinkedIn',
  tiktok_handle: 'TikTok',
  first_name: 'prénom du gérant',
};

type Tiers = { essential: string[]; important: string[]; optional: string[] };

// Per-type tier mapping. Tunable based on what's typically scrapable
// per niche. Defaults reflect French local-business reality (resto/
// boutique have Google rating, phone, address; B2B has LinkedIn).
const TIERS_BY_TYPE: Record<string, Tiers> = {
  // ── Physical hospitality / retail ──
  // Essential: identité, joignabilité, géolocalisation. Insta &
  // website sont SOUHAITABLES (présents souvent, mais pas bloquants
  // si pas trouvés). LinkedIn / TikTok = optionnels.
  restaurant: {
    essential: ['company', 'type', 'quartier', 'phone', 'note_google'],
    important: ['address', 'website', 'instagram'],
    optional:  ['email', 'tiktok_handle', 'first_name', 'linkedin_url'],
  },
  bistrot: {
    essential: ['company', 'type', 'quartier', 'phone', 'note_google'],
    important: ['address', 'website', 'instagram'],
    optional:  ['email', 'tiktok_handle', 'first_name', 'linkedin_url'],
  },
  brasserie: {
    essential: ['company', 'type', 'quartier', 'phone', 'note_google'],
    important: ['address', 'website', 'instagram'],
    optional:  ['email', 'tiktok_handle', 'first_name', 'linkedin_url'],
  },
  bar: {
    essential: ['company', 'type', 'quartier', 'phone'],
    important: ['address', 'website', 'instagram', 'note_google'],
    optional:  ['email', 'tiktok_handle', 'first_name', 'linkedin_url'],
  },
  hotel: {
    essential: ['company', 'type', 'quartier', 'phone', 'website'],
    important: ['address', 'instagram', 'note_google', 'email'],
    optional:  ['tiktok_handle', 'first_name', 'linkedin_url'],
  },
  traiteur: {
    essential: ['company', 'type', 'quartier', 'phone'],
    important: ['email', 'website', 'instagram', 'address'],
    optional:  ['note_google', 'tiktok_handle', 'first_name', 'linkedin_url'],
  },
  boulangerie: {
    essential: ['company', 'type', 'quartier', 'phone'],
    important: ['address', 'note_google', 'instagram'],
    optional:  ['email', 'website', 'first_name', 'tiktok_handle', 'linkedin_url'],
  },
  patisserie: {
    essential: ['company', 'type', 'quartier', 'phone'],
    important: ['address', 'note_google', 'instagram', 'website'],
    optional:  ['email', 'first_name', 'tiktok_handle', 'linkedin_url'],
  },
  fromagerie: {
    essential: ['company', 'type', 'quartier', 'phone'],
    important: ['address', 'note_google', 'website'],
    optional:  ['email', 'instagram', 'first_name', 'tiktok_handle', 'linkedin_url'],
  },
  caviste: {
    essential: ['company', 'type', 'quartier', 'phone'],
    important: ['address', 'note_google', 'website', 'instagram'],
    optional:  ['email', 'first_name', 'tiktok_handle', 'linkedin_url'],
  },
  fleuriste: {
    essential: ['company', 'type', 'quartier', 'phone'],
    important: ['address', 'note_google', 'instagram', 'website'],
    optional:  ['email', 'first_name', 'tiktok_handle', 'linkedin_url'],
  },
  // ── Beauty / wellness ──
  coiffeur: {
    essential: ['company', 'type', 'quartier', 'phone'],
    important: ['address', 'note_google', 'website'],
    optional:  ['instagram', 'email', 'tiktok_handle', 'first_name', 'linkedin_url'],
  },
  barbier: {
    essential: ['company', 'type', 'quartier', 'phone'],
    important: ['address', 'note_google', 'instagram'],
    optional:  ['website', 'email', 'tiktok_handle', 'first_name', 'linkedin_url'],
  },
  salon_beaute: {
    essential: ['company', 'type', 'quartier', 'phone'],
    important: ['address', 'note_google', 'website', 'instagram'],
    optional:  ['email', 'first_name', 'tiktok_handle', 'linkedin_url'],
  },
  salon_de_beaute: {
    essential: ['company', 'type', 'quartier', 'phone'],
    important: ['address', 'note_google', 'website', 'instagram'],
    optional:  ['email', 'first_name', 'tiktok_handle', 'linkedin_url'],
  },
  // ── B2C services / coach / créateur ──
  coach: {
    essential: ['company', 'type', 'phone'],
    important: ['email', 'website', 'instagram'],
    optional:  ['quartier', 'address', 'first_name', 'note_google', 'tiktok_handle', 'linkedin_url'],
  },
  photographe: {
    essential: ['company', 'type', 'website'],
    important: ['email', 'instagram', 'phone'],
    optional:  ['quartier', 'first_name', 'tiktok_handle', 'linkedin_url', 'address'],
  },
  // ── B2B / professional services ──
  freelance: {
    essential: ['company', 'type', 'email', 'website'],
    important: ['phone', 'linkedin_url'],
    optional:  ['instagram', 'first_name', 'quartier', 'address', 'tiktok_handle', 'note_google'],
  },
  consultant: {
    essential: ['company', 'type', 'email', 'website'],
    important: ['phone', 'linkedin_url'],
    optional:  ['instagram', 'first_name', 'quartier', 'address', 'tiktok_handle', 'note_google'],
  },
  agence: {
    essential: ['company', 'type', 'email', 'website'],
    important: ['phone', 'linkedin_url', 'instagram'],
    optional:  ['first_name', 'quartier', 'address', 'tiktok_handle', 'note_google'],
  },
  // ── Generic / fallback ──
  services: {
    essential: ['company', 'type', 'phone'],
    important: ['email', 'website', 'address'],
    optional:  ['instagram', 'linkedin_url', 'quartier', 'first_name', 'tiktok_handle', 'note_google'],
  },
  pme: {
    essential: ['company', 'type', 'email'],
    important: ['phone', 'website', 'address'],
    optional:  ['instagram', 'linkedin_url', 'quartier', 'first_name', 'tiktok_handle', 'note_google'],
  },
  boutique: {
    essential: ['company', 'type', 'quartier', 'phone'],
    important: ['address', 'note_google', 'website', 'instagram'],
    optional:  ['email', 'first_name', 'tiktok_handle', 'linkedin_url'],
  },
};

const FALLBACK: Tiers = {
  essential: ['company', 'type', 'phone'],
  important: ['email', 'website', 'address'],
  optional:  ['instagram', 'linkedin_url', 'tiktok_handle', 'first_name', 'quartier', 'note_google'],
};

function isFilled(v: any): boolean {
  return v !== null && v !== undefined && v !== '' && v !== 'A_VERIFIER';
}

function normalizeType(type: any): string {
  return String(type || '').toLowerCase().replace(/[\s-]+/g, '_');
}

export interface Completeness {
  pct: number;
  essentialPct: number;
  importantPct: number;
  optionalPct: number;
  missingEssentials: string[];
  missingImportant: string[];
  missingOptional: string[];
  type: string;
}

/**
 * Compute completeness for a prospect using the 3-tier model.
 */
export function completeness(prospect: Record<string, any>): Completeness {
  const type = normalizeType(prospect.type);
  const cfg = TIERS_BY_TYPE[type] || FALLBACK;

  const filledIn = (keys: string[]) => keys.filter(k => isFilled(prospect[k])).length;
  const missingIn = (keys: string[]) =>
    keys.filter(k => !isFilled(prospect[k])).map(k => FIELD_LABEL[k] || k);

  const essTotal = cfg.essential.length || 1;
  const impTotal = cfg.important.length || 1;
  const optTotal = cfg.optional.length || 1;

  const essentialPct = Math.round((filledIn(cfg.essential) / essTotal) * 100);
  const importantPct = Math.round((filledIn(cfg.important) / impTotal) * 100);
  const optionalPct  = Math.round((filledIn(cfg.optional)  / optTotal)  * 100);

  const pct = Math.round(essentialPct * 0.70 + importantPct * 0.25 + optionalPct * 0.05);

  return {
    pct,
    essentialPct,
    importantPct,
    optionalPct,
    missingEssentials: missingIn(cfg.essential),
    missingImportant:  missingIn(cfg.important),
    missingOptional:   missingIn(cfg.optional),
    type,
  };
}

export const PERSONALIZED_VISUAL_THRESHOLD = 70;

/**
 * Which fields Léo should actively chase to push the fiche above 70 %.
 * Returns essentials first (highest weight), then important ones.
 * Optional fields are NOT returned — Léo doesn't waste a Gemini call
 * on a LinkedIn URL for a restaurant.
 */
export function missingEssentialKeys(prospect: Record<string, any>): string[] {
  const type = normalizeType(prospect.type);
  const cfg = TIERS_BY_TYPE[type] || FALLBACK;
  const missing = [
    ...cfg.essential.filter(k => !isFilled(prospect[k])),
    ...cfg.important.filter(k => !isFilled(prospect[k])),
  ];
  return missing;
}
