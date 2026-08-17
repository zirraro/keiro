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
  /**
   * Vocabulaire élargi le 2026-08-10.
   *
   * Le carrousel fleur → cupcake → fleur signalé par le fondateur était bien
   * retenu, mais par accident : c'est le mot « plate » de « on a plate » qui
   * déclenchait l'univers, pas « cupcake » — absent de la liste, comme toute la
   * pâtisserie et toute la boisson. Un contrôle qui ne fonctionne que si la
   * phrase mentionne une assiette ne fonctionne pas.
   */
  nourriture: [
    'salade', 'fruit', 'legume', 'plat', 'assiette', 'cuisine', 'chef', 'restaurant',
    'menu', 'dish', 'food', 'meal', 'dining', 'salad', 'plate', 'kitchen', 'bouchee',
    'mid-bite', 'reservation book', 'carnet de reservation', 'salle a manger',
    'table dressee', 'pourboire', 'tip', 'assiettes', 'plats',
    // pâtisserie et boulangerie
    'cupcake', 'gateau', 'patisserie', 'boulangerie', 'macaron', 'croissant', 'pain',
    'tarte', 'eclair', 'brioche', 'viennoiserie', 'biscuit', 'cookie', 'cake',
    'pastry', 'bakery', 'bread', 'dessert', 'chocolat', 'chocolate', 'glacage',
    'frosting', 'icing', 'four', 'oven', 'petrin',
    // boissons
    'cafe', 'coffee', 'espresso', 'cappuccino', 'the', 'tea', 'cocktail', 'biere',
    'beer', 'vin', 'wine', 'verre', 'tasse', 'mug', 'barista', 'comptoir de bar',
    // produits bruts et service
    'viande', 'poisson', 'fromage', 'charcuterie', 'epices', 'ingredient',
    'serveur', 'serveuse', 'waiter', 'terrasse de restaurant', 'brunch',
  ],
  cheveux: ['cheveu', 'cheveux', 'coiffure', 'coupe', 'brushing', 'coloration', 'salon de coiffure', 'hair', 'haircut', 'barber', 'barbier', 'shampoing', 'shampoo', 'meche', 'balayage', 'chignon', 'tondeuse', 'ciseaux de coiffure', 'fauteuil de coiffure', 'bac a shampoing', 'blow-dry', 'hairdresser', 'salon chair'],
  soin: ['soin', 'massage', 'peau', 'ongle', 'ongles', 'manucure', 'pedicure', 'esthetique', 'spa', 'skincare', 'facial', 'nail', 'nails', 'epilation', 'waxing', 'serviette chaude', 'cabine de soin', 'table de massage', 'huile de massage', 'masque visage', 'sourcils', 'cils', 'tatouage', 'tattoo', 'aiguille de tatouage'],
  chantier: ['chantier', 'travaux', 'outil', 'outils', 'perceuse', 'tuyau', 'toiture', 'peinture murale', 'carrelage', 'construction', 'plumbing', 'renovation', 'echafaudage', 'truelle', 'niveau a bulle', 'casque de chantier', 'plombier', 'electricien', 'menuisier', 'scie', 'planche', 'ciment', 'platre', 'cable electrique', 'tableau electrique'],
  auto: ['voiture', 'moteur', 'pneu', 'pneus', 'garage', 'atelier mecanique', 'car', 'engine', 'vehicle', 'mecanicien', 'mechanic', 'pare-brise', 'carrosserie', 'pont elevateur', 'cle a molette', 'vidange'],
  bureau: ['bureau', 'reunion', 'ordinateur portable', 'graphique', 'tableur', 'meeting', 'laptop', 'office', 'whiteboard'],
  animal: ['chien', 'chat', 'animal', 'animaux', 'veterinaire', 'pet', 'dog', 'cat', 'puppy', 'chiot', 'chaton', 'toilettage', 'grooming', 'laisse', 'collier pour chien'],
  fleur: ['fleur', 'fleurs', 'bouquet', 'floral', 'flower', 'flowers', 'petale', 'petal', 'rose', 'tulipe', 'pivoine', 'composition florale', 'fleuriste', 'florist', 'vase', 'tige', 'stem', 'greenery', 'feuillage'],
  sport: ['haltere', 'halteres', 'musculation', 'tapis de course', 'gym', 'workout', 'dumbbell', 'fitness', 'salle de sport', 'coach sportif', 'entrainement', 'training', 'yoga', 'pilates', 'tapis de yoga', 'barre de traction', 'kettlebell'],
  // Ajoutés le 2026-08-10 : le carrousel signalé mêlait joaillerie et
  // restauration, et la joaillerie n'était dans aucun univers — donc la
  // diapositive passait pour neutre, compatible avec n'importe quoi.
  bijou: ['bijou', 'joaillerie', 'bijouterie', 'collier', 'bague', 'boucle d oreille', 'jewellery', 'jewelry', 'necklace', 'ring', 'earring', 'bracelet', 'gemstone', 'diamant', 'diamond'],
  mode: ['vetement', 'boutique de mode', 'pret a porter', 'robe', 'chemise', 'portant', 'cabine d essayage', 'clothing', 'garment', 'dress', 'fashion boutique', 'clothing rack', 'fitting room'],
  livre: ['livre', 'librairie', 'bibliotheque', 'book', 'bookstore', 'bookshelf'],
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

  // Bornes de mot obligatoires : avec une simple sous-chaîne, « car » se
  // trouve dans « cartoon » et le brief d'un dessin animé était rangé dans
  // l'univers automobile. Trouvé au backtest du 2026-08-10.
  const present = (univers: string) => (UNIVERS[univers] || []).some(mot => contientLeMot(texte, mot));

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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COHÉRENCE DE SÉRIE — les diapositives jugées les unes par rapport aux autres
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── Le défaut que ça corrige ──
 *
 * 2026-08-10, le fondateur, pour la troisième fois : « un carrousel doit être
 * dédié, et toujours les images qui se suivent ont un lien ». Le dernier post
 * mêlait joaillerie, restaurant et une image en dessin animé.
 *
 * `verifierDiapo` existait déjà, mais il compare chaque diapositive AU MÉTIER,
 * jamais aux autres diapositives. Et il s'arrête net quand le métier est
 * inconnu : « métier inconnu : on ne juge pas ». Le compte KeiroAI lui-même
 * n'est ni restaurant ni coiffeur — donc aucune des trois diapositives n'a été
 * contrôlée. Le garde-fou était là, il ne regardait simplement pas dans la
 * bonne direction.
 *
 * D'où ce second contrôle, qui n'a pas besoin de connaître le métier : il
 * demande seulement que les diapositives d'un même carrousel parlent du MÊME
 * univers. Joaillerie puis restaurant, c'est deux univers — quel que soit le
 * commerce, c'est faux.
 */

/**
 * Le mot est-il présent EN TANT QUE MOT ?
 *
 * `texte.includes(mot)` ne suffit pas, et le backtest l'a prouvé sur le cas
 * même que ce fichier devait régler : « cartoon illustration » déclenchait
 * l'univers « auto », parce que « car » est dans « cartoon ». Le diagnostic
 * devenait faux et la mauvaise diapositive aurait pu être écartée.
 *
 * C'est la troisième fois que la recherche par sous-chaîne se retourne contre
 * nous ici — « 3d » découpé dans d'autres mots, « glasses » réduit à « glae ».
 * Les bornes de mot ne sont pas un détail de style.
 *
 * Les termes composés (« salon de coiffure », « reservation book ») sont
 * cherchés tels quels, bornés aux deux extrémités.
 */
function contientLeMot(texte: string, mot: string): boolean {
  const echappe = mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${echappe}([^a-z0-9]|$)`, 'i').test(texte);
}

/**
 * Marqueurs de rendu non photographique.
 *
 * Ce n'est pas un « univers » — c'est une manière de fabriquer l'image. Une
 * diapositive en dessin animé au milieu de deux photographies casse la série
 * quel que soit son sujet, et c'est exactement ce que le fondateur a vu.
 */
const RENDU_NON_PHOTO = [
  'cartoon', 'illustration', 'illustrated', 'anime', 'animated', 'dessin anime',
  '3d', '3d render', 'cgi', 'digital painting', 'concept art', 'vector',
  'flat design', 'watercolor', 'aquarelle', 'sketch', 'drawing', 'rendered',
  'rendering', 'render', 'pixar', 'disney', 'comic', 'manga',
];

export function estRenduNonPhoto(brief: string): boolean {
  const texte = normaliser(brief || '');
  return RENDU_NON_PHOTO.some((m) => contientLeMot(texte, m));
}

/** Univers détectés dans un brief, par ordre d'apparition. */
function universDe(brief: string): string[] {
  const texte = normaliser(brief || '');
  const trouves: string[] = [];
  for (const [univers, mots] of Object.entries(UNIVERS)) {
    if (mots.some((m) => contientLeMot(texte, m))) trouves.push(univers);
  }
  return trouves;
}

export interface VerdictSerie {
  coherente: boolean;
  /** L'univers qui domine la série — celui auquel les autres doivent se tenir. */
  universDominant?: string;
  /** Index (base 0) des diapositives à refaire. */
  diapoIncoherentes: number[];
  motif?: string;
}

/**
 * Les diapositives d'un carrousel racontent-elles la même histoire ?
 *
 * On prend l'univers majoritaire comme référence plutôt que celui de la
 * première diapositive : si deux diapositives sur trois parlent de coiffure,
 * c'est la troisième qui est fautive, même si c'est elle qui ouvre.
 *
 * Une diapositive sans univers détectable n'est pas fautive — un plan sur des
 * mains, un détail de matière ou un fond neutre appartiennent à toutes les
 * histoires. On ne rejette que ce qui appartient VISIBLEMENT à une autre.
 */
export function verifierSerieDiapos(briefs: string[]): VerdictSerie {
  // Une diapositive en dessin animé, en 3D ou en illustration casse la série
  // quel que soit son sujet : on la sort d'abord, avant même de raisonner sur
  // les univers. C'est la « 3e image en mode robot » du signalement.
  const nonPhoto: number[] = [];
  briefs.forEach((b, i) => { if (estRenduNonPhoto(b)) nonPhoto.push(i); });

  const universParDiapo = briefs.map(universDe);

  const compte: Record<string, number> = {};
  for (const liste of universParDiapo) for (const u of liste) compte[u] = (compte[u] || 0) + 1;

  const classe = Object.entries(compte).sort((a, b) => b[1] - a[1]);
  const dominant = classe.length ? classe[0][0] : undefined;

  const fautives = new Set<number>(nonPhoto);
  if (dominant) {
    for (let i = 0; i < universParDiapo.length; i++) {
      const u = universParDiapo[i];
      if (u.length === 0) continue;          // neutre : compatible avec tout
      if (u.includes(dominant)) continue;    // ancrée dans la bonne histoire
      fautives.add(i);
    }
  }

  if (fautives.size === 0) return { coherente: true, universDominant: dominant, diapoIncoherentes: [] };

  const liste = [...fautives].sort((a, b) => a - b);
  const raisons: string[] = [];
  if (nonPhoto.length) raisons.push(`${nonPhoto.length} en rendu non photographique`);
  const horsUnivers = liste.filter((i) => !nonPhoto.includes(i));
  if (horsUnivers.length) {
    raisons.push(
      `${horsUnivers.length} hors de l'univers « ${dominant} » (${horsUnivers.map((i) => universParDiapo[i].join('/')).join(', ')})`,
    );
  }

  return {
    coherente: false,
    universDominant: dominant,
    diapoIncoherentes: liste,
    motif: `diapositive(s) à refaire : ${raisons.join(' ; ')}`,
  };
}

/**
 * ── L'ancre visuelle commune ──
 *
 * Contrôler les sujets ne suffit pas. Chaque diapositive était générée comme
 * une image indépendante, à partir de son seul texte : même sujet, mais autre
 * lumière, autre lieu, autre style de rendu. C'est ce qui produit « la 1ère
 * photo est bonne, la 2e est animée, la 3e en mode robot ».
 *
 * On fabrique donc un contrat de scène à partir de la première diapositive et
 * on l'impose à toutes les suivantes : même lieu, même lumière, même appareil,
 * même personne. Les diapositives changent de cadrage et de moment — c'est ce
 * qui fait un récit — mais pas de monde.
 *
 * Formulé en une phrase courte et concrète : les moteurs d'image suivent mal
 * les consignes abstraites, et bien les consignes matérielles.
 */
export function contratDeScene(briefPremiereDiapo: string, metier?: string | null): string {
  const lieu = metier ? `le même établissement de ${metier}` : 'le même lieu';
  return (
    `MÊME SÉRIE PHOTO que la première image : ${lieu}, même lumière naturelle, ` +
    `même palette de couleurs, mêmes personnes, même appareil et même objectif. ` +
    `Seuls le cadrage et le moment changent. Photographie, jamais illustration ni rendu.`
  );
}

/**
 * Brief final d'une diapositive : son propre sujet, tenu par le contrat de
 * scène. L'ordre compte — le sujet d'abord, la contrainte ensuite : c'est
 * l'inverse qui produisait des images génériques où la consigne mangeait le
 * sujet.
 */
export function briefDiapoAncre(
  briefDiapo: string,
  contrat: string,
  numero: number,
): string {
  return `${briefDiapo.trim()} — DIAPOSITIVE ${numero} d'une série. ${contrat}`;
}

/**
 * ── Juger les IMAGES de la série, pas seulement leurs briefs ──
 *
 * Tout ce qui précède raisonne sur des TEXTES : les briefs proposés par le
 * modèle, comparés par mots-clés. C'est utile et gratuit, et ça rattrape le
 * cupcake au milieu des fleurs.
 *
 * Mais deux briefs cohérents peuvent donner deux images qui n'ont rien à voir.
 * Chaque diapositive est bien contrôlée à la génération — contre SON PROPRE
 * brief. Personne ne regarde jamais l'ensemble, ni le lien avec la légende que
 * le lecteur a sous les yeux.
 *
 * Constaté le 16 août sur un carrousel publié le matin même, cinq
 * diapositives : « les images ne sont pas liées, aucune logique avec le texte ».
 * C'était vrai, et rien dans la chaîne ne pouvait le voir — le juge visuel ne
 * recevait que la couverture.
 *
 * Un seul appel, toutes les images ensemble : les juger une par une coûterait
 * autant d'appels et ne dirait toujours rien de leur enchaînement, qui est la
 * moitié du sujet.
 */
export interface VerdictSerieVisuelle {
  note: number;
  motifs: string[];
  /** Index (0-based) des diapositives qui parlent d'autre chose. */
  horsSujet: number[];
}

export async function jugerImagesDeLaSerie(input: {
  images: string[];
  legende: string;
  metier?: string | null;
}): Promise<VerdictSerieVisuelle | null> {
  const urls = (input.images || []).filter(Boolean).slice(0, 6);
  if (urls.length < 2) return null;
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) return null;

  const { fetchImageBase64 } = await import('./post-coherence-qc');
  const images: { data: string; mediaType: string }[] = [];
  for (const u of urls) {
    const img = await fetchImageBase64(u);
    if (img) images.push(img);
  }
  if (images.length < 2) return null;

  const consigne = [
    "Tu juges les diapositives d'un CARROUSEL, dans leur ordre de lecture.",
    input.metier ? `Le commerce : ${input.metier}.` : '',
    '',
    'Deux questions, et rien d\'autre :',
    "1. Chaque diapositive parle-t-elle du sujet de la légende ? Une diapositive qui montre un autre métier, un autre lieu ou un autre propos décroche.",
    "2. La suite se lit-elle d'un trait ? Un carrousel se parcourt en glissant : si la 2e image n'a aucun rapport avec la 1re, on quitte avant la 3e.",
    '',
    // Fondateur, 2026-08-15 : « looking like a film ce n'est pas rédhibitoire,
    // c'est tout ce qui ressemble à de l'IA qui l'est. Ce qui doit bloquer,
    // c'est le contenu pertinent ou pas, lien business, lien cible. »
    "Un parti pris visuel fort n'est pas un défaut. Un changement de cadrage, de lumière ou d'angle entre les diapositives est NORMAL et souhaitable.",
    "Ce qui bloque, c'est une image qui parle d'autre chose que la légende ou que le métier.",
    '',
    'Note sur 10 : 8+ tout tient et la suite se lit ; 6-7 une diapositive faible mais l\'ensemble tient ; 5 ou moins au moins une diapositive parle d\'autre chose.',
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cle}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: consigne }] },
          contents: [{
            role: 'user',
            parts: [
              ...images.map((i) => ({ inline_data: { mime_type: i.mediaType, data: i.data } })),
              { text: `LÉGENDE :\n${String(input.legende || '').slice(0, 1000)}\n\nTu vois ${images.length} diapositives, dans l'ordre.` },
            ],
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 600,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                note: { type: 'NUMBER' },
                motifs: { type: 'ARRAY', items: { type: 'STRING' } },
                diapos_hors_sujet: { type: 'ARRAY', items: { type: 'NUMBER' } },
              },
              required: ['note', 'motifs', 'diapos_hors_sujet'],
            },
          },
        }),
      },
    );
    if (!res.ok) { console.warn('[Carrousel/vision] Gemini HTTP', res.status); return null; }
    const j: any = await res.json();
    try {
      const { logApiCost } = await import('@/lib/admin/api-cost-logger');
      void logApiCost({
        provider: 'gemini', kind: 'qc_carrousel_serie', agent: 'content',
        units: j.usageMetadata?.totalTokenCount || 0,
        cost_eur: ((j.usageMetadata?.promptTokenCount || 0) * 0.3 + (j.usageMetadata?.candidatesTokenCount || 0) * 2.5) / 1e6 * 0.92,
      } as any).catch(() => {});
    } catch { /* la trace de coût ne bloque jamais un contrôle */ }
    const txt = (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text).filter(Boolean).join('');
    if (!txt) return null;
    const v = JSON.parse(txt);
    // Le modèle numérote à partir de 1 ; on rend des index de tableau.
    const horsSujet = (Array.isArray(v.diapos_hors_sujet) ? v.diapos_hors_sujet : [])
      .map((n: any) => Number(n) - 1)
      .filter((n: number) => Number.isInteger(n) && n >= 0 && n < urls.length);
    return {
      note: Number(v.note ?? 0),
      motifs: Array.isArray(v.motifs) ? v.motifs.filter(Boolean).slice(0, 4) : [],
      horsSujet,
    };
  } catch (e: any) {
    console.warn('[Carrousel/vision] Gemini en échec :', e?.message);
  }

  // ── Repli ARK : Gemini est géo-bloqué depuis le serveur ──
  //
  // Le 17 août, l'API AI Studio a commencé à répondre « User location is not
  // supported » aux appels venant du VPS. Le juge principal a déjà son repli
  // ARK ; celui-ci l'avait pas, il serait donc tombé en silence — et un
  // carrousel non jugé, c'est précisément le défaut qu'on vient de corriger.
  try {
    const { cleArk } = await import('@/lib/agents/deepseek');
    const res = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cleArk() },
      body: JSON.stringify({
        model: process.env.ARK_VISION_MODEL || 'seed-2-0-pro-260328',
        messages: [
          { role: 'system', content: consigne + String.fromCharCode(10) + String.fromCharCode(10) + 'Réponds UNIQUEMENT par un JSON { note: nombre, motifs: [texte], diapos_hors_sujet: [nombre] }.' },
          { role: 'user', content: [
            ...images.map((i) => ({ type: 'image_url', image_url: { url: 'data:' + i.mediaType + ';base64,' + i.data } })),
            { type: 'text', text: 'LÉGENDE :' + String.fromCharCode(10) + String(input.legende || '').slice(0, 1000) },
          ] },
        ],
        max_tokens: 700, temperature: 0, response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) { console.warn('[Carrousel/vision] ARK HTTP', res.status); return null; }
    const j: any = await res.json();
    const brut = String(j.choices?.[0]?.message?.content || '').replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    if (!brut) return null;
    const v = JSON.parse(brut);
    const horsSujet = (Array.isArray(v.diapos_hors_sujet) ? v.diapos_hors_sujet : [])
      .map((n: any) => Number(n) - 1)
      .filter((n: number) => Number.isInteger(n) && n >= 0 && n < urls.length);
    return { note: Number(v.note ?? 0), motifs: Array.isArray(v.motifs) ? v.motifs.filter(Boolean).slice(0, 4) : [], horsSujet };
  } catch (e: any) {
    console.warn('[Carrousel/vision] ARK en échec :', e?.message);
    return null;
  }
}
