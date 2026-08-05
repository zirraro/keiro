/**
 * BARÈME DE SCORING TERRAIN — le fichier à modifier pour recalibrer.
 *
 * Isolé volontairement de la logique : le fondateur l'a demandé, et c'est la
 * bonne architecture. « Le barème ci-dessus est une hypothèse, pas une
 * vérité » — un barème enfoui dans du code se fige, alors que celui-ci doit
 * bouger dès que les résultats de terrain disent qu'un signal ne prédit rien.
 *
 * ── Périmètre ──
 *
 * Ce n'est pas un outil d'administration. Chaque client dispose du même
 * scoring sur SES prospects : Léo trie, Jade personnalise ses messages sur la
 * fiche enrichie, Hugo en fait autant par email, et la liste d'appel sort déjà
 * qualifiée. Le barème est donc commun, mais la recalibration se fait par
 * client — un institut de beauté et un plombier ne signent pas sur les mêmes
 * signaux.
 *
 * ── Ce que chaque signal parie ──
 *
 * L'hypothèse générale : le meilleur prospect est un commerce VIVANT (des
 * clients, des avis récents) mais ABSENT ou ABANDONNÉ en ligne. Vivant, il a
 * de quoi payer ; absent, il a un vrai manque. Un commerce qui publie tous les
 * jours est soit déjà accompagné, soit convaincu de s'en sortir seul : dans
 * les deux cas, le rendez-vous coûte plus qu'il ne rapporte.
 */

export interface RegleScore {
  cle: string;
  points: number;
  /** Ce que le signal parie — indispensable pour juger sa valeur plus tard. */
  hypothese: string;
}

/** Règles éliminatoires : classe C d'office, aucun appel d'API dépensé après. */
export const ELIMINATOIRES = {
  /** Fermé définitivement : plus personne à convaincre. */
  ferme: { cle: 'ferme_definitivement', hypothese: "l'établissement n'est plus en activité" },
  /**
   * Chaîne ou franchise : le point de vente renvoie au siège.
   *
   * Détectée par le nom apparaissant au moins CHAINE_SEUIL fois dans le jeu de
   * données du client. Cas déjà vécu en terrain : on pousse la porte, le gérant
   * n'a aucune latitude et renvoie vers une direction régionale.
   */
  chaine: { cle: 'chaine_ou_franchise', hypothese: 'le point de vente ne décide pas de sa communication' },
  /** Aucun avis récent : commerce probablement à l'arrêt ou sans clientèle. */
  dormant: { cle: 'aucun_avis_recent', hypothese: "le commerce ne tourne plus assez pour investir" },
  /** Trop peu d'avis : pas assez de matière pour juger, et souvent trop jeune. */
  trop_peu_avis: { cle: 'trop_peu_avis', hypothese: 'établissement trop confidentiel pour convertir' },
} as const;

export const SEUILS = {
  /** Un nom vu au moins ce nombre de fois dans le lot = chaîne. */
  CHAINE_OCCURRENCES: 3,
  /** Au-delà, le dernier avis est trop ancien pour croire le commerce actif. */
  AVIS_MAX_JOURS: 180,
  /** En deçà, on ne sait rien du commerce. */
  AVIS_MINIMUM: 5,
  /** Cache d'enrichissement Instagram : on ne réinterroge pas avant. */
  IG_CACHE_JOURS: 14,
} as const;

/**
 * Le barème, appliqué aux prospects qui survivent aux éliminatoires.
 *
 * Chaque règle porte son hypothèse : c'est ce qui permettra de dire, dans
 * trois mois, laquelle méritait ses points. Sans cette phrase, on ne saurait
 * plus pourquoi le signal a été retenu, et on le garderait par superstition.
 */
export const BAREME: RegleScore[] = [
  // ── Absence ou abandon en ligne : le cœur de l'hypothèse ──
  { cle: 'post_plus_90j', points: +5, hypothese: "compte abandonné : le manque est flagrant et reconnu par le gérant" },
  { cle: 'post_60_90j', points: +4, hypothese: 'négligence installée, le sujet est mûr' },
  { cle: 'post_30_60j', points: +3, hypothese: 'irrégularité qui commence à se voir' },
  { cle: 'a_essaye_puis_abandonne', points: +2, hypothese: "plus de 10 posts puis plus rien : le gérant SAIT que c'est utile et a renoncé — argument plus facile qu'une conviction à créer" },
  { cle: 'aucun_compte', points: +1, hypothese: "absence totale : besoin réel, mais conviction entièrement à construire" },

  // ── Taille d'audience : on cherche le commerce de quartier ──
  { cle: 'followers_100_1500', points: +2, hypothese: 'audience de commerce local, marge de progression évidente' },
  { cle: 'followers_moins_100', points: +1, hypothese: 'tout est à faire, mais le gérant peut le percevoir comme un échec personnel' },
  { cle: 'followers_plus_5000', points: -1, hypothese: 'audience déjà installée, notre apport paraît marginal' },

  // ── Vitalité du commerce : il faut de quoi payer ──
  { cle: 'avis_moins_30j', points: +2, hypothese: 'commerce vivant, clientèle réelle, trésorerie probable' },
  { cle: 'note_4_ou_plus', points: +1, hypothese: 'établissement sérieux, donc interlocuteur exigeant mais solvable' },
  { cle: 'pas_de_site', points: +1, hypothese: "aucune présence en ligne construite : le besoin est global" },

  // ── Signal négatif fort ──
  { cle: 'post_moins_7j', points: -3, hypothese: 'compte déjà géré, probablement par une agence : rendez-vous perdu' },
];

/**
 * Ajustements de l'analyse visuelle.
 *
 * Volontairement séparés : ils ne s'appliquent que si l'analyse est activée, et
 * on veut pouvoir juger le barème SANS eux pour savoir s'ils apportent quoi que
 * ce soit. Recommandation actuelle : laisser désactivé — le signal
 * « publie depuis moins de 7 jours » couvre déjà l'essentiel de « agence
 * probable », pour un coût nul.
 */
export const BAREME_VISION: RegleScore[] = [
  { cle: 'agence_probable', points: -4, hypothese: 'un compte tenu par un professionnel ne se reprend pas' },
  { cle: 'visuels_amateurs', points: +2, hypothese: "l'écart de qualité se montre en deux secondes, ça vend tout seul" },
];

/** Seuils de classe. A = on se déplace, B = si on passe devant, C = jamais. */
export const CLASSES = { A: 8, B: 4 } as const;

export function classeDepuisScore(score: number): 'A' | 'B' | 'C' {
  if (score >= CLASSES.A) return 'A';
  if (score >= CLASSES.B) return 'B';
  return 'C';
}

/**
 * Coût unitaire estimé, pour le dry-run.
 *
 * Places Details et business_discovery sont les deux postes réels ; la lecture
 * d'un site est gratuite mais lente. Les valeurs viennent des tarifs constatés
 * (cf. lib/admin/api-cost-logger.ts) et servent à annoncer un ordre de
 * grandeur avant de lancer, jamais à facturer.
 */
export const COUTS_EUR = {
  places_details: 0.016,
  business_discovery: 0,      // inclus dans le quota Graph, pas facturé à l'appel
  fetch_site: 0,
  vision_par_media: 0.004,
} as const;
