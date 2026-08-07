/**
 * La convention collective du client, pour Sara et Louis.
 *
 * Demande du fondateur (2026-08-07) : « pour Sara, agent juridique et RH, et
 * Louis, finance, il faut améliorer leur connaissance de chaque domaine.
 * Une boutique n'a pas la même convention collective que la restauration,
 * l'hôtellerie, la sécurité ou les services. Et la convention collective
 * passe AVANT le Code du travail dans les recommandations et les documents. »
 *
 * ── Pourquoi c'est la bonne hiérarchie ──
 *
 * Le Code du travail fixe un plancher. La convention de branche l'améliore
 * presque toujours, et sur les points qui font la différence au quotidien :
 * durée de la période d'essai, préavis, minima de salaire, majoration des
 * heures supplémentaires, jours fériés garantis, prime d'ancienneté.
 *
 * Rédiger un contrat d'extra pour un restaurant en appliquant le seul Code du
 * travail donne un document qui a l'air correct et qui est en dessous de ce
 * que la branche impose. C'est le genre d'erreur qu'un client ne voit pas et
 * qu'un contrôle voit tout de suite.
 *
 * ── Ce que ce fichier ne prétend PAS être ──
 *
 * Ce n'est pas une base juridique à jour. Les IDCC sont stables, mais les
 * montants et les durées évoluent par avenant, parfois plusieurs fois par an.
 * On donne donc à l'agent : la bonne convention, les points où elle s'écarte
 * du Code, et l'obligation de dire laquelle il a appliquée. Il ne cite jamais
 * un montant précis depuis cette table — il indique où le vérifier.
 *
 * L'IDCC réel figure sur le bulletin de paie du client : quand il est connu,
 * il prime sur notre déduction par métier.
 */
import { famillesDe } from '../business-families';

export interface Convention {
  /** Identifiant de convention collective, tel qu'il apparaît sur la paie. */
  idcc: string;
  /** Le nom courant, celui que le client reconnaîtra. */
  nom: string;
  /** Les points où elle s'écarte le plus du Code du travail. */
  specificites: string[];
}

const PAR_FAMILLE: Record<string, Convention> = {
  restaurant: {
    idcc: '1979', nom: 'Hôtels, cafés, restaurants (HCR)',
    specificites: [
      'Régime des extras : contrat d\'usage possible, mais motif et durée doivent être justifiés à chaque fois.',
      'Durée du travail spécifique (39 h possible avec majoration conventionnelle), coupures encadrées.',
      'Avantage en nature repas obligatoire, valorisé et déclaré même s\'il n\'est pas consommé.',
      'Grille de classification par niveaux et échelons, avec minima propres à la branche.',
      'Deux jours de repos hebdomadaire, avec des aménagements possibles selon l\'effectif.',
    ],
  },
  restauration_rapide: {
    idcc: '1501', nom: 'Restauration rapide',
    specificites: [
      'Distincte des HCR : ne jamais appliquer la 1979 à une enseigne de restauration rapide.',
      'Temps partiel très encadré : durée minimale et regroupement des horaires.',
      'Majorations de nuit et du dimanche propres à la branche.',
    ],
  },
  hotel: {
    idcc: '1979', nom: 'Hôtels, cafés, restaurants (HCR)',
    specificites: [
      'Personnel de nuit : contreparties conventionnelles spécifiques (repos, majoration).',
      'Saisonniers : reconduction et prime de fin de saison à vérifier dans la branche.',
      'Avantage en nature nourriture et, le cas échéant, logement.',
    ],
  },
  boulangerie: {
    idcc: '843', nom: 'Boulangerie-pâtisserie artisanale',
    specificites: [
      'Travail de nuit structurel : majorations et contreparties propres à la branche.',
      'Prime d\'ancienneté conventionnelle.',
      'Le travail du dimanche relève d\'un régime particulier pour les commerces alimentaires.',
      'Distincte de la boulangerie industrielle (IDCC 1747) — vérifier laquelle s\'applique.',
    ],
  },
  patisserie: {
    idcc: '1267', nom: 'Pâtisserie',
    specificites: [
      'Convention distincte de la boulangerie-pâtisserie artisanale.',
      'Classifications et minima propres.',
    ],
  },
  boucherie: {
    idcc: '992', nom: 'Boucherie, boucherie-charcuterie, triperie',
    specificites: [
      'Prime d\'ancienneté conventionnelle.',
      'Équipements de protection à la charge de l\'employeur.',
      'Classification par qualification professionnelle.',
    ],
  },
  coiffeur: {
    idcc: '2596', nom: 'Coiffure et professions connexes',
    specificites: [
      'Grille de salaires par niveaux, souvent supérieure au SMIC sur les échelons qualifiés.',
      'Régime de la coupe d\'essai et de la période d\'essai propre à la branche.',
      'Formation continue renforcée, avec obligations de l\'employeur.',
    ],
  },
  institut_beaute: {
    idcc: '3032', nom: 'Esthétique, parfumerie, enseignement technique et professionnel',
    specificites: [
      'Distincte de la coiffure : ne pas confondre les deux grilles.',
      'Qualification exigée pour certains actes, à refléter dans la classification du contrat.',
      'Fourniture et entretien des tenues professionnelles.',
    ],
  },
  garage: {
    idcc: '1090', nom: 'Services de l\'automobile',
    specificites: [
      'Classification par échelons techniques très structurée — le poste doit y être rattaché précisément.',
      'Prime d\'ancienneté conventionnelle.',
      'Régime spécifique pour les astreintes et le dépannage.',
    ],
  },
  securite: {
    idcc: '1351', nom: 'Prévention et sécurité',
    specificites: [
      'Carte professionnelle CNAPS obligatoire — à vérifier AVANT toute embauche.',
      'Majorations de nuit, dimanche et jours fériés très encadrées.',
      'Reprise du personnel en cas de changement de prestataire (transfert conventionnel).',
      'Habillage et déshabillage : temps rémunéré.',
    ],
  },
  proprete: {
    idcc: '3043', nom: 'Entreprises de propreté et services associés',
    specificites: [
      'Transfert conventionnel du personnel en cas de perte de marché (annexe 7) — point majeur.',
      'Temps partiel très répandu : encadrement strict des horaires et des interruptions.',
    ],
  },
  immobilier: {
    idcc: '1527', nom: 'Immobilier (administrateurs de biens, agents immobiliers)',
    specificites: [
      'Statut des négociateurs immobiliers : salarié ou agent commercial, régimes très différents.',
      'Rémunération variable encadrée conventionnellement.',
      'Carte professionnelle obligatoire pour l\'activité de transaction.',
    ],
  },
  mode: {
    idcc: '1517', nom: 'Commerces de détail non alimentaires',
    specificites: [
      'Travail du dimanche : régime dérogatoire selon la zone (touristique, commerciale).',
      'Grille de classification simple, minima proches du SMIC sur les premiers niveaux.',
      'Vérifier si une convention plus spécifique s\'applique (habillement, chaussure, optique…).',
    ],
  },
  salle_sport: {
    idcc: '2511', nom: 'Sport',
    specificites: [
      'Contrat à durée déterminée spécifique (CDD d\'usage) encadré pour certains postes.',
      'Diplôme d\'État exigé pour l\'encadrement contre rémunération — à vérifier avant embauche.',
      'Amplitude horaire et travail en soirée fréquents : contreparties à prévoir.',
    ],
  },
  sante: {
    idcc: '1147', nom: 'Cabinets médicaux (personnel des cabinets de médecins)',
    specificites: [
      'Secret professionnel opposable, à rappeler dans le contrat.',
      'Selon l\'activité, une autre convention peut primer (dentaires 1619, vétérinaires 2564).',
    ],
  },
  veterinaire: {
    idcc: '2564', nom: 'Vétérinaires (personnel salarié des cabinets et cliniques)',
    specificites: [
      'Régime des gardes et astreintes propre à la branche.',
      'Classification distincte entre auxiliaire spécialisé et personnel administratif.',
    ],
  },
  pharmacie: {
    idcc: '1996', nom: 'Pharmacie d\'officine',
    specificites: [
      'Coefficients conventionnels stricts selon le diplôme — déterminants pour le salaire minimum.',
      'Gardes et urgences : régime spécifique.',
    ],
  },
  fleuriste: {
    idcc: '1978', nom: 'Fleuristes, vente et services des animaux familiers',
    specificites: [
      'Travail du dimanche et des jours fériés fréquent : majorations conventionnelles.',
      'Port de charges et travail au froid : prévention à documenter.',
    ],
  },
  comptable: {
    idcc: '787', nom: 'Cabinets d\'experts-comptables et de commissaires aux comptes',
    specificites: [
      'Classification par coefficients très structurée.',
      'Période de forte activité (fiscale) : aménagement du temps de travail encadré.',
    ],
  },
  batiment: {
    idcc: '1596 / 1597', nom: 'Bâtiment — ouvriers (selon effectif : ≤ 10 ou > 10 salariés)',
    specificites: [
      'La convention dépend de l\'EFFECTIF : 1596 jusqu\'à 10 salariés, 1597 au-delà. Erreur fréquente.',
      'Indemnités de petits déplacements (trajet, transport, repas) — poste de coût majeur.',
      'ETAM et cadres relèvent de conventions distinctes (2609, 2420).',
      'Carte BTP obligatoire pour chaque salarié sur chantier.',
    ],
  },
};

// Les métiers du bâtiment partagent la même convention : on les rattache
// explicitement plutôt que d'attendre une famille « batiment » qui n'existe
// pas dans la taxonomie.
PAR_FAMILLE.plombier = PAR_FAMILLE.batiment;
PAR_FAMILLE.electricien = PAR_FAMILLE.batiment;
PAR_FAMILLE.menuisier = PAR_FAMILLE.batiment;
PAR_FAMILLE.macon = PAR_FAMILLE.batiment;
PAR_FAMILLE.peintre = PAR_FAMILLE.batiment;

// Le nettoyage est reconnu sous « menage » par la taxonomie.
PAR_FAMILLE.menage = PAR_FAMILLE.proprete;

// Les commerces alimentaires de proximité relèvent de conventions voisines ;
// à défaut de la leur, celle du détail alimentaire est le meilleur point de
// départ — et l'agent demande confirmation de l'IDCC, comme toujours.
PAR_FAMILLE.fromagerie = {
  idcc: '1505', nom: 'Commerce de détail alimentaire spécialisé',
  specificites: [
    'Vérifier si une convention plus précise existe pour le produit (crémerie, poissonnerie).',
    'Travail du dimanche matin fréquent : régime des commerces alimentaires.',
    'Chaîne du froid : obligations de formation et de traçabilité à documenter.',
  ],
};
PAR_FAMILLE.epicerie = PAR_FAMILLE.fromagerie;
PAR_FAMILLE.poissonnerie = PAR_FAMILLE.fromagerie;
PAR_FAMILLE.primeur = PAR_FAMILLE.fromagerie;

/** Le repli, quand le métier n'est pas reconnu. */
const REPLI: Convention = {
  idcc: 'à déterminer', nom: 'convention collective non identifiée',
  specificites: [
    'L\'IDCC figure sur le bulletin de paie du client : le lui demander avant toute rédaction.',
    'À défaut, le Code du travail s\'applique seul — mais c\'est rarement le cas réel en France.',
  ],
};

/** La convention applicable, déduite du métier. */
export function conventionPour(businessType?: string | null): Convention {
  for (const f of famillesDe(businessType)) {
    if (PAR_FAMILLE[f]) return PAR_FAMILLE[f];
  }
  return REPLI;
}

/**
 * Le bloc injecté dans le prompt de Sara et Louis.
 *
 * `idccConnu` prime : s'il vient du dossier du client (bulletin de paie), on
 * ne devine plus.
 */
export function blocConvention(businessType?: string | null, idccConnu?: string | null): string {
  const c = conventionPour(businessType);
  const certain = !!idccConnu;
  const idcc = idccConnu || c.idcc;

  return `\n=== CONVENTION COLLECTIVE — PRIME SUR LE CODE DU TRAVAIL ===
Convention applicable : ${c.nom} (IDCC ${idcc})${certain ? ' — confirmée par le dossier client.' : ' — déduite du métier, à faire confirmer.'}

RÈGLE ABSOLUE : le Code du travail est un PLANCHER. La convention de branche
l'améliore presque toujours sur les points qui comptent — période d'essai,
préavis, minima, majorations, ancienneté, jours fériés. Tu raisonnes et tu
rédiges à partir de la CONVENTION, et tu ne cites le Code du travail que
lorsque la branche est muette ou moins favorable.

Points d'attention propres à cette branche :
${c.specificites.map(sp => `- ${sp}`).join('\n')}

CE QUE TU FAIS SYSTÉMATIQUEMENT :
1. Tu indiques en tête de document la convention appliquée et son IDCC.
2. Tu ne cites AUCUN montant ni durée chiffrée comme certain : ils changent par
   avenant, parfois plusieurs fois par an. Tu écris le champ entre crochets et
   tu dis où le vérifier (Légifrance, ou le bulletin de paie).
3. ${certain ? 'L\'IDCC vient du dossier client : tu l\'utilises tel quel.' : 'Tu demandes au client de confirmer son IDCC — il figure sur son bulletin de paie — avant de considérer le document comme définitif.'}
4. Sur une situation à enjeu (licenciement, rupture conventionnelle, contentieux,
   requalification), tu prépares le document ET tu recommandes une relecture par
   un professionnel. Tu ne remplaces pas un avocat.
`;
}
