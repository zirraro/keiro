/**
 * Type-aware fiche completeness scoring.
 *
 * Founder ask 2026-05-27: "le pourcentage de completude des fiches
 * CRM de Léo est de 20% en moyenne — typiquement un resto n'aura pas
 * de LinkedIn donc info non essentielle, faut monter mécaniquement la
 * completion si l'info reste optionnelle. À toi de déterminer".
 *
 * Each business type has a different set of ESSENTIAL fields (the ones
 * Léo MUST fill so Hugo / Jade / Léna can do their job) and OPTIONAL
 * BONUS fields that add value when present but don't penalize the
 * fiche when absent.
 *
 * Scoring:
 *   pct = (filled essentials / essentials) * 90 + (filled bonus / bonus) * 10
 *
 * → A fully-essential fiche with no bonus = 90% (above the 70% gate).
 * → A fully-essential fiche with all bonuses = 100%.
 * → Missing essentials hurt; missing bonus doesn't.
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

// Essentials per business type. The default profile covers physical
// local businesses (resto, boutique, etc.). B2B-flavored profiles
// (coach, services, agence) shift essentials toward digital/contact.
const ESSENTIALS_BY_TYPE: Record<string, { essentials: string[]; bonus: string[] }> = {
  // Physical hospitality / retail — Insta + Google + adresse sont rois
  restaurant:    { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram'], bonus: ['email', 'website', 'tiktok_handle', 'first_name'] },
  bistrot:       { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram'], bonus: ['email', 'website', 'tiktok_handle', 'first_name'] },
  brasserie:     { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram'], bonus: ['email', 'website', 'tiktok_handle', 'first_name'] },
  bar:           { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram'], bonus: ['email', 'website', 'tiktok_handle', 'first_name'] },
  hotel:         { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram', 'website'], bonus: ['email', 'tiktok_handle', 'first_name'] },
  traiteur:      { essentials: ['company', 'type', 'quartier', 'phone', 'instagram'], bonus: ['email', 'website', 'address', 'note_google', 'tiktok_handle', 'first_name'] },
  boulangerie:   { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram'], bonus: ['email', 'website', 'first_name'] },
  patisserie:    { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram'], bonus: ['email', 'website', 'tiktok_handle', 'first_name'] },
  fromagerie:    { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google'], bonus: ['email', 'website', 'instagram', 'first_name'] },
  caviste:       { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram'], bonus: ['email', 'website', 'first_name'] },
  fleuriste:     { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram'], bonus: ['email', 'website', 'tiktok_handle', 'first_name'] },
  // Beauty / wellness — Insta + tel = canal principal de rdv
  coiffeur:      { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram'], bonus: ['email', 'website', 'tiktok_handle', 'first_name'] },
  barbier:       { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram'], bonus: ['email', 'website', 'tiktok_handle', 'first_name'] },
  salon_beaute:  { essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram'], bonus: ['email', 'website', 'tiktok_handle', 'first_name'] },
  salon_de_beaute:{essentials: ['company', 'type', 'quartier', 'address', 'phone', 'note_google', 'instagram'], bonus: ['email', 'website', 'tiktok_handle', 'first_name'] },
  // Services / B2C body — Insta + email + tel
  coach:         { essentials: ['company', 'type', 'email', 'phone', 'instagram', 'first_name'], bonus: ['website', 'quartier', 'tiktok_handle', 'linkedin_url'] },
  photographe:   { essentials: ['company', 'type', 'email', 'instagram', 'website'], bonus: ['phone', 'quartier', 'tiktok_handle', 'first_name'] },
  // B2B — LinkedIn devient essentiel, IG/TT moins
  freelance:     { essentials: ['company', 'type', 'email', 'linkedin_url', 'website'], bonus: ['phone', 'instagram', 'first_name', 'quartier'] },
  consultant:    { essentials: ['company', 'type', 'email', 'linkedin_url', 'website'], bonus: ['phone', 'instagram', 'first_name', 'quartier'] },
  agence:        { essentials: ['company', 'type', 'email', 'linkedin_url', 'website', 'instagram'], bonus: ['phone', 'first_name', 'quartier', 'tiktok_handle'] },
  // Generic fallback — keep a useful baseline
  services:      { essentials: ['company', 'type', 'email', 'phone'], bonus: ['instagram', 'linkedin_url', 'website', 'first_name', 'quartier'] },
  pme:           { essentials: ['company', 'type', 'email', 'phone'], bonus: ['instagram', 'linkedin_url', 'website', 'first_name', 'quartier'] },
  boutique:      { essentials: ['company', 'type', 'quartier', 'phone', 'instagram'], bonus: ['email', 'website', 'address', 'note_google', 'tiktok_handle', 'first_name'] },
};

const FALLBACK = { essentials: ['company', 'type', 'phone', 'email'], bonus: ['instagram', 'linkedin_url', 'tiktok_handle', 'website', 'first_name', 'quartier', 'note_google', 'address'] };

function isFilled(v: any): boolean {
  return v !== null && v !== undefined && v !== '' && v !== 'A_VERIFIER';
}

function normalizeType(type: any): string {
  return String(type || '').toLowerCase().replace(/[\s-]+/g, '_');
}

export interface Completeness {
  pct: number;            // 0..100
  essentialPct: number;   // % of essentials filled
  missingEssentials: string[]; // labels of missing essential fields
  missingOptional: string[];   // labels of missing optional fields
  type: string;           // normalized type used for the calc
}

/**
 * Compute completeness for a prospect, type-aware.
 * pct = essentialPct * 0.9 + bonusPct * 0.1
 */
export function completeness(prospect: Record<string, any>): Completeness {
  const type = normalizeType(prospect.type);
  const cfg = ESSENTIALS_BY_TYPE[type] || FALLBACK;

  const essentialsFilled = cfg.essentials.filter(k => isFilled(prospect[k])).length;
  const bonusFilled = cfg.bonus.filter(k => isFilled(prospect[k])).length;

  const essentialPct = cfg.essentials.length > 0
    ? Math.round((essentialsFilled / cfg.essentials.length) * 100)
    : 100;
  const bonusPct = cfg.bonus.length > 0
    ? Math.round((bonusFilled / cfg.bonus.length) * 100)
    : 0;
  const pct = Math.round(essentialPct * 0.9 + bonusPct * 0.1);

  return {
    pct,
    essentialPct,
    missingEssentials: cfg.essentials.filter(k => !isFilled(prospect[k])).map(k => FIELD_LABEL[k] || k),
    missingOptional: cfg.bonus.filter(k => !isFilled(prospect[k])).map(k => FIELD_LABEL[k] || k),
    type,
  };
}

/**
 * Threshold above which Hugo can ship a personalised visual.
 * 70% is the founder-defined gate.
 */
export const PERSONALIZED_VISUAL_THRESHOLD = 70;

/**
 * Which essential fields are still missing for a given prospect.
 * Used by Léo enrichment to know what to chase next.
 */
export function missingEssentialKeys(prospect: Record<string, any>): string[] {
  const type = normalizeType(prospect.type);
  const cfg = ESSENTIALS_BY_TYPE[type] || FALLBACK;
  return cfg.essentials.filter(k => !isFilled(prospect[k]));
}
