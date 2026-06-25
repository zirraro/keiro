/**
 * REGISTRE DE LANGAGE (tu / vous) — expertise partagée, utilisée par TOUS les
 * agents (email Hugo/Victor, contenu Léna, DM Jade, avis Théo…) pour TOUS les
 * clients.
 *
 * 2026-06-25 — Founder : ce n'est PAS "tu partout". C'est un arbitrage d'expert :
 * savoir QUAND utiliser la bonne formulation. Le tutoiement crée la proximité
 * (commerce local, lifestyle, jeune, food/beauté), le vouvoiement inspire le
 * sérieux et la confiance (professions de santé/juridiques, premium, B2B). On
 * choisit selon le secteur du destinataire (+ override possible du client).
 */

export type Register = 'tu' | 'vous';

// Secteurs où le VOUVOIEMENT est le bon registre (sérieux / confiance / premium).
const VOUS_HINTS = [
  'avocat', 'notaire', 'juridique', 'droit', 'huissier',
  'médecin', 'medecin', 'docteur', 'dentiste', 'dentaire', 'orthodont', 'kiné', 'kine',
  'ostéo', 'osteo', 'podologue', 'santé', 'sante', 'clinique', 'cabinet', 'thérapeut', 'therapeut',
  'comptable', 'expert-comptable', 'comptabilité', 'fiscaliste', 'audit', 'conseil',
  'architecte', 'assurance', 'assureur', 'banque', 'finance', 'patrimoine', 'gestion de patrimoine',
  'immobilier', 'notariat', 'b2b', 'industrie', 'pharmaci',
];

// Secteurs où le TUTOIEMENT est le bon registre (proximité / lifestyle / local).
// (sert surtout de doc — le tu est le défaut hors VOUS_HINTS.)
const TU_HINTS = [
  'restaurant', 'café', 'cafe', 'food', 'pizz', 'burger', 'traiteur', 'boulang', 'patiss', 'glacier', 'bar',
  'coiff', 'barbier', 'institut', 'beauté', 'beaute', 'esthét', 'esthet', 'ongle', 'tatou', 'lash', 'spa', 'massage',
  'coach', 'fitness', 'sport', 'yoga', 'pilates', 'danse', 'salle de sport',
  'fleur', 'boutique', 'mode', 'concept', 'déco', 'deco', 'créateur', 'createur', 'artisan',
];

/**
 * Choisit le registre pour un destinataire selon son type/secteur d'activité.
 * `override` = préférence explicite du client (brand kit / directive) qui gagne.
 */
export function pickRegister(businessType?: string, override?: Register | null): Register {
  if (override === 'tu' || override === 'vous') return override;
  const t = (businessType || '').toLowerCase();
  if (VOUS_HINTS.some(s => t.includes(s))) return 'vous';
  return 'tu'; // défaut : commerce local de proximité
}

/** Consigne prête à injecter dans un prompt agent. */
export function registerGuidance(reg: Register, firstName?: string): string {
  if (reg === 'vous') {
    return `REGISTRE : VOUVOIEMENT (vous / votre). Ce secteur attend un ton professionnel, posé et rassurant — chaleureux mais respectueux, JAMAIS familier. Ouvre par "Bonjour${firstName ? ' ' + firstName : ''}". N'utilise jamais "tu/ton/ta".`;
  }
  return `REGISTRE : TUTOIEMENT (tu / ton / ta). Proximité, ton direct et complice, comme un échange entre pros qui se comprennent. Ouvre par "Salut${firstName ? ' ' + firstName : ''}". JAMAIS "vous/votre", jamais "Bonjour/cher/cordialement".`;
}

void TU_HINTS;
