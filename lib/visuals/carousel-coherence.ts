/**
 * Cohérence d'un carrousel — chaque diapositive doit parler du même commerce.
 *
 * Constat du fondateur (2026-08-05) : « le dernier post Insta est super,
 * seulement il y a une image de fruits/salade genre cuisine qui s'est glissée,
 * et une autre où on voit quelqu'un qui pointe un nez avec du bazar derrière —
 * pas de lien avec le business, qui était la coiffure. »
 *
 * ── La cause, trouvée dans le code ──
 *
 * Quand le modèle ne fournit pas de brief par diapositive, le repli produisait
 * deux visuels à partir de prompts ÉCRITS EN DUR POUR UN RESTAURANT :
 * « carnet de réservations rempli, sourire d'un client en pleine bouchée, main
 * qui compte un pourboire, salle pleine vue du patron ». Appliqué à un salon
 * de coiffure, ce repli demandait littéralement une salle à manger et
 * quelqu'un en train de manger. L'image de cuisine n'était pas un accident du
 * générateur : elle était commandée.
 *
 * ── Deux garde-fous, dans cet ordre ──
 *
 * 1. Le repli est reconstruit à partir du métier réel. C'est ce qui empêche le
 *    problème d'exister.
 * 2. Un contrôle déterministe rejette une diapositive dont le brief emploie un
 *    vocabulaire étranger au commerce. Il tourne sans appel modèle, donc sans
 *    coût et même quand le crédit est épuisé — et il attrape aussi les briefs
 *    hors-sujet venus du modèle, pas seulement ceux du repli.
 */
import { famillesDe } from '../business-families';

/**
 * Univers de vocabulaire par grande famille.
 *
 * Volontairement grossier : on ne cherche pas à juger la finesse d'un visuel,
 * seulement à repérer qu'on parle de nourriture chez un coiffeur. Un contrôle
 * trop fin produirait des faux positifs et bloquerait des visuels corrects,
 * ce qui coûte plus cher qu'il ne rapporte.
 */
const UNIVERS: Record<string, string[]> = {
  nourriture: ['salade', 'fruit', 'legume', 'plat', 'assiette', 'cuisine', 'chef', 'restaurant', 'menu', 'dish', 'food', 'meal', 'dining', 'salad', 'plate', 'kitchen', 'bouchee', 'mid-bite', 'reservation book', 'carnet de reservation', 'salle a manger', 'table dressee', 'pourboire', 'tip'],
  cheveux: ['cheveu', 'coiffure', 'coupe', 'brushing', 'coloration', 'salon de coiffure', 'hair', 'haircut', 'barber', 'shampoing'],
  soin: ['soin', 'massage', 'peau', 'ongle', 'manucure', 'esthetique', 'spa', 'skincare', 'facial', 'nail'],
  chantier: ['chantier', 'travaux', 'outil', 'perceuse', 'tuyau', 'toiture', 'peinture murale', 'carrelage', 'construction', 'plumbing', 'renovation'],
  auto: ['voiture', 'moteur', 'pneu', 'garage', 'atelier mecanique', 'car', 'engine', 'vehicle'],
  bureau: ['bureau', 'reunion', 'ordinateur portable', 'graphique', 'tableur', 'meeting', 'laptop', 'office', 'whiteboard'],
  animal: ['chien', 'chat', 'animal', 'veterinaire', 'pet', 'dog', 'cat'],
  fleur: ['fleur', 'bouquet', 'floral', 'flower'],
  sport: ['halteres', 'musculation', 'tapis de course', 'gym', 'workout', 'dumbbell', 'fitness'],
};

/** Quels univers sont légitimes pour une famille de métier. */
const UNIVERS_ATTENDUS: Record<string, string[]> = {
  restaurant: ['nourriture'], boulangerie: ['nourriture'], patisserie: ['nourriture'],
  traiteur: ['nourriture'], boucherie: ['nourriture'], fromagerie: ['nourriture'],
  epicerie: ['nourriture'], primeur: ['nourriture'], poissonnerie: ['nourriture'],
  cafe: ['nourriture'], bar: ['nourriture'], glacier: ['nourriture'], chocolat: ['nourriture'],
  caviste: ['nourriture'],
  coiffeur: ['cheveux', 'soin'], institut_beaute: ['soin', 'cheveux'], tatoueur: ['soin'],
  plombier: ['chantier'], electricien: ['chantier'], menuisier: ['chantier'],
  macon: ['chantier'], couvreur: ['chantier'], peintre: ['chantier'],
  carreleur: ['chantier'], serrurier: ['chantier'], renovation: ['chantier'],
  paysagiste: ['chantier', 'fleur'], artisan: ['chantier'],
  garage: ['auto'], velo: ['auto'], auto_ecole: ['auto'], vtc: ['auto'],
  comptable: ['bureau'], avocat: ['bureau'], assurance: ['bureau'], agence: ['bureau'],
  consultant: ['bureau'], recrutement: ['bureau'], formation: ['bureau'],
  b2b: ['bureau'], pme: ['bureau'], immobilier: ['bureau'], freelance: ['bureau'],
  veterinaire: ['animal'], fleuriste: ['fleur'], jardinerie: ['fleur'],
  salle_sport: ['sport'], coach: ['sport'],
};

export interface VerdictDiapo {
  coherent: boolean;
  /** L'univers détecté qui n'a rien à faire là. */
  universEtranger?: string;
  motif?: string;
}

function normaliser(v: string): string {
  return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Un brief de diapositive parle-t-il bien de CE commerce ?
 *
 * On ne rejette que lorsqu'un univers clairement étranger est détecté ET
 * qu'aucun univers attendu ne l'est. Un salon de coiffure qui montre un café
 * offert à l'accueil reste valide : l'univers « cheveux » est présent aussi.
 */
export function verifierDiapo(briefVisuel: string, businessType?: string | null): VerdictDiapo {
  const texte = normaliser(briefVisuel || '');
  if (!texte) return { coherent: true };

  const familles = famillesDe(businessType);
  if (!familles.size) return { coherent: true }; // métier inconnu : on ne juge pas

  const attendus = new Set<string>();
  for (const f of familles) for (const u of UNIVERS_ATTENDUS[f] || []) attendus.add(u);
  if (!attendus.size) return { coherent: true };

  const present = (univers: string) => (UNIVERS[univers] || []).some(mot => texte.includes(mot));

  // Si un univers légitime est là, le brief est ancré dans le bon métier.
  for (const u of attendus) if (present(u)) return { coherent: true };

  for (const [univers] of Object.entries(UNIVERS)) {
    if (attendus.has(univers)) continue;
    if (present(univers)) {
      return {
        coherent: false,
        universEtranger: univers,
        motif: `le brief évoque l'univers « ${univers} », étranger à ce commerce (${[...attendus].join('/')} attendu)`,
      };
    }
  }
  return { coherent: true };
}

/**
 * La diapositive « preuve », écrite pour chaque métier.
 *
 * Demande du fondateur : « attention au fallback narratif, chaque métier a son
 * fallback, élargis. » Un repli générique produit des visuels tièdes ; un
 * repli écrit pour le métier d'à côté produit des visuels absurdes. Chaque
 * ligne décrit le moment où le travail devient visible pour un client, parce
 * que c'est ce moment-là qui convainc.
 */
export const PREUVE_PAR_METIER_PUBLIC: Record<string, string> = {
  // ── Bouche ──
  restaurant: "une assiette dressée à l'instant, vue de près, vapeur et brillance visibles",
  boulangerie: "une baguette rompue en deux, mie alvéolée bien visible, farine sur le plan de travail",
  patisserie: "une part découpée nette qui révèle les couches, sur assiette blanche",
  chocolat: "une tablette ou un bonbon cassé net, brillance et cassure visibles",
  boucherie: "une pièce parée sur le billot, grain de la viande et ficelage visibles",
  fromagerie: "une meule entamée, pâte et croûte visibles, couteau posé à côté",
  poissonnerie: "l'étal du matin, glace et poissons brillants, cadrage serré",
  primeur: "une cagette de saison fraîchement rentrée, gouttes d'eau sur les fruits",
  epicerie: "un rayon soigné ou un panier composé, produits identifiables",
  traiteur: "un plateau terminé prêt à partir, dressage net",
  caviste: "une bouteille servie au verre, étiquette lisible, lumière de cave",
  cafe: "une tasse posée avec sa mousse dessinée, comptoir en arrière-plan",
  bar: "un verre préparé au comptoir, glaçons et condensation",
  glacier: "un cornet servi, texture de la glace bien visible",

  // ── Beauté, bien-être, santé ──
  coiffeur: "le résultat fini sur un client visiblement satisfait, miroir et lumière du salon",
  institut_beaute: "un détail du soin terminé sur la peau, cadrage serré, lumière douce",
  tatoueur: "le tatouage fraîchement terminé, encore brillant, cadrage très serré",
  salle_sport: "un pratiquant en plein effort, sueur et concentration, matériel de la salle",
  coach: "un moment de coaching réel, geste corrigé, regard concentré",
  sante: "le praticien en consultation, geste technique précis, cabinet réel",
  pharmacie: "un conseil au comptoir, échange attentif, blouse et officine",
  opticien: "un essayage de monture devant le miroir, ajustement à la main",
  veterinaire: "un animal apaisé après le soin, avec son maître et le praticien",

  // ── Auto & mobilité ──
  garage: "le véhicule propre rendu au client, clés tendues dans l'atelier",
  velo: "un vélo révisé prêt à repartir, détail de la transmission",
  auto_ecole: "un élève au volant, moniteur à côté, regard concentré sur la route",
  vtc: "un intérieur de véhicule impeccable, client installé, lumière de fin de journée",

  // ── Bâtiment & artisanat ──
  plombier: "une installation neuve terminée, soudures nettes, chantier laissé propre",
  electricien: "un tableau électrique fini, câblage rangé au cordeau",
  menuisier: "le détail d'un assemblage, veine du bois et précision de la coupe",
  macon: "un mur monté droit, joints réguliers, niveau posé dessus",
  couvreur: "une toiture terminée vue de près, tuiles alignées, ciel dégagé",
  peintre: "une finition nette contre une plinthe, ligne parfaitement droite",
  carreleur: "un calepinage terminé, joints réguliers, reflet sur le carrelage",
  serrurier: "une serrure neuve posée, porte refermée, main sur la poignée",
  paysagiste: "un jardin fini vu du bon angle, taille nette et allée dégagée",
  renovation: "un avant/après cadré sur le même angle, transformation évidente",
  artisan: "les mains au travail sur la matière, geste précis, atelier en fond",

  // ── Commerce ──
  fleuriste: "une composition terminée vue de près, fraîcheur et couleurs",
  bijouterie: "une pièce sur velours sous lumière rasante, éclat et détail",
  librairie: "un livre ouvert entre des mains, rayon en arrière-plan flou",
  mode: "une pièce portée, tombé du tissu visible, cabine ou boutique en fond",
  decoration: "un coin de pièce aménagé, matières et lumière soignées",
  quincaillerie: "un conseil au comptoir, outil en main, rayons en fond",
  jardinerie: "un plant sorti de serre, mains dans le terreau",
  informatique: "un appareil réparé rendu au client, écran allumé",
  pressing: "une pièce rendue impeccable sous housse, pli net",
  commerce: "un client qui repart avec son achat, sourire et sac en main",

  // ── Services & B2B ──
  comptable: "un bilan expliqué à un client, doigt sur le chiffre qui compte",
  avocat: "un dossier refermé après signature, poignée de main",
  assurance: "un contrat expliqué en face à face, stylo posé sur la table",
  agence: "un tableau de résultats commenté devant le client, courbe en hausse",
  consultant: "un atelier de travail en cours, tableau couvert de notes",
  recrutement: "un entretien réel, échange détendu et attentif",
  formation: "un formateur devant un groupe attentif, main levée",
  immobilier: "la remise des clés devant le bien, sourires",
  pme: "une ligne de production ou un atelier en activité, geste métier",
  b2b: "une livraison ou une prestation en cours chez le client",
  freelance: "le poste de travail réel, écran montrant le livrable",

  // ── Hébergement, loisirs, services aux particuliers ──
  hotel: "une chambre prête, lit impeccable, lumière de fin d'après-midi",
  agence_voyage: "un client qui repart avec son carnet de voyage en main",
  loisirs: "un groupe en pleine activité, rires et mouvement",
  evenementiel: "la salle finie juste avant l'arrivée des invités",
  photographe: "une photo tirée posée à côté de l'appareil, ou l'écran de contrôle",
  creche: "un enfant absorbé par une activité, encadrant attentif à côté",
  menage: "une pièce impeccable après passage, lumière et surfaces nettes",
  demenagement: "le camion chargé et sanglé, carton final en main",
};

/**
 * Le repli narratif, construit à partir du commerce réel.
 *
 * Remplace les prompts restaurant écrits en dur. La structure reste la même —
 * une diapositive d'ouverture, une de preuve — parce qu'elle fonctionne : ce
 * qui ne fonctionnait pas, c'était de la remplir avec le décor d'un autre
 * métier.
 */
export function repliNarratif(
  baseDesc: string,
  businessType?: string | null,
  /**
   * La scène décrite par le client lui-même (`scene_signature` du dossier).
   *
   * Elle prime sur notre table, et pour deux raisons. D'abord elle est plus
   * juste : personne ne sait mieux que le commerçant à quoi ressemble son
   * travail réussi. Ensuite elle est la SEULE option quand l'activité ne
   * ressemble à aucune de nos familles — cas où, sans elle, on n'aurait que
   * le choix entre un repli vague et le décor d'un autre métier.
   */
  sceneClient?: string | null,
): string[] {
  const familles = famillesDe(businessType);
  const metier = businessType || 'ce commerce';

  const preuve =
    (sceneClient && sceneClient.trim().length > 12 ? sceneClient.trim() : null)
    ?? PREUVE_PAR_METIER_PUBLIC[[...familles].find(f => PREUVE_PAR_METIER_PUBLIC[f]) || '']
    // Métier inconnu et aucune description : on reste délibérément abstrait.
    // Un repli vague donne un visuel tiède ; un repli emprunté à un autre
    // métier donne un visuel absurde, et c'est bien pire.
    ?? "le résultat concret du travail, cadré de près, sans décor emprunté à un autre métier";

  return [
    `${baseDesc}. DIAPOSITIVE 2 — visuellement opposée à la première : si la première est large et calme, celle-ci est serrée et vivante ; autre moment de la journée, autre cadrage, autre énergie. Scène réelle de ${metier}, JAMAIS un autre métier. Photographie éditoriale, peau et matières réalistes, lumière naturelle.`,
    `${baseDesc}. DIAPOSITIVE 3 — la preuve du résultat : ${preuve}. Scène réelle de ${metier}, aucun élément d'un autre métier, aucun sujet répété des diapositives 1 et 2. Intimité documentaire, faible profondeur de champ, lumière de fenêtre.`,
  ];
}
