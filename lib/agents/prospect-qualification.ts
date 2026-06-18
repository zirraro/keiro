/**
 * Prospect qualification (système commercial 4 étages — étage 4).
 *
 * Pure, deterministic scoring used by Léo (enrichissement) to prioritise the
 * sales effort. Encodes the founder-validated corrections (2026-06-18):
 *   - a GATE eliminates anti-ICP BEFORE any points are added (chains, under
 *     contract, no presence, low density, no reachable contact) — the score
 *     must never rank a disqualified prospect.
 *   - dormancy only scores high if there's EVIDENCE OF PAST EFFORT (overwhelmed
 *     owner = good) vs never-invested (doesn't care = churn → low).
 *   - reachability (a contact channel) is a first-class signal.
 *
 * Returns a decision a human/agent can act on. Pure function = trivially
 * testable and re-weightable from real conversion data (Noah's learning loop).
 */

export interface ProspectSignals {
  isChainOrFranchise?: boolean;       // gate
  underAgencyContract?: boolean;      // gate
  hasAnyDigitalPresence?: boolean;    // gate (false = nothing to work with)
  densityScore?: number;              // 0-100 local foot-traffic density (gate if too low)
  contactChannel?: 'dm_open' | 'email' | 'owner_is_operator' | null; // reachability

  // Instagram signals
  lastInstaPostDaysAgo?: number | null; // >14 = dormant
  priorEffortEvidence?: boolean;        // bio soignée / logo / past good posts → overwhelmed not careless

  // Google signals
  googleReviewsCount?: number | null;
  googleReviewsUnansweredPct?: number | null; // 0-100
  googleRating?: number | null;

  activeTrigger?: boolean;            // ouverture récente / creux saison / mauvais avis récent / concurrent actif
}

export interface QualificationResult {
  disqualified: boolean;
  gateReason?: string;
  score: number;                      // 0-100 (0 if disqualified)
  tier: 'priority' | 'maybe' | 'ignore';
  breakdown: Record<string, number>;
}

const DENSITY_MIN = 35; // below this = pas de masse critique pour le bouche-à-oreille

export function qualifyProspect(s: ProspectSignals): QualificationResult {
  // ── GATE (élimine avant tout score) ──
  const gate = (reason: string): QualificationResult =>
    ({ disqualified: true, gateReason: reason, score: 0, tier: 'ignore', breakdown: {} });

  if (s.isChainOrFranchise) return gate('chaine_ou_franchise');
  if (s.underAgencyContract) return gate('sous_contrat_agence');
  if (s.hasAnyDigitalPresence === false) return gate('aucune_presence_digitale');
  if (typeof s.densityScore === 'number' && s.densityScore < DENSITY_MIN) return gate('densite_trop_faible');
  if (s.contactChannel == null) return gate('aucun_canal_de_contact');

  // ── SCORE (sur les survivants du gate) ──
  const b: Record<string, number> = {};

  // Dormance — signal le plus prédictif, MAIS discriminé par l'effort passé.
  const dormant = typeof s.lastInstaPostDaysAgo === 'number' && s.lastInstaPostDaysAgo > 14;
  if (dormant) b.dormant = s.priorEffortEvidence ? 30 : 5; // débordée vs s'en fout

  // Densité forte.
  if (typeof s.densityScore === 'number' && s.densityScore >= 60) b.densite = 20;
  else if (typeof s.densityScore === 'number' && s.densityScore >= DENSITY_MIN) b.densite = 10;

  // Joignabilité (peut-on l'atteindre ?).
  if (s.contactChannel) b.contact = s.contactChannel === 'owner_is_operator' ? 15 : 12;

  // Avis nombreux mais beaucoup sans réponse = douleur Google actionnable.
  if ((s.googleReviewsCount ?? 0) >= 10 && (s.googleReviewsUnansweredPct ?? 0) >= 40) b.avis_sans_reponse = 15;

  // Déclencheur actif.
  if (s.activeTrigger) b.declencheur = 15;

  // Commerce sain (note correcte) qui mérite d'être amplifié.
  if ((s.googleRating ?? 0) >= 4.0) b.note_saine = 10;

  const score = Math.min(100, Object.values(b).reduce((a, c) => a + c, 0));
  const tier: QualificationResult['tier'] = score >= 70 ? 'priority' : score >= 40 ? 'maybe' : 'ignore';
  return { disqualified: false, score, tier, breakdown: b };
}

/** Sort + filter an enriched prospect list to the actionable set (tier priority/maybe). */
export function prioritise<T extends { qualification?: QualificationResult }>(prospects: T[]): T[] {
  return prospects
    .filter(p => p.qualification && !p.qualification.disqualified && p.qualification.tier !== 'ignore')
    .sort((a, b) => (b.qualification!.score) - (a.qualification!.score));
}
