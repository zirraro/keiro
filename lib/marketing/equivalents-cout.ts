/**
 * CE QUE ÇA COÛTE, DIT DANS LES TERMES DU COMMERÇANT.
 *
 * Demande du fondateur (2026-08-06) : « pour un restaurateur, ça coûte moins
 * qu'une journée d'extra — mais pour le mois, trouve d'autres exemples, et
 * pour les autres types de business élargis. »
 *
 * ── Pourquoi remplacer le pourcentage ──
 *
 * Le site annonçait « −95 %, 2 350 € à 4 850 € économisés ». Un patron de
 * restaurant n'a jamais envisagé de payer 3 000 € par mois un community
 * manager : le chiffre ne lui parle pas d'économie, il lui signale qu'on
 * s'adresse à quelqu'un d'autre. Une économie ne se comprend que par rapport à
 * une dépense qu'on fait DÉJÀ.
 *
 * D'où ces équivalences : elles ne comparent pas à un prix de marché théorique
 * mais à une ligne du compte d'exploitation que le gérant connaît par cœur,
 * dans son métier à lui.
 *
 * ── La règle de fabrication ──
 *
 * Chaque équivalence porte sur le MOIS, jamais sur la journée : c'est la
 * période de facturation, et comparer un abonnement mensuel à une dépense d'un
 * jour serait malhonnête même si c'est flatteur.
 *
 * Et chacune vise le MINIMUM crédible, pas une marge de sécurité. La première
 * version demandait « deux nuitées » là où une seule couvre largement 49 € : à
 * force de vouloir ne pas exagérer, l'argument s'affaiblissait et laissait
 * croire que c'était plus cher que ça ne l'est. Le bon dosage est le plus petit
 * chiffre encore incontestable — celui qui fait dire « ah oui, c'est vite
 * réglé » plutôt que « il en faut quand même quelques-uns ».
 */
import { famillesDe } from '../business-families';

export interface Equivalent {
  /** La dépense connue, telle qu'il la nomme. */
  depense: string;
  /** Le rapprochement, en une phrase qui se lit à voix haute. */
  phrase: string;
}

/**
 * Équivalences par famille de métier.
 *
 * Trois par métier : l'interface les fait défiler, et une seule paraîtrait
 * choisie au hasard là où trois installent l'idée qu'on connaît le métier.
 */
const PAR_METIER: Record<string, Equivalent[]> = {
  restaurant: [
    { depense: "un extra", phrase: "Moins qu’un seul service d’extra le samedi soir." },
    { depense: "les couverts", phrase: "Trois menus du midi dans le mois, et c’est payé." },
    { depense: "une commission", phrase: "Moins que la commission sur dix commandes livrées." },
  ],
  boulangerie: [
    { depense: "une matinée", phrase: "Une demi-journée de vente, et c’est largement payé." },
    { depense: "les invendus", phrase: "Moins que deux plateaux de viennoiseries invendus." },
    { depense: "un extra", phrase: "Moins qu’une matinée de renfort le dimanche." },
  ],
  patisserie: [
    { depense: "une commande", phrase: "Un seul gâteau de fête dans le mois." },
    { depense: "les pertes", phrase: "Moins que ce qu’on jette une semaine de pluie." },
    { depense: "un extra", phrase: "Moins qu’une demi-journée d’aide en laboratoire." },
  ],
  coiffeur: [
    { depense: "une couleur", phrase: "Une seule couleur dans le mois, et c’est payé." },
    { depense: "deux coupes", phrase: "Deux coupes homme, et le compte y est." },
    { depense: "un créneau vide", phrase: "Moins que deux créneaux non remplis dans le mois." },
  ],
  institut_beaute: [
    { depense: "un soin", phrase: "Un seul soin visage dans le mois." },
    { depense: "une cabine vide", phrase: "Moins que deux créneaux perdus." },
    { depense: "les produits", phrase: "Moins qu’une commande de produits." },
  ],
  bar: [
    { depense: "un service", phrase: "Moins qu’une soirée d’extra derrière le comptoir." },
    { depense: "les consommations", phrase: "Une dizaine de tournées dans le mois." },
    { depense: "la casse", phrase: "Moins que la casse de verres sur un semestre." },
  ],
  cafe: [
    { depense: "les cafés", phrase: "Un café par jour ouvré, et c’est réglé." },
    { depense: "un extra", phrase: "Moins qu’une matinée de renfort le samedi." },
    { depense: "la terrasse", phrase: "Moins qu’un service de terrasse sous la pluie." },
  ],
  boucherie: [
    { depense: "une commande", phrase: "Une seule commande de fête dans le mois." },
    { depense: "les invendus", phrase: "Moins que ce qu’on démarque une semaine creuse." },
    { depense: "un extra", phrase: "Moins qu’une demi-journée de renfort le samedi." },
  ],
  fleuriste: [
    { depense: "une composition", phrase: "Un seul bouquet de cérémonie dans le mois." },
    { depense: "les pertes", phrase: "Moins que les fleurs jetées en fin de semaine." },
    { depense: "une livraison", phrase: "Le prix de deux livraisons en ville." },
  ],
  garage: [
    { depense: "une révision", phrase: "Moins qu’une seule révision complète." },
    { depense: "un pont vide", phrase: "Moins qu’une heure de pont inoccupé." },
    { depense: "les pièces", phrase: "Moins qu’un jeu de plaquettes." },
  ],
  plombier: [
    { depense: "une intervention", phrase: "Une seule intervention dans le mois le couvre." },
    { depense: "un déplacement à vide", phrase: "Moins qu’un déplacement pour rien." },
    { depense: "un devis perdu", phrase: "Moins que le temps passé sur un devis non signé." },
  ],
  electricien: [
    { depense: "une intervention", phrase: "Une seule intervention dans le mois." },
    { depense: "un déplacement", phrase: "Moins qu’un déplacement sans suite." },
    { depense: "le matériel", phrase: "Moins qu’une commande de petit appareillage." },
  ],
  menuisier: [
    { depense: "un devis", phrase: "Une fraction d’un seul aménagement sur mesure." },
    { depense: "les chutes", phrase: "Moins que les chutes de bois d’un chantier." },
    { depense: "une demi-journée", phrase: "Moins qu’une demi-journée d’atelier facturée." },
  ],
  hotel: [
    { depense: "une nuitée", phrase: "Une seule nuitée dans le mois, et c’est amorti." },
    { depense: "une chambre vide", phrase: "Moins qu’une chambre inoccupée une nuit." },
    { depense: "la commission", phrase: "Moins que la commission sur deux réservations en ligne." },
  ],
  salle_sport: [
    { depense: "un abonnement", phrase: "Un abonnement mensuel et demi, et c’est payé." },
    { depense: "un départ", phrase: "Moins qu’un adhérent qui ne revient pas." },
    { depense: "un coach", phrase: "Moins qu’une demi-journée de coach." },
  ],
  sante: [
    { depense: "une consultation", phrase: "Une à deux consultations dans le mois." },
    { depense: "un rendez-vous manqué", phrase: "Moins que deux rendez-vous non honorés." },
    { depense: "le secrétariat", phrase: "Moins qu’une demi-journée de secrétariat." },
  ],
  veterinaire: [
    { depense: "une consultation", phrase: "Une seule consultation dans le mois." },
    { depense: "un rendez-vous manqué", phrase: "Moins que deux rendez-vous non honorés." },
    { depense: "le secrétariat", phrase: "Moins qu’une matinée de secrétariat." },
  ],
  immobilier: [
    { depense: "une commission", phrase: "Une fraction infime d’une seule commission." },
    { depense: "les annonces", phrase: "Moins qu’une semaine de diffusion sur un portail." },
    { depense: "les visites", phrase: "Moins que le temps perdu en visites sans suite." },
  ],
  mode: [
    { depense: "une vente", phrase: "Une seule pièce vendue dans le mois." },
    { depense: "les soldes", phrase: "Moins que la démarque sur quelques articles." },
    { depense: "une vitrine", phrase: "Moins qu’un changement de vitrine." },
  ],
  comptable: [
    { depense: "une heure facturée", phrase: "Moins d’une heure facturée dans le mois." },
    { depense: "un dossier", phrase: "Une fraction d’un seul dossier annuel." },
    { depense: "la prospection", phrase: "Moins qu’une journée de salon professionnel." },
  ],
  agence: [
    { depense: "une demi-journée", phrase: "Moins d’une demi-journée facturée." },
    { depense: "un freelance", phrase: "Une fraction du coût d’un rédacteur externe." },
    { depense: "la publicité", phrase: "Moins que deux jours de budget publicitaire." },
  ],
  photographe: [
    { depense: "une séance", phrase: "Une seule séance dans le mois, et c’est payé." },
    { depense: "le matériel", phrase: "Moins qu’une location d’objectif pour un week-end." },
    { depense: "un déplacement", phrase: "Moins qu’un déplacement sans commande." },
  ],
};

/**
 * Le repli, pour un métier hors taxonomie.
 *
 * Volontairement neutre et vérifiable par n'importe qui : on ne prétend pas
 * connaître un métier qu'on n'a pas reconnu. Un exemple emprunté à un autre
 * secteur se remarquerait immédiatement, et c'est exactement ce qui décrédibilise.
 */
const REPLI: Equivalent[] = [
  { depense: 'une journée de travail', phrase: "Moins qu'une journée de travail facturée." },
  { depense: 'un client perdu', phrase: 'Moins que ce que rapporte un seul client gagné dans le mois.' },
  { depense: 'la publicité', phrase: 'Moins qu\'une semaine de publicité en ligne.' },
];

/**
 * Les équivalences à montrer pour ce commerce.
 *
 * Toujours trois : l'interface les fait défiler, et une seule paraîtrait
 * choisie au hasard.
 */
export function equivalentsPour(businessType?: string | null): Equivalent[] {
  const familles = famillesDe(businessType);
  for (const f of familles) {
    if (PAR_METIER[f]) return PAR_METIER[f];
  }
  return REPLI;
}

/** Tous les métiers couverts — pour un défilé sur la page publique. */
export function equivalentsVitrine(): Array<{ metier: string; equivalent: Equivalent }> {
  const ETIQUETTE: Record<string, string> = {
    restaurant: 'Restaurant', boulangerie: 'Boulangerie', coiffeur: 'Salon de coiffure',
    institut_beaute: 'Institut de beauté', garage: 'Garage', plombier: 'Plombier',
    fleuriste: 'Fleuriste', hotel: 'Hôtel', boucherie: 'Boucherie',
    salle_sport: 'Salle de sport', sante: 'Cabinet', immobilier: 'Agence immobilière',
    cafe: 'Café', mode: 'Boutique', menuisier: 'Menuisier', photographe: 'Photographe',
  };
  return Object.entries(ETIQUETTE)
    .filter(([cle]) => PAR_METIER[cle])
    .map(([cle, metier]) => ({ metier, equivalent: PAR_METIER[cle][0] }));
}
