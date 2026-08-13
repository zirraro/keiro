/**
 * Le métier qu'on MET EN SCÈNE quand l'annonceur sert tous les métiers.
 *
 * ── Pourquoi ──
 *
 * Fondateur, 2026-08-13 : « KeiroAI est une exception : là on se met à la place
 * du commerçant, donc tu peux simplement faire tourner le type de business en
 * aléatoire et générer. »
 *
 * C'est la solution la plus simple à un problème que je tournais dans tous les
 * sens depuis deux jours. Un logiciel de marketing n'a rien à photographier :
 * ni vitrine, ni produit, ni geste. Ses posts montrent donc forcément le
 * commerce de quelqu'un d'autre — et tout se mettait à diverger, parce que
 * personne ne décidait DE QUEL commerce on parle.
 *
 * La scène partait vers un boulanger, le texte vers une aide pour voiture
 * électrique, et le juge attendait un écran de tableau de bord. Trois
 * directions, aucune ancre.
 *
 * On choisit donc un métier, une fois, en tête de génération. La scène le
 * montre, le texte parle de sa journée, le contrôle juge par rapport à lui, et
 * l'actualité est filtrée pour lui. Une seule décision qui résout quatre
 * incohérences.
 *
 * ── Pourquoi une rotation déterministe et non un tirage au sort ──
 *
 * Le hasard peut sortir trois fois le même métier dans la journée, ce qui donne
 * un compte monotone, et il rend les incidents irreproductibles — on ne saurait
 * pas rejouer une génération ratée. La rotation dépend de la date et du créneau :
 * elle varie autant qu'un tirage, et elle se rejoue à l'identique.
 */

/**
 * Les métiers qu'on met en scène, choisis pour être VISUELS et représentatifs
 * de la clientèle visée : des commerces de proximité où il se passe quelque
 * chose qu'on peut photographier.
 *
 * Volontairement variés en univers — alimentaire, image, maison, service — pour
 * que le fil ne donne pas l'impression d'un logiciel qui ne parle qu'aux
 * restaurants.
 */
export const METIERS_EN_SCENE = [
  'boulangerie',
  'coiffeur',
  'fleuriste',
  'restaurant',
  'institut_beaute',
  'boutique',
  'coach_sportif',
  'traiteur',
  'barbier',
  'patisserie',
  'garage',
  'paysagiste',
] as const;

export type MetierEnScene = typeof METIERS_EN_SCENE[number];

/**
 * L'annonceur sert-il plusieurs métiers ? Alors il faut en mettre un en scène.
 *
 * On reconnaît le cas à ce que le client déclare : un logiciel, une agence, un
 * cabinet de conseil vendent à des commerçants, ils ne sont pas eux-mêmes le
 * commerce qu'on photographie.
 */
/**
 * Les comptes qui mettent TOUJOURS un métier en scène, quels que soient les mots
 * de leur dossier.
 *
 * Fondateur, 2026-08-13 : « KeiroAI est une exception, là on se met à la place du
 * commerçant. » La détection par mots-clés a échoué sur son propre dossier — un
 * salon de coiffure a reçu une accroche sur la Ligue Europa, preuve que le métier
 * mis en scène n'était pas appliqué au tri des actualités.
 *
 * Deviner à partir d'un texte libre marchera parfois ; pour le compte vitrine,
 * qui est notre seule vitrine, on ne devine pas.
 */
const COMPTES_TOUJOURS_EN_SCENE = new Set([
  'd7d3ae4a-c420-40e1-b2c9-b983d960d1fb', // mrzirraro@gmail.com — compte vitrine KeiroAI
]);

export function sertPlusieursMetiers(signature?: string | null, userId?: string | null): boolean {
  if (userId && COMPTES_TOUJOURS_EN_SCENE.has(userId)) return true;
  const t = String(signature || '').toLowerCase();
  if (!t) return false;
  return /\b(saas|logiciel|plateforme|application|agence|conseil|consultant|freelance|marketing|communication|prestataire|studio)\b/.test(t);
}

/**
 * Le métier du jour, pour ce créneau.
 *
 * Déterministe : même date et même créneau → même métier. Deux créneaux du même
 * jour tombent sur des métiers différents, et la liste ne se répète qu'après
 * douze publications.
 */
export function metierDuCreneau(date: Date, creneau: string, sel = ''): MetierEnScene {
  const jour = Math.floor(date.getTime() / 86400000);
  let empreinte = 0;
  for (const c of `${creneau}|${sel}`) empreinte = (empreinte * 31 + c.charCodeAt(0)) % METIERS_EN_SCENE.length;
  return METIERS_EN_SCENE[(jour + empreinte) % METIERS_EN_SCENE.length];
}

/** Ce qu'on dit au générateur, en français, prêt à coller dans le prompt. */
export function blocMetierEnScene(metier: MetierEnScene): string {
  const NOM: Record<MetierEnScene, string> = {
    boulangerie: 'une boulangerie', coiffeur: 'un salon de coiffure',
    fleuriste: 'un fleuriste', restaurant: 'un restaurant',
    institut_beaute: 'un institut de beauté', boutique: 'une boutique de vêtements',
    coach_sportif: 'un coach sportif', traiteur: 'un traiteur',
    barbier: 'un barbier', patisserie: 'une pâtisserie',
    garage: 'un garage', paysagiste: 'un paysagiste',
  };
  return [
    '',
    '━━━ LE COMMERCE MIS EN SCÈNE AUJOURD\'HUI ━━━',
    `Ce post parle de ${NOM[metier]}. C'est SA journée qu'on raconte, SON`,
    "comptoir qu'on montre, SES clients dont on parle.",
    '',
    'Tu écris pour ce commerçant-là, et à la deuxième personne. La scène montre',
    'son métier, la légende parle de ce qu\'il vit — la rentrée dans SON commerce,',
    'la canicule dans SON commerce, le samedi qui se prépare dans SON commerce.',
    '',
    'Ton produit n\'apparaît qu\'à la fin, comme la sortie de son problème : une',
    'ligne, jamais un catalogue, et jamais à l\'image.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ].join('\n');
}
