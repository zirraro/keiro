/**
 * Sales playbook — le système commercial 4 étages (doc founder, validé +
 * challengé 2026-06-18) encodé en DONNÉES réutilisables. Source unique de
 * vérité pour Léo (priorisation), Jade (accroches DM, préparation-only) et
 * Hugo (séquences email). Re-calibrable depuis les conversions réelles.
 *
 * Doctrine conformité : DM = préparation + envoi manuel (jamais d'auto-send à
 * froid) ; email via Hugo durci ; un prospect = un canal (channel-lock, Noah).
 */

export type Sector =
  | 'institut_beaute' | 'onglerie' | 'barbier' | 'coiffure' | 'spa' | 'massage'
  | 'coach_sportif' | 'yoga_pilates' | 'tatoueur' | 'naturopathe' | 'dieteticien'
  | 'restaurant' | 'fleuriste' | 'caviste' | 'boutique_mode' | 'concept_store'
  | 'boulangerie' | 'patisserie' | 'chocolatier' | 'traiteur' | 'opticien'
  | 'bijouterie' | 'boucherie' | 'fromagerie' | 'primeur' | 'photographe'
  | 'immobilier' | 'agence_voyage' | 'animalerie' | 'toilettage' | 'auto_ecole'
  | 'pressing' | 'decoration' | 'poterie'
  | 'autre';

export interface SectorFiche {
  label: string;
  circle: 0 | 1 | 2 | 3;            // cercle d'élargissement (0 = cœur ICP)
  angoisse: string;                  // douleur n°1 (ouvre par là, pas par le produit)
  desire: string;                    // résultat désiré
  heroAgent: string;                 // l'agent qui résonne le plus
  vocabUse: string[];                // mots qui font tilt
  vocabAvoid: string[];              // jargon = mur
  objections: { obj: string; rep: string }[];
  channelOptimal: string;            // canal de contact optimal
  saison: string;                    // fenêtres d'attaque
  note?: string;
}

/** Cœur ICP = institut de beauté. Le messaging se calibre sur LUI d'abord. */
export const ICP_CORE: Sector = 'institut_beaute';

export const SECTORS: Record<Sector, SectorFiche> = {
  institut_beaute: {
    label: 'Institut de beauté / esthétique', circle: 0,
    angoisse: "Je n'ai pas le temps de m'en occuper et ça se voit — mon Insta donne une image négligée alors que mon travail est soigné.",
    desire: "Un feed régulier et beau qui reflète la qualité de mes prestations + des créneaux creux qui se remplissent.",
    heroAgent: 'Léna (régularité du feed) → Hugo-fidélisation (faire revenir les clientes) → Théo (avis, sérieux)',
    vocabUse: ['tes réalisations', 'tes clientes', 'ton feed', 'créneaux creux', 'régularité', 'sans y penser', 'ton image'],
    vocabAvoid: ['ROI', 'engagement rate', 'funnel', 'lead gen', 'scaler', 'KPI'],
    objections: [
      { obj: "J'ai déjà essayé, ça n'a rien donné", rep: "C'est souvent qu'on a publié sans régularité ni stratégie. Le problème n'est pas Insta, c'est de devoir y penser. Là, tu n'y penses plus, et c'est régulier." },
      { obj: "C'est cher / pas le budget", rep: "Tu paies déjà en temps. À 49€, c'est moins qu'une seule prestation — et tu récupères tes heures." },
      { obj: "Le contenu IA fait faux", rep: "On part de TES photos, ton ton, tes prestations. Ce n'est pas du générique, c'est ton salon. Regarde. (démo live)" },
      { obj: "Pas le temps de configurer", rep: "On le fait pour toi en 10 minutes, là, ensemble." },
    ],
    channelOptimal: 'terrain (samedi, en personne) > DM Instagram personnalisé > email. Téléphone = mauvais (en prestation).',
    saison: 'janvier (creux + résolutions), septembre (rentrée), novembre (avant fêtes)',
  },
  restaurant: {
    label: 'Restaurant', circle: 3,
    angoisse: "Les avis Google me font vivre ou me tuent, et je n'ai pas le temps d'y répondre ni de poster.",
    desire: "Plus de couverts en semaine creuse, une note Google maîtrisée, des photos de plats qui donnent envie.",
    heroAgent: 'Théo (avis Google — vital en resto) → Léna (photos de plats)',
    vocabUse: ['couverts', 'avis Google', 'tes plats', 'le soir / le midi', 'ta note'],
    vocabAvoid: ['contenu', 'branding', 'jargon marketing'],
    objections: [
      { obj: "J'ai pas le temps", rep: "C'est exactement le problème qu'on règle. Tu cuisines, les agents postent et répondent aux avis." },
      { obj: "Les avis je gère à la main", rep: "Répondre à chacun vite et bien compte pour Google ET le client. Théo le fait, tu valides d'un tap." },
    ],
    channelOptimal: 'terrain > email > DM',
    saison: 'rentrée, janvier, avant période touristique locale',
    note: '⚠️ Churn + marge plus durs. Cercle 3 — après validation du Cercle 0, malgré la tentation (bcp de restos visibles).',
  },
  coach_sportif: {
    label: 'Coach sportif / studio', circle: 2,
    angoisse: "Mes créneaux ne sont pas pleins et mes clients décrochent au bout de 2 mois.",
    desire: "Agenda rempli, communauté engagée, clients qui restent.",
    heroAgent: 'Léna (présence) + Hugo-fidélisation (relancer les clients qui décrochent)',
    vocabUse: ['créneaux', 'ta communauté', 'tes clients qui reviennent', 'ton programme'],
    vocabAvoid: ['funnel', 'KPI', 'jargon'],
    objections: [
      { obj: "Je gère déjà mon Insta", rep: "Tu le fais bien — mais combien d'heures ? Et la prospection + les relances clients ?" },
      { obj: "Mes clients viennent par bouche-à-oreille", rep: "Parfait, on amplifie : relancer les anciens, faire poster les contents." },
    ],
    channelOptimal: 'DM Instagram > terrain > email',
    saison: 'septembre et janvier = fenêtres en or (attaquer 3 semaines avant)',
  },
  // Cercle 1 (beauté adjacent) — héritent du discours institut, à nuancer.
  onglerie: { label: 'Onglerie', circle: 1, angoisse: "Mon Insta ne reflète pas la qualité de mes poses.", desire: "Feed régulier + créneaux remplis.", heroAgent: 'Léna → Théo', vocabUse: ['tes poses', 'tes clientes', 'ton feed', 'créneaux'], vocabAvoid: ['ROI', 'funnel', 'KPI'], objections: [], channelOptimal: 'terrain > DM > email', saison: 'janvier, septembre' },
  barbier: { label: 'Barbier', circle: 1, angoisse: "Je suis booké mais mon Insta ne tourne pas tout seul.", desire: "Visibilité régulière + nouveaux clients.", heroAgent: 'Léna → Théo', vocabUse: ['tes coupes', 'tes clients', 'ton feed'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM > terrain', saison: 'rentrée' },
  coiffure: { label: 'Salon de coiffure', circle: 1, angoisse: "Pas le temps de poster alors que mes transformations sont belles.", desire: "Feed avant/après régulier + agenda plein.", heroAgent: 'Léna → Théo', vocabUse: ['tes transformations', 'tes clientes', 'ton feed', 'créneaux'], vocabAvoid: ['ROI', 'KPI'], objections: [], channelOptimal: 'terrain > DM', saison: 'janvier, septembre, fêtes' },
  spa: { label: 'Spa', circle: 1, angoisse: "Mon image en ligne ne traduit pas l'expérience premium.", desire: "Présence soignée + réservations.", heroAgent: 'Léna → Théo', vocabUse: ['ton univers', 'tes soins', 'tes clientes'], vocabAvoid: ['funnel', 'KPI'], objections: [], channelOptimal: 'email > terrain', saison: 'janvier, avant fêtes' },
  massage: { label: 'Salon de massage', circle: 1, angoisse: "Agenda en dents de scie, présence en ligne négligée.", desire: "Créneaux réguliers, image apaisante.", heroAgent: 'Léna → Hugo-fidélisation', vocabUse: ['tes soins', 'tes clients', 'créneaux'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM > terrain', saison: 'janvier, septembre' },
  yoga_pilates: { label: 'Studio yoga / pilates', circle: 2, angoisse: "Remplir les cours et fidéliser la communauté.", desire: "Cours pleins + communauté engagée.", heroAgent: 'Léna + Hugo-fidélisation', vocabUse: ['tes cours', 'ta communauté', 'tes élèves'], vocabAvoid: ['KPI', 'funnel'], objections: [], channelOptimal: 'DM > terrain', saison: 'septembre, janvier' },
  tatoueur: { label: 'Tatoueur', circle: 2, angoisse: "Mon book Insta n'est pas à jour et je refuse du monde ou j'ai des trous.", desire: "Book régulier + agenda maîtrisé.", heroAgent: 'Léna', vocabUse: ['ton book', 'tes pièces', 'tes clients'], vocabAvoid: ['ROI', 'branding'], objections: [], channelOptimal: 'DM Instagram', saison: 'rentrée' },
  naturopathe: { label: 'Naturopathe', circle: 2, angoisse: "Peu visible, agenda à remplir, crédibilité à installer.", desire: "Visibilité + crédibilité + RDV.", heroAgent: 'Léna → Hugo', vocabUse: ['tes consultations', 'tes patients', 'ton approche'], vocabAvoid: ['funnel', 'KPI'], objections: [], channelOptimal: 'email > DM', saison: 'janvier, septembre' },
  dieteticien: { label: 'Diététicien', circle: 2, angoisse: "Remplir l'agenda et fidéliser les patients.", desire: "RDV réguliers + suivi.", heroAgent: 'Léna → Hugo-fidélisation', vocabUse: ['tes patients', 'tes consultations', 'ton suivi'], vocabAvoid: ['funnel', 'KPI'], objections: [], channelOptimal: 'email > DM', saison: 'janvier, septembre' },
  fleuriste: { label: 'Fleuriste', circle: 3, angoisse: "Mes créations sont belles mais peu vues en ligne.", desire: "Visibilité locale + ventes (events, fêtes).", heroAgent: 'Léna → Théo', vocabUse: ['tes créations', 'tes bouquets', 'tes clients'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'terrain > DM', saison: 'fêtes (St-Valentin, fête des mères), mariages' },
  caviste: { label: 'Caviste', circle: 3, angoisse: "Fidéliser et faire venir en boutique.", desire: "Clients réguliers + ventes events.", heroAgent: 'Léna → Théo', vocabUse: ['tes cuvées', 'tes clients', 'tes dégustations'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'email > terrain', saison: 'fêtes de fin d\'année' },
  boutique_mode: { label: 'Boutique mode', circle: 3, angoisse: "Concurrence du e-commerce, présence à entretenir.", desire: "Trafic en boutique + nouveautés vues.", heroAgent: 'Léna → Théo', vocabUse: ['tes pièces', 'tes nouveautés', 'tes clientes'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM > terrain', saison: 'soldes, rentrée, fêtes' },
  concept_store: { label: 'Concept store', circle: 3, angoisse: "Raconter l'univers de la boutique régulièrement.", desire: "Communauté + trafic.", heroAgent: 'Léna', vocabUse: ['ton univers', 'ta sélection', 'tes clients'], vocabAvoid: ['ROI', 'KPI'], objections: [], channelOptimal: 'DM > terrain', saison: 'rentrée, fêtes' },
  autre: { label: 'Autre commerce local', circle: 3, angoisse: "Manque de temps pour une présence en ligne régulière.", desire: "Visibilité régulière sans y penser.", heroAgent: 'Léna', vocabUse: ['tes clients', 'ton activité', 'sans y penser'], vocabAvoid: ['ROI', 'funnel', 'KPI'], objections: [], channelOptimal: 'terrain > DM > email', saison: 'janvier, septembre' },
  // Secteurs étendus (démarcher plus de commerces) — fiches compactes.
  boulangerie: { label: 'Boulangerie', circle: 3, angoisse: "Mes produits sont beaux le matin mais personne ne les voit en ligne.", desire: "File du matin + ventes l'après-midi, image gourmande.", heroAgent: 'Léna → Théo', vocabUse: ['tes produits', 'le matin', 'tes clients', 'fait maison'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'terrain > DM', saison: 'fêtes, galette (janvier), rentrée' },
  patisserie: { label: 'Pâtisserie', circle: 3, angoisse: "Mes créations méritent d'être vues, je n'ai pas le temps de poster.", desire: "Commandes (events, fêtes) + image premium gourmande.", heroAgent: 'Léna', vocabUse: ['tes créations', 'tes gâteaux', 'commandes'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM > terrain', saison: 'fêtes, St-Valentin, mariages' },
  chocolatier: { label: 'Chocolatier', circle: 3, angoisse: "Tout se joue sur quelques pics dans l'année et je rate la visibilité.", desire: "Ventes sur Pâques/Noël + image artisanale.", heroAgent: 'Léna', vocabUse: ['tes créations', 'artisanal', 'tes clients'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM > terrain', saison: 'Pâques, Noël, St-Valentin' },
  traiteur: { label: 'Traiteur', circle: 3, angoisse: "Je vis des events mais ma vitrine en ligne ne les vend pas.", desire: "Devis events + portfolio appétissant.", heroAgent: 'Léna → Théo', vocabUse: ['tes prestations', 'tes events', 'tes clients'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'email > DM', saison: 'mariages (printemps-été), fêtes' },
  opticien: { label: 'Opticien', circle: 3, angoisse: "Concurrence des chaînes, je dois montrer mon conseil et mes montures.", desire: "Trafic en boutique + image conseil.", heroAgent: 'Léna → Théo', vocabUse: ['tes montures', 'ton conseil', 'tes clients'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'terrain > DM', saison: 'rentrée, janvier' },
  bijouterie: { label: 'Bijouterie', circle: 3, angoisse: "Mes pièces sont précieuses mais invisibles en ligne.", desire: "Ventes cadeaux + image d'exception.", heroAgent: 'Léna → Théo', vocabUse: ['tes pièces', 'tes créations', 'tes clients'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM > terrain', saison: 'fêtes, St-Valentin, fête des mères' },
  boucherie: { label: 'Boucherie / Charcuterie', circle: 3, angoisse: "Je perds des clients face aux supermarchés, mon savoir-faire ne se voit pas.", desire: "Fidéliser + montrer la qualité, commandes fêtes.", heroAgent: 'Léna → Théo', vocabUse: ['tes produits', 'ton savoir-faire', 'tes clients'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'terrain > DM', saison: 'fêtes, BBQ (été)' },
  fromagerie: { label: 'Fromagerie', circle: 3, angoisse: "Mon expertise se transmet mal en ligne.", desire: "Clients réguliers + plateaux events.", heroAgent: 'Léna', vocabUse: ['tes fromages', 'tes plateaux', 'affinage'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'terrain > DM', saison: 'fêtes' },
  primeur: { label: 'Primeur / Épicerie', circle: 3, angoisse: "Je dois rappeler aux gens que le frais local existe à côté de chez eux.", desire: "Trafic régulier + image fraîcheur locale.", heroAgent: 'Léna', vocabUse: ['tes produits', 'frais', 'local', 'tes clients'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'terrain > DM', saison: 'saisons produits' },
  photographe: { label: 'Photographe', circle: 2, angoisse: "Mon portfolio doit tourner pour décrocher des shootings.", desire: "Demandes de shooting régulières.", heroAgent: 'Léna', vocabUse: ['ton portfolio', 'tes shootings', 'tes clients'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM Instagram', saison: 'mariages (printemps-été), fêtes' },
  immobilier: { label: 'Agence immobilière', circle: 3, angoisse: "Mes biens et mon agence manquent de visibilité locale.", desire: "Mandats + leads acquéreurs.", heroAgent: 'Léna → Hugo', vocabUse: ['tes biens', 'ton secteur', 'tes mandats'], vocabAvoid: ['funnel', 'KPI'], objections: [], channelOptimal: 'email > DM', saison: 'printemps, rentrée' },
  agence_voyage: { label: 'Agence de voyage', circle: 3, angoisse: "Le rêve se vend par l'image et je n'ai pas le temps de poster.", desire: "Demandes de devis voyage.", heroAgent: 'Léna → Hugo', vocabUse: ['tes destinations', 'évasion', 'tes clients'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM > email', saison: 'janvier (réservations été), automne (hiver)' },
  animalerie: { label: 'Animalerie', circle: 3, angoisse: "Les maîtres achètent en ligne, je dois recréer le lien.", desire: "Trafic + fidélité, image conseil.", heroAgent: 'Léna', vocabUse: ['tes animaux', 'tes clients', 'conseil'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM > terrain', saison: 'rentrée, fêtes' },
  toilettage: { label: 'Toilettage', circle: 2, angoisse: "Mes avant/après sont parfaits pour Insta mais je ne poste pas.", desire: "Agenda rempli + fidélité.", heroAgent: 'Léna → Théo', vocabUse: ['tes toilettages', 'avant/après', 'tes clients'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM > terrain', saison: 'printemps (mue), fêtes' },
  auto_ecole: { label: 'Auto-école', circle: 3, angoisse: "Les jeunes choisissent sur les réseaux et les avis.", desire: "Inscriptions + bons avis.", heroAgent: 'Théo → Léna', vocabUse: ['tes élèves', 'taux de réussite', 'tes moniteurs'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM > terrain', saison: 'rentrée, été (avant vacances)' },
  pressing: { label: 'Pressing', circle: 3, angoisse: "Service de proximité oublié, je dois rappeler mon existence.", desire: "Trafic régulier de quartier.", heroAgent: 'Léna', vocabUse: ['ton service', 'tes clients', 'rapidité'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'terrain > DM', saison: 'rentrée, avant fêtes' },
  decoration: { label: 'Décoration / Ameublement', circle: 3, angoisse: "Mon univers déco doit inspirer en ligne pour faire venir en boutique.", desire: "Trafic + ventes, image inspirante.", heroAgent: 'Léna', vocabUse: ['ton univers', 'tes pièces', 'tes clients'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM > terrain', saison: 'rentrée, fêtes, printemps' },
  poterie: { label: 'Atelier de poterie / céramique', circle: 2, angoisse: "Mon artisanat se raconte mal sans contenu régulier.", desire: "Ventes + inscriptions ateliers.", heroAgent: 'Léna', vocabUse: ['tes créations', 'fait main', 'tes ateliers'], vocabAvoid: ['ROI', 'funnel'], objections: [], channelOptimal: 'DM Instagram', saison: 'fêtes, rentrée (ateliers)' },
};

/**
 * Saisonnalité d'attaque par secteur (mois 1-12 où la fenêtre d'achat s'ouvre).
 * Janvier (creux + résolutions) + septembre (rentrée) = quasi-universels ; on
 * ajoute les pics spécifiques. Sert de DÉCLENCHEUR actif (signal de score) +
 * à choisir l'accroche "creux saisonnier".
 */
const SEASON_MONTHS: Partial<Record<Sector, number[]>> = {
  institut_beaute: [1, 9, 11], onglerie: [1, 9, 11], coiffure: [1, 9, 11, 12],
  spa: [1, 11, 12], massage: [1, 9], barbier: [9, 12],
  coach_sportif: [1, 9], yoga_pilates: [1, 9], dieteticien: [1, 9], naturopathe: [1, 9],
  restaurant: [1, 9], fleuriste: [2, 5, 12], caviste: [11, 12], boutique_mode: [1, 6, 9, 11],
  tatoueur: [9], concept_store: [9, 11, 12],
  boulangerie: [1, 9, 12], patisserie: [2, 5, 12], chocolatier: [2, 4, 12], traiteur: [4, 5, 6, 9, 12],
  opticien: [1, 9], bijouterie: [2, 5, 12], boucherie: [7, 8, 12], fromagerie: [12], primeur: [6, 9],
  photographe: [4, 5, 6, 9], immobilier: [3, 4, 9], agence_voyage: [1, 9, 10], animalerie: [9, 12],
  toilettage: [3, 4, 12], auto_ecole: [6, 9], pressing: [9, 11], decoration: [3, 9, 11], poterie: [9, 11, 12],
  autre: [1, 9],
};

export function isSectorInSeason(sector: Sector, month1to12: number): boolean {
  const m = SEASON_MONTHS[sector] || [1, 9];
  return m.includes(month1to12);
}

/** Map a free-text business_type to a Sector key. */
export function detectSector(businessType?: string): Sector {
  const t = (businessType || '').toLowerCase();
  if (/institut|esthétiq|esthetiq/.test(t)) return 'institut_beaute';
  if (/onglerie|nail|ongle/.test(t)) return 'onglerie';
  if (/barbier|barber/.test(t)) return 'barbier';
  if (/coiffure|coiffeur|hair/.test(t)) return 'coiffure';
  if (/\bspa\b/.test(t)) return 'spa';
  if (/massage/.test(t)) return 'massage';
  if (/coach|personal train|fitness|gym/.test(t)) return 'coach_sportif';
  if (/yoga|pilates/.test(t)) return 'yoga_pilates';
  if (/tatou|tattoo/.test(t)) return 'tatoueur';
  if (/naturopath/.test(t)) return 'naturopathe';
  if (/diété|diete|nutrition/.test(t)) return 'dieteticien';
  if (/boulang/.test(t)) return 'boulangerie';
  if (/patiss|pâtiss/.test(t)) return 'patisserie';
  if (/chocolat/.test(t)) return 'chocolatier';
  if (/traiteur/.test(t)) return 'traiteur';
  if (/opticien|lunett|optique/.test(t)) return 'opticien';
  if (/bijou|joaill|orfèvr|orfevr/.test(t)) return 'bijouterie';
  if (/boucher|charcut/.test(t)) return 'boucherie';
  if (/fromag/.test(t)) return 'fromagerie';
  if (/primeur|épicerie|epicerie|fruits et légumes/.test(t)) return 'primeur';
  if (/photograph/.test(t)) return 'photographe';
  if (/immobil|agence immo/.test(t)) return 'immobilier';
  if (/voyage|agence de voyage|tourisme/.test(t)) return 'agence_voyage';
  if (/animaler|animal/.test(t)) return 'animalerie';
  if (/toilettage|toiletteur/.test(t)) return 'toilettage';
  if (/auto-?école|auto-?ecole|conduite|permis/.test(t)) return 'auto_ecole';
  if (/pressing|blanchiss|laverie/.test(t)) return 'pressing';
  if (/décorat|decorat|ameublement|déco\b|meuble/.test(t)) return 'decoration';
  if (/poterie|céramiq|ceramiq/.test(t)) return 'poterie';
  if (/restau|bistro|brasserie|pizz|burger|food/.test(t)) return 'restaurant';
  if (/fleurist|fleur/.test(t)) return 'fleuriste';
  if (/caviste|vin|cave/.test(t)) return 'caviste';
  if (/mode|prêt-à-porter|pret a porter|vêtement|vetement|boutique/.test(t)) return 'boutique_mode';
  if (/concept store|concept-store/.test(t)) return 'concept_store';
  return 'autre';
}

/** Accroches DM par SIGNAL observé (Jade — à personnaliser, jamais brut). */
export function buildProspectAccroche(opts: {
  firstName?: string;
  sector: Sector;
  signal: 'compte_dormant' | 'avis_sans_reponse' | 'ouverture_recente' | 'creux_saisonnier';
  lastPostDate?: string;
  unansweredReviews?: number;
  reviewsCount?: number;
  rating?: number;
}): string {
  const hi = opts.firstName ? `Bonjour ${opts.firstName},` : 'Bonjour,';
  const f = SECTORS[opts.sector];
  const oeuvre = /restau|food/.test(opts.sector) ? 'plats' : /fleur/.test(opts.sector) ? 'créations' : 'réalisations';
  switch (opts.signal) {
    case 'compte_dormant':
      return `${hi} j'ai vu que votre dernier post date du ${opts.lastPostDate || '[date]'} — vos ${oeuvre} méritent d'être vus plus souvent. Imaginez ce rythme tenu chaque semaine sans que vous y passiez une minute.`;
    case 'avis_sans_reponse':
      return `${hi} vous avez ${opts.reviewsCount ?? '[N]'} avis à ${opts.rating ?? '[note]'} — un vrai atout. Mais ${opts.unansweredReviews ?? '[X]'} sont sans réponse, et Google valorise les établissements qui répondent. On peut s'en occuper (vous validez d'un tap).`;
    case 'ouverture_recente':
      return `${hi} félicitations pour l'ouverture ! Le moment idéal pour installer une présence régulière dès le départ, pendant que vous gérez le reste.`;
    case 'creux_saisonnier':
      return `${hi} c'est la période où ${f.label.toLowerCase()} remplit ses créneaux creux. On vous prépare la visibilité pour ça.`;
  }
}

/** Séquence email Hugo par secteur (3 touches max, durci, opt-out obligatoire). */
export function buildEmailSequence(sector: Sector, firstName?: string): { day: number; subject: string; body: string }[] {
  const f = SECTORS[sector];
  const hi = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
  return [
    { day: 0, subject: `Une question rapide sur votre présence en ligne`, body: `${hi}\n\n${f.angoisse}\n\nC'est exactement ce qu'on règle : ${f.desire} — sans que vous y passiez du temps. Si ça vous parle, je vous montre en 3 min sur VOS éléments.\n\n(Répondez STOP pour ne plus recevoir de message.)` },
    { day: 3, subject: `Je vous montre, c'est plus parlant`, body: `${hi}\n\nPlutôt qu'un long message : laissez-moi générer un exemple à partir de votre activité, devant vous. Vous jugez. 3 minutes, sans engagement.\n\n(STOP pour vous désinscrire.)` },
    { day: 7, subject: `Dernier message`, body: `${hi}\n\nJe ne vais pas insister — juste : ${f.heroAgent.split('→')[0].trim()} pourrait déjà travailler pour vous cette semaine. La porte reste ouverte quand vous voulez.\n\n(STOP pour vous désinscrire.)` },
  ];
}
