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
 * Et chacune reste sous-estimée plutôt que sur-estimée. Un gérant qui trouve
 * l'exemple exagéré doute de tout le reste ; un exemple prudent qu'il révise à
 * la hausse dans sa tête travaille pour nous.
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
    { depense: 'un extra', phrase: "Moins qu'un extra sur deux services du samedi." },
    { depense: 'les couverts', phrase: 'Deux menus du midi par semaine, et c\'est payé.' },
    { depense: 'une plateforme de livraison', phrase: 'Moins que la commission sur une trentaine de commandes livrées.' },
  ],
  boulangerie: [
    { depense: 'la vente du matin', phrase: 'Trente baguettes par semaine couvrent le mois.' },
    { depense: 'un extra du week-end', phrase: "Moins qu'une matinée de renfort le dimanche." },
    { depense: 'la vitrine', phrase: 'Le prix de deux plateaux de viennoiseries invendus.' },
  ],
  patisserie: [
    { depense: 'une commande', phrase: 'Trois gâteaux de fête par mois, et le compte y est.' },
    { depense: 'les pertes', phrase: "Moins que ce qu'on jette une semaine de pluie." },
    { depense: 'un extra', phrase: "Moins qu'une journée d'aide en laboratoire." },
  ],
  coiffeur: [
    { depense: 'les rendez-vous', phrase: 'Deux couleurs par mois, et c\'est réglé.' },
    { depense: 'une place vide', phrase: 'Moins que trois créneaux non remplis dans le mois.' },
    { depense: 'un apprenti', phrase: "Une fraction du coût d'une journée d'apprenti." },
  ],
  institut_beaute: [
    { depense: 'les soins', phrase: 'Deux soins visage par mois suffisent à le couvrir.' },
    { depense: 'une cabine vide', phrase: 'Moins que quatre créneaux perdus dans le mois.' },
    { depense: 'les produits', phrase: 'Le prix d\'une commande de produits de milieu de gamme.' },
  ],
  bar: [
    { depense: 'le service', phrase: "Moins qu'une soirée d'extra derrière le comptoir." },
    { depense: 'les consommations', phrase: 'Une quinzaine de tournées dans le mois.' },
    { depense: 'la casse', phrase: 'Moins que la casse de verres sur un trimestre.' },
  ],
  cafe: [
    { depense: 'les cafés', phrase: 'Une trentaine de cafés par mois, et c\'est payé.' },
    { depense: 'un extra', phrase: "Moins qu'une matinée de renfort le samedi." },
    { depense: 'la terrasse', phrase: 'Le prix de deux services de terrasse sous la pluie.' },
  ],
  boucherie: [
    { depense: 'les commandes', phrase: 'Deux commandes de fête par mois le couvrent.' },
    { depense: 'les invendus', phrase: "Moins que ce qu'on démarque une semaine creuse." },
    { depense: 'un extra', phrase: "Moins qu'une journée de renfort le samedi." },
  ],
  fleuriste: [
    { depense: 'les compositions', phrase: 'Trois bouquets de cérémonie par mois.' },
    { depense: 'les pertes', phrase: 'Moins que les fleurs jetées en fin de semaine.' },
    { depense: 'une livraison', phrase: 'Le prix de quelques livraisons en ville.' },
  ],
  garage: [
    { depense: 'les révisions', phrase: 'Une révision complète par mois, et c\'est réglé.' },
    { depense: 'un pont vide', phrase: 'Moins que deux heures de pont inoccupé.' },
    { depense: 'les pièces', phrase: 'Le prix d\'un jeu de plaquettes et de disques.' },
  ],
  plombier: [
    { depense: 'une intervention', phrase: 'Une seule intervention dans le mois le couvre.' },
    { depense: 'un déplacement à vide', phrase: 'Moins que deux déplacements pour rien.' },
    { depense: 'un devis perdu', phrase: 'Moins que le temps passé sur un devis non signé.' },
  ],
  electricien: [
    { depense: 'une intervention', phrase: 'Une mise aux normes de tableau dans le mois.' },
    { depense: 'un déplacement', phrase: 'Moins que deux déplacements sans suite.' },
    { depense: 'le matériel', phrase: 'Le prix d\'une commande de petit appareillage.' },
  ],
  menuisier: [
    { depense: 'un devis', phrase: 'Une fraction d\'un aménagement sur mesure.' },
    { depense: 'les chutes', phrase: 'Moins que les chutes de bois d\'un chantier.' },
    { depense: 'une journée d\'atelier', phrase: "Moins qu'une journée d'atelier facturée." },
  ],
  hotel: [
    { depense: 'les nuitées', phrase: 'Deux nuitées par mois, et c\'est amorti.' },
    { depense: 'une chambre vide', phrase: 'Moins qu\'une chambre inoccupée deux nuits.' },
    { depense: 'la commission', phrase: 'Moins que la commission sur trois réservations en ligne.' },
  ],
  salle_sport: [
    { depense: 'les abonnements', phrase: 'Deux abonnements mensuels le couvrent.' },
    { depense: 'un départ', phrase: 'Moins qu\'un adhérent qui ne revient pas.' },
    { depense: 'un coach', phrase: 'Une fraction d\'une journée de coach.' },
  ],
  sante: [
    { depense: 'les consultations', phrase: 'Deux consultations par mois suffisent.' },
    { depense: 'un créneau vide', phrase: 'Moins que trois rendez-vous non honorés.' },
    { depense: 'le secrétariat', phrase: 'Bien moins qu\'une demi-journée de secrétariat.' },
  ],
  veterinaire: [
    { depense: 'les consultations', phrase: 'Deux consultations dans le mois.' },
    { depense: 'un rendez-vous manqué', phrase: 'Moins que trois rendez-vous non honorés.' },
    { depense: 'le secrétariat', phrase: "Moins qu'une matinée de secrétariat." },
  ],
  immobilier: [
    { depense: 'une commission', phrase: 'Une fraction infime d\'une seule commission.' },
    { depense: 'les annonces', phrase: 'Moins qu\'un mois de diffusion sur un portail.' },
    { depense: 'les visites', phrase: 'Moins que le temps perdu en visites sans suite.' },
  ],
  mode: [
    { depense: 'les ventes', phrase: 'Deux pièces vendues par mois le couvrent.' },
    { depense: 'les soldes', phrase: 'Moins que la démarque sur un portant.' },
    { depense: 'une vitrine', phrase: 'Le prix d\'un changement de vitrine.' },
  ],
  comptable: [
    { depense: 'un dossier', phrase: 'Une fraction d\'un dossier annuel.' },
    { depense: 'une heure facturée', phrase: 'Moins de deux heures facturées dans le mois.' },
    { depense: 'la prospection', phrase: 'Moins qu\'un salon professionnel sur l\'année.' },
  ],
  agence: [
    { depense: 'une journée', phrase: 'Moins d\'une demi-journée facturée.' },
    { depense: 'un freelance', phrase: 'Une fraction du coût d\'un rédacteur externe.' },
    { depense: 'la publicité', phrase: 'Moins qu\'une semaine de budget publicitaire.' },
  ],
  photographe: [
    { depense: 'une séance', phrase: 'Une séance par mois, et c\'est payé.' },
    { depense: 'le matériel', phrase: 'Moins qu\'une location d\'objectif pour un week-end.' },
    { depense: 'un déplacement', phrase: 'Moins que deux déplacements sans commande.' },
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
