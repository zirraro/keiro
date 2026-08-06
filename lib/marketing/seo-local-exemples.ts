/**
 * Ce que Théo optimise sur une fiche Google, dit dans le métier du client.
 *
 * Demande du fondateur (2026-08-06) : « cette section SEO local Google doit
 * être mieux présentée. Ça génère quoi ? Mets-toi à la place du client,
 * imagine un restaurant ou un hôtel qui doit gérer cet espace. »
 *
 * ── Le défaut corrigé ──
 *
 * Les cinq exemples étaient écrits pour un salon de coiffure et servis à tout
 * le monde. Un restaurateur y lisait « balayage, couleur, spécialiste bouclés »
 * et « coiffeur Lyon 2 : #7 → #3 ». Il ne se demandait pas ce que Théo fait
 * pour lui : il se demandait si on s'était trompé de compte.
 *
 * Chaque métier a donc ses propres exemples, avec ses mots à lui — la carte
 * pour le restaurant, les nuitées pour l'hôtel, les créneaux pour l'institut.
 */
import { famillesDe } from '../business-families';

export interface ExempleSeo {
  /** Ce que Théo fait, en une ligne. */
  titre: string;
  /** Pourquoi ça compte pour lui. */
  pourquoi: string;
  /** À quoi ça ressemble concrètement sur sa fiche. */
  exemple: string;
}

/** Les cinq leviers, déclinés par métier. */
type Jeu = [ExempleSeo, ExempleSeo, ExempleSeo, ExempleSeo, ExempleSeo];

const PAR_METIER: Record<string, Jeu> = {
  restaurant: [
    { titre: 'Description de ta fiche', pourquoi: 'Les mots que les gens tapent avant de choisir où manger.',
      exemple: '« Restaurant français Lyon 2 — produits frais, terrasse, menu du midi »' },
    { titre: 'Publications sur ta fiche', pourquoi: 'Google met en avant les fiches vivantes.',
      exemple: '« Cette semaine à la carte : ris de veau, girolles »' },
    { titre: 'Catégories et attributs', pourquoi: "Ce qui fait apparaître ta fiche dans les bons filtres.",
      exemple: 'Restaurant français · +Terrasse, Accès PMR, Réservation' },
    { titre: 'Ta position dans les recherches', pourquoi: 'Savoir si tu montes ou si tu descends.',
      exemple: '« restaurant Lyon 2 » : 7ᵉ → 3ᵉ en 4 semaines' },
    { titre: 'Photos et questions', pourquoi: 'Une fiche sans photo récente inspire moins confiance.',
      exemple: '« Vous avez un menu végétarien ? » → répondu' },
  ],
  hotel: [
    { titre: 'Description de ta fiche', pourquoi: 'Les mots que tapent les voyageurs avant de réserver.',
      exemple: '« Hôtel centre-ville — parking, petit-déjeuner, wifi »' },
    { titre: 'Publications sur ta fiche', pourquoi: 'Annonce tes disponibilités quand les gens cherchent.',
      exemple: '« Week-end de mai : chambres disponibles »' },
    { titre: 'Catégories et attributs', pourquoi: 'Les filtres décident si tu apparais ou non.',
      exemple: 'Hôtel · +Parking gratuit, Animaux admis, Climatisation' },
    { titre: 'Ta position dans les recherches', pourquoi: 'Savoir si tu montes ou si tu descends.',
      exemple: '« hôtel proche gare » : 9ᵉ → 4ᵉ en 6 semaines' },
    { titre: 'Photos et questions', pourquoi: 'On ne réserve pas une chambre qu\'on ne voit pas.',
      exemple: '« Le petit-déjeuner est-il inclus ? » → répondu' },
  ],
  coiffeur: [
    { titre: 'Description de ta fiche', pourquoi: 'Les termes que tapent tes futures clientes.',
      exemple: '« Salon de coiffure Lyon 2 — balayage, couleur, spécialiste bouclés »' },
    { titre: 'Publications sur ta fiche', pourquoi: 'Google met en avant les fiches vivantes.',
      exemple: '« Cette semaine : −20 % sur ta première couleur »' },
    { titre: 'Catégories et attributs', pourquoi: 'Ce qui te fait apparaître dans les bons filtres.',
      exemple: 'Salon de coiffure · +Accès PMR, Sur rendez-vous' },
    { titre: 'Ta position dans les recherches', pourquoi: 'Savoir si tu montes ou si tu descends.',
      exemple: '« coiffeur Lyon 2 » : 7ᵉ → 3ᵉ en 4 semaines' },
    { titre: 'Photos et questions', pourquoi: 'Les avant/après décident souvent du premier rendez-vous.',
      exemple: '« Vous faites les mèches ? » → répondu' },
  ],
  institut_beaute: [
    { titre: 'Description de ta fiche', pourquoi: 'Les soins que les gens tapent, avec ta ville.',
      exemple: '« Institut de beauté — épilation, soin visage, semi-permanent »' },
    { titre: 'Publications sur ta fiche', pourquoi: 'Remplit les créneaux creux de la semaine.',
      exemple: '« Cabine libre jeudi matin : soin visage à −15 % »' },
    { titre: 'Catégories et attributs', pourquoi: 'Ce qui te fait apparaître dans les bons filtres.',
      exemple: 'Institut de beauté · +Sur rendez-vous, Cartes acceptées' },
    { titre: 'Ta position dans les recherches', pourquoi: 'Savoir si tu montes ou si tu descends.',
      exemple: '« institut beauté Lyon 3 » : 8ᵉ → 4ᵉ en 5 semaines' },
    { titre: 'Photos et questions', pourquoi: 'Une cabine qu\'on voit rassure avant de réserver.',
      exemple: '« Faites-vous le semi-permanent ? » → répondu' },
  ],
  boulangerie: [
    { titre: 'Description de ta fiche', pourquoi: 'Ce que les gens tapent en cherchant du bon pain.',
      exemple: '« Boulangerie artisanale — levain, viennoiseries maison »' },
    { titre: 'Publications sur ta fiche', pourquoi: 'Ta vitrine, vue par ceux qui ne passent pas devant.',
      exemple: '« Galettes des rois disponibles jusqu\'au 31 »' },
    { titre: 'Catégories et attributs', pourquoi: 'Ce qui te fait apparaître dans les bons filtres.',
      exemple: 'Boulangerie · +Vente à emporter, Ouvert le dimanche' },
    { titre: 'Ta position dans les recherches', pourquoi: 'Savoir si tu montes ou si tu descends.',
      exemple: '« boulangerie ouverte dimanche » : 11ᵉ → 2ᵉ' },
    { titre: 'Photos et questions', pourquoi: 'Une vitrine appétissante fait traverser la rue.',
      exemple: '« Vous faites les gâteaux d\'anniversaire ? » → répondu' },
  ],
  garage: [
    { titre: 'Description de ta fiche', pourquoi: 'Les pannes et prestations que les gens tapent.',
      exemple: '« Garage toutes marques — révision, embrayage, prêt de véhicule »' },
    { titre: 'Publications sur ta fiche', pourquoi: 'Remplit les ponts libres de la semaine.',
      exemple: '« Forfait révision + vidange : 129 € ce mois-ci »' },
    { titre: 'Catégories et attributs', pourquoi: 'Ce qui te fait apparaître dans les bons filtres.',
      exemple: 'Garage automobile · +Devis gratuit, Véhicule de prêt' },
    { titre: 'Ta position dans les recherches', pourquoi: 'Savoir si tu montes ou si tu descends.',
      exemple: '« garage pas cher Villeurbanne » : 12ᵉ → 5ᵉ' },
    { titre: 'Photos et questions', pourquoi: 'Un atelier propre en photo rassure avant d\'appeler.',
      exemple: '« Faites-vous le contrôle avant vente ? » → répondu' },
  ],
};

/** Le repli, neutre et vrai pour n'importe quel commerce. */
const REPLI: Jeu = [
  { titre: 'Description de ta fiche', pourquoi: 'Les mots que tes clients tapent pour trouver un commerce comme le tien.',
    exemple: 'Ton activité, ta ville, et ce qui te distingue' },
  { titre: 'Publications sur ta fiche', pourquoi: 'Google met en avant les fiches vivantes.',
    exemple: 'Une actualité ou une offre, chaque semaine' },
  { titre: 'Catégories et attributs', pourquoi: 'Ce qui te fait apparaître dans les bons filtres.',
    exemple: 'Catégorie principale bien choisie, options renseignées' },
  { titre: 'Ta position dans les recherches', pourquoi: 'Savoir si tu montes ou si tu descends.',
    exemple: 'Ton classement suivi semaine après semaine' },
  { titre: 'Photos et questions', pourquoi: 'Une fiche sans photo récente inspire moins confiance.',
    exemple: 'Photos tenues à jour, questions répondues' },
];

/** Les cinq leviers, dans les mots du métier du client. */
export function exemplesSeoPour(businessType?: string | null): ExempleSeo[] {
  for (const f of famillesDe(businessType)) {
    if (PAR_METIER[f]) return PAR_METIER[f];
  }
  return REPLI;
}
