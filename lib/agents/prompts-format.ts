/**
 * Un prompt spécialisé par réseau ET par format.
 *
 * ── Pourquoi, après avoir fait l'inverse ──
 *
 * Le 13 août j'ai rassemblé les règles de qualité dans une source unique, pour
 * empêcher deux prompts de se contredire. C'était nécessaire, mais j'en ai tiré
 * la mauvaise conclusion : j'ai voulu UN prompt.
 *
 * Fondateur, le même jour : « ce qui compte n'est pas d'avoir deux modules ou
 * plus, mais qu'ils soient du même niveau de prompting ; si chaque réseau a
 * besoin de sa route pour ses spécificités, il la faut. » Puis : « augmenter le
 * niveau de plusieurs vaut mieux, comme ça on peut selon la demande choisir le
 * prompt, l'adapter, et avoir direct un excellent résultat. »
 *
 * Il a raison, et la preuve est arrivée le jour même : le carrousel a produit
 * zéro diapositive alors que la consigne existait — noyée dans un prompt
 * généraliste qui parle de tout, elle pesait moins qu'une phrase voisine.
 *
 * ── La répartition ──
 *
 * · `doctrine-contenu.ts` porte ce qui ne doit exister qu'UNE fois, parce que
 *   deux versions se contrediraient : scène avant texte, naturel, actualité,
 *   registre. C'est le socle, il vaut pour tout le monde.
 * · Ce fichier porte ce qui DOIT différer : ce qu'est un bon carrousel, ce
 *   qu'est un bon reel, ce qui retient sur LinkedIn plutôt que sur TikTok.
 *
 * Un même sujet ne se raconte pas pareil en une image, en cinq, ou en vingt
 * secondes de vidéo. Écrire une consigne qui vaut pour les trois, c'est écrire
 * une consigne qui ne sert pour aucun.
 */

type Reseau = 'instagram' | 'tiktok' | 'linkedin';

/** Le format tel que le calendrier le nomme, normalisé. */
function normaliserFormat(format?: string | null): 'post' | 'carrousel' | 'reel' | 'story' {
  const f = String(format || '').toLowerCase();
  if (f === 'carrousel' || f === 'carousel') return 'carrousel';
  if (f === 'reel' || f === 'video') return 'reel';
  if (f === 'story') return 'story';
  return 'post';
}

function normaliserReseau(reseau?: string | null): Reseau {
  const r = String(reseau || '').toLowerCase();
  return r === 'tiktok' || r === 'linkedin' ? r : 'instagram';
}

/**
 * L'image unique. Le format le plus exigeant, parce qu'il n'a qu'une chance :
 * pas de deuxième diapositive pour rattraper, pas de mouvement pour retenir.
 */
const IMAGE_UNIQUE = `━━━ FORMAT : UNE SEULE IMAGE ━━━
Tu n'as qu'une chance. Pas de deuxième diapositive pour rattraper, pas de
mouvement pour retenir : tout se joue sur ce que montre ce cadre-là.

· UN sujet, un seul. Une image qui montre trois choses n'en montre aucune.
  Le boulanger qui enfourne, OU la vitrine du matin, OU le pain qui sort —
  pas les trois.
· Le sujet doit être identifiable en un dixième de seconde, à la taille d'une
  vignette. Si on doit chercher ce qu'on regarde, c'est raté.
· Un moment, pas une nature morte. Quelque chose est en train de se passer :
  une main qui verse, une porte qui s'ouvre, de la vapeur qui monte.
· L'image porte le propos À ELLE SEULE. La légende commente, elle n'explique
  pas ce qu'on aurait dû voir.`;

/**
 * Le carrousel. Le format où l'erreur la plus visible est de ne pas raconter.
 */
const CARROUSEL = `━━━ FORMAT : CARROUSEL ━━━
Un carrousel est une SÉRIE. C'est un reportage, pas une planche-contact.

· Le champ "slides" est OBLIGATOIRE : 3 à 5 objets
  { "visual": "...", "text": "..." }. Sans lui, les diapositives suivantes sont
  fabriquées à partir de la première et n'ont aucun lien entre elles — c'est le
  défaut le plus visible d'un carrousel raté, et le plus fréquent.
· MÊME LIEU, MÊME HEURE, MÊME LUMIÈRE, MÊMES PERSONNES. Seuls le cadrage et le
  moment changent. Un carrousel qui saute d'un atelier à une terrasse est faux,
  même si chaque image est belle.
· Une PROGRESSION, pas des angles : le plan large qui installe, le geste qui
  fait, le détail qui prouve, le résultat qui conclut.
· Test : si on peut permuter deux diapositives sans rien perdre, elles ne
  racontent rien — recommence.
· La PREMIÈRE arrête le doigt, la DERNIÈRE donne envie d'agir. Celles du milieu
  ont le droit d'être calmes.`;

/**
 * Le reel. C'est la route qui produit déjà la meilleure qualité — on écrit ici
 * ce qu'elle fait implicitement, pour que ça cesse d'être un hasard.
 */
const REEL = `━━━ FORMAT : REEL / VIDÉO COURTE ━━━
Les TROIS PREMIÈRES SECONDES décident de tout le reste.

· On entre DANS l'action, sans plan d'introduction, sans logo, sans « bonjour ».
  Le sujet est identifiable à la première image.
· Une seule idée sur toute la durée. Une vidéo de vingt secondes qui dit trois
  choses n'en fait retenir aucune.
· Le mouvement est le sujet, pas un effet : ce qui bouge doit être ce dont on
  parle — la pâte qu'on travaille, le café qu'on verse, la porte qu'on ouvre.
· La VOIX, quand il y en a une : français naturel, débit parlé, phrases courtes.
  On dit une phrase par plan, pas un paragraphe sur une image fixe.
· La dernière seconde porte l'action à faire. Pas d'écran de fin muet.`;

/** La story. Format le plus tolérant sur la forme, le plus exigeant sur l'utilité. */
const STORY = `━━━ FORMAT : STORY ━━━
Vingt-quatre heures de vie, vue par quelqu'un qui suit déjà le compte.

· Le registre est celui des COULISSES : ce qu'on ne montrerait pas dans le feed.
  Le rush de midi, la livraison qui arrive, l'essai raté.
· Une story se regarde en marchant : gros sujet, peu de détails, lisible en une
  seconde.
· Elle appelle une réaction simple — une réponse, un vote, une question.
· Rien d'essentiel dans le sixième supérieur ni inférieur : l'interface les
  couvre.`;

/** Ce que le réseau change, en plus du format. */
const RESEAU: Record<Reseau, string> = {
  instagram: `━━━ RÉSEAU : INSTAGRAM ━━━
Le fil est une vitrine, et la grille se lit comme un tout.
· La photographie prime : lumière construite, matière lisible, cadrage décidé.
· La première ligne de légende est la seule visible : elle pose une tension, un
  chiffre concret, ou une question qui pique.
· L'image doit tenir en VIGNETTE dans la grille, pas seulement en plein écran.`,

  tiktok: `━━━ RÉSEAU : TIKTOK ━━━
On est dans un flux, pas dans une vitrine. L'algorithme juge en trois secondes.
· Même exigence photographique qu'Instagram, avec une intention de CINÉMA :
  contraste assumé, étalonnage, une ambiance. Un plan, pas une prise.
· Le natif l'emporte sur le léché : ce qui ressemble à une publicité est scrollé.
· L'accroche est parlée, directe, sans préambule. On entre au premier mot.`,

  linkedin: `━━━ RÉSEAU : LINKEDIN ━━━
On s'adresse à des pairs, qui jugent d'abord le sérieux.
· Registre documentaire : le travail réel, l'atelier, le geste métier, le
  poste de travail. Quelque chose qu'un professionnel reconnaît.
· Sobre avant spectaculaire — une image trop léchée est lue comme une publicité.
· Ce qui retient ici est ce qu'on APPREND : un chiffre, une méthode, une erreur
  constatée. Pas de promesse, pas d'emoji en rafale, pas de tutoiement racoleur.`,
};

/**
 * Le bloc spécialisé à coller dans le prompt, pour CE réseau et CE format.
 *
 * À placer près de la consigne de sortie : la position pèse autant que le
 * contenu, et ces règles-ci doivent être lues juste avant d'écrire.
 */
export function promptSpecialise(reseau?: string | null, format?: string | null): string {
  const r = normaliserReseau(reseau);
  const f = normaliserFormat(format);
  const blocFormat = f === 'carrousel' ? CARROUSEL : f === 'reel' ? REEL : f === 'story' ? STORY : IMAGE_UNIQUE;
  return ['', RESEAU[r], '', blocFormat, ''].join('\n');
}
