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
/**
 * Ce que le format devient SUR CE RÉSEAU — la case précise de la matrice.
 *
 * ── Pourquoi cette couche existe ──
 *
 * Fondateur, 2026-08-15 : « étant donné qu'on a des reels sur Insta, TikTok et
 * LinkedIn, il faut un prompt reel PAR RÉSEAU, comme il faut un prompt carrousel
 * et image par réseau ! »
 *
 * Le montage précédent additionnait deux blocs : les codes du réseau, puis les
 * règles du format. Le bloc REEL était donc le même partout — alors qu'un reel
 * TikTok, un reel Instagram et une vidéo LinkedIn n'ont ni la même ouverture,
 * ni le même rythme, ni la même fin. Additionner deux généralités ne produit pas
 * une consigne précise : ça produit une moyenne.
 *
 * On garde donc les deux blocs — ils portent ce qui ne change pas — et on ajoute
 * la case : en quoi CE format est différent SUR CE réseau. Trois lignes, pas
 * trente : ce qui change, et rien d'autre.
 */
const MATRICE: Record<Reseau, Partial<Record<'image' | 'carrousel' | 'reel' | 'story', string>>> = {
  instagram: {
    reel: `━━━ CE REEL PART SUR INSTAGRAM ━━━
· On ouvre sur une IMAGE tenue, nette, cadrée — le lecteur arrive du fil, il
  juge la photographie avant le propos.
· Le rythme est posé : un mouvement lent qui laisse voir la matière. Pas de
  coupe sèche toutes les demi-secondes.
· La couverture compte autant que la vidéo : la première image doit tenir seule
  en vignette dans la grille.`,
    carrousel: `━━━ CE CARROUSEL PART SUR INSTAGRAM ━━━
· La première diapositive est une VITRINE : elle se suffit, même si personne ne
  fait défiler.
· Chaque diapositive avance d'un cran — jamais une reformulation de la
  précédente. Si on peut en retirer une sans rien perdre, il faut la retirer.
· La dernière porte l'action, formulée simplement.`,
    image: `━━━ CETTE IMAGE PART SUR INSTAGRAM ━━━
· Elle doit tenir en VIGNETTE : lisible à la taille d'un timbre dans la grille.
· Un sujet unique, un point de netteté évident, un fond qui ne discute pas.
· La lumière est construite : on doit pouvoir nommer d'où elle vient.`,
    story: `━━━ CETTE STORY PART SUR INSTAGRAM ━━━
· L'accroche est INCRUSTÉE sur l'image, en trois ou quatre mots — la plupart
  regardent sans le son.
· Un seul message, lisible en une seconde, au centre du cadre.`,
  },

  tiktok: {
    reel: `━━━ CE REEL PART SUR TIKTOK ━━━
· On entre DANS le geste dès la première image — pas de plan d'établissement,
  pas de vue d'ensemble avant d'arriver au sujet.
· Le brut l'emporte : caméra tenue à la main, cadrage imparfait, lieu réel avec
  son désordre. Un plan trop propre est lu comme une publicité et scrollé.
· Une seule action, filmée en continu. La coupe se justifie ou n'existe pas.
· La dernière seconde dit quoi faire, à voix haute ou en une ligne.`,
    carrousel: `━━━ CE CARROUSEL PART SUR TIKTOK ━━━
· Le format photo y est un DIAPORAMA : il défile vite, souvent en musique.
· Chaque image doit se comprendre sans texte long — une idée, une image.
· La première décide de tout : elle doit surprendre, pas résumer.`,
    image: `━━━ CETTE IMAGE PART SUR TIKTOK ━━━
· Verticale, plein cadre, sujet centré et proche : elle est vue en plein écran,
  jamais en vignette.
· Le naturel prime sur la composition parfaite.`,
  },

  linkedin: {
    reel: `━━━ CETTE VIDÉO PART SUR LINKEDIN ━━━
· On y regarde une DÉMONSTRATION, pas une accroche : le geste professionnel, la
  méthode, le poste de travail.
· Rythme calme, plan tenu, aucune musique tape-à-l'œil. Le fond porte le propos.
· La plupart regardent sans le son et en défilant : ce qui compte doit se
  comprendre à l'image seule.`,
    carrousel: `━━━ CE CARROUSEL PART SUR LINKEDIN ━━━
· C'est le format ROI ici : on y apprend quelque chose, diapositive après
  diapositive.
· Une idée par diapositive, énoncée comme un titre, démontrée en une phrase.
· Un chiffre, une méthode ou une erreur constatée valent mieux qu'une promesse.`,
    image: `━━━ CETTE IMAGE PART SUR LINKEDIN ━━━
· Registre documentaire : l'atelier, la ligne de production, l'équipe en
  situation. Quelque chose qu'un professionnel reconnaît comme vrai.
· Sobre avant spectaculaire — le léché est lu comme une publicité.`,
  },
};

export function promptSpecialise(reseau?: string | null, format?: string | null): string {
  const r = normaliserReseau(reseau);
  const f = normaliserFormat(format);
  const blocFormat = f === 'carrousel' ? CARROUSEL : f === 'reel' ? REEL : f === 'story' ? STORY : IMAGE_UNIQUE;
  // La case de la matrice arrive EN DERNIER, donc au plus près de la consigne
  // d'écriture : c'est la règle la plus précise, elle doit être la dernière lue.
  const cle = f === 'carrousel' ? 'carrousel' : f === 'reel' ? 'reel' : f === 'story' ? 'story' : 'image';
  const cas = MATRICE[r]?.[cle] || '';
  return ['', RESEAU[r], '', blocFormat, '', cas, ''].join('\n');
}

/**
 * Un exemple ABOUTI, pour que le modèle voie ce qu'on attend au lieu de le
 * déduire de vingt règles.
 *
 * ── Pourquoi ──
 *
 * Fondateur, 2026-08-13 : « ne durcis pas trop, j'ai dit ÉLÈVE LE NIVEAU pour
 * que le modèle comprenne direct et au plus précis nos attentes, pour qu'on
 * arrive à la qualité directement. »
 *
 * Il a raison et je faisais l'inverse : depuis trois jours j'empile des
 * interdictions. La doctrine fait douze mille caractères, les prompts de format
 * sept mille, et le prompt de la route bien davantage. Chaque règle ajoutée
 * dilue les précédentes — à ce volume, le modèle ne lit plus une consigne, il
 * navigue dans un règlement.
 *
 * Un exemple entièrement écrit montre en dix lignes ce que trente lignes de
 * règles décrivent mal : le niveau de précision d'une scène, la longueur d'une
 * accroche, le ton d'une légende, la façon dont le produit arrive à la fin.
 * C'est la façon la plus dense de transmettre une attente.
 *
 * Un seul exemple, volontairement : deux inviteraient à choisir, et le modèle
 * mélangerait les deux registres.
 */
const EXEMPLE_ABOUTI = `━━━ CE QU'ON ATTEND, EXEMPLE COMPLET ━━━
(Métier mis en scène : boulangerie. Adapte au métier du jour, ne recopie pas.)

"sujet": "Le coup de feu de 12h30 dans une boulangerie : la file s'allonge et le pain sort du four juste à temps."

"visual_description": "A baker's hands sliding a tray of golden baguettes onto the shop rack at midday, flour still on his forearms, a queue of customers blurred behind the counter, hard summer light through the shopfront, one baguette slightly askew on the tray."

"hook": "12h30, la file déborde et tu es seul derrière le comptoir."

"caption": "12h30, la file déborde et tu es seul derrière le comptoir.\n\nTu sers, tu rends la monnaie, tu réponds à la dame qui demande si le pain aux graines est de ce matin.\n\nEt pendant ce temps, personne ne poste la photo du fournil de 6h — celle qui aurait fait venir trois clients de plus cet après-midi.\n\nC'est exactement ce qu'on prend en charge."

POURQUOI C'EST BON, POINT PAR POINT :
· Le sujet est UN moment précis, pas un thème. « Le coup de feu de 12h30 »,
  pas « la gestion du temps ».
· La scène est photographiable et SPÉCIFIQUE : la farine sur les avant-bras, la
  baguette de travers. Ces détails-là font vraie ; « une boulangerie chaleureuse »
  ne fait rien.
· L'accroche est une SITUATION que le commerçant reconnaît, pas un constat.
  Une heure, un lieu, une tension.
· La légende parle de SA journée, à la deuxième personne, avec des détails qu'il
  a vécus. Aucun client inventé, aucun chiffre.
· Le produit arrive en UNE ligne, à la fin, comme la sortie du problème.
· L'image et le texte racontent la même chose : on peut lire l'un sans l'autre
  et comprendre.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

/** L'exemple abouti, à coller juste avant la consigne de sortie. */
export function exempleAbouti(): string {
  return EXEMPLE_ABOUTI;
}
