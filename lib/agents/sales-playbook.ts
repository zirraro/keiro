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
  tatoueur: [9], concept_store: [9, 11, 12], autre: [1, 9],
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
