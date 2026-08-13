/**
 * LA doctrine de contenu. Une seule fois, pour tous les prompts.
 *
 * ── Pourquoi ce fichier existe ──
 *
 * Fondateur, 2026-08-13 : « assure-toi qu'un seul chemin de prompt soit
 * identifié. »
 *
 * Le 12 août, j'ai passé une journée à corriger le lien forcé à l'actualité et
 * l'interdiction des écrans dans le prompt de la route. Le lendemain, la
 * génération produisait toujours « L'éclipse, un spectacle rare » et une scène
 * « écran de smartphone avec tableau de bord ». Les règles étaient bonnes ;
 * elles étaient simplement contredites ailleurs.
 *
 * Le contenu s'écrit à partir de DEUX prompts : le prompt système
 * (`content-prompt.ts`) et le prompt de la route (`api/agents/content`). Le
 * premier disait « JAMAIS le business sans accroche d'actu » quand le second
 * disait « l'actualité n'est pas un quota ». Le premier citait « un smartphone
 * avec des stats » comme cas normal quand le second interdisait les écrans. Le
 * modèle tranchait — en faveur du plus long et du plus spécifique.
 *
 * Corriger les deux lignes ne suffisait pas : rien n'empêchait la prochaine
 * divergence. Tant qu'une règle peut s'écrire à deux endroits, elle finira par
 * s'y écrire différemment, et personne ne le verra avant de regarder ce qui
 * sort.
 *
 * Les règles qui décident de la QUALITÉ vivent donc ici, et les deux prompts
 * les importent. Le reste — le ton de la marque, le calendrier, les formats —
 * reste où il est : ce fichier n'est pas un fourre-tout, c'est l'endroit où
 * l'on met ce qui ne doit exister qu'une fois.
 *
 * ── Ce qui a le droit d'entrer ici ──
 *
 * Une règle qui, si elle était écrite deux fois, pourrait se contredire ET
 * changerait ce que voit le client. Le reste n'a rien à y faire.
 */

/**
 * L'actualité : une occasion, jamais un quota.
 *
 * Source du défaut le plus fréquent — l'éclipse solaire plaquée sur du
 * marketing, Tom Cruise sur un post de commerçant. Un modèle à qui l'on impose
 * un pourcentage de posts d'actualité fabrique le lien les jours où il n'y en a
 * pas.
 */
export const REGLE_ACTUALITE = `L'ACTUALITÉ EST UNE RESSOURCE, PAS UN QUOTA.
Aucune actualité n'est à caser. La plupart des jours, aucune ne concerne
vraiment le métier du client : un post conseil, démonstration ou preuve est
alors le BON choix, pas un repli. Un post utile sans actualité vaut mieux qu'un
post d'actualité sans utilité.

N'utilise une actualité que si elle change QUELQUE CHOSE pour le client ou pour
ses clients à lui. Deux tests avant de t'en servir :

TEST 1 — Substitue le métier. Si la phrase marche encore pour un plombier, un
avocat et un fleuriste, le lien est faux : c'est une métaphore plaquée.
TEST 2 — Substitue l'actualité. Si la phrase tient avec n'importe quel autre
événement, l'actualité ne sert qu'à décorer.

Un lien VRAI modifie la demande, les coûts, les règles ou les habitudes :
canicule et terrasse, grève et commerce de centre-ville, jour férié et horaires.
Un lien FAUX, même s'il sonne bien : un événement spectaculaire (éclipse,
finale, sortie de film, célébrité) utilisé comme accroche pour parler d'autre
chose. C'est le défaut le plus fréquent et le contrôle le refuse.

LE BON USAGE, CELUI QU'ON VEUT : LE MOMENT QUI CRÉE LE BESOIN.
Une date, une saison ou un événement devient un excellent post quand il déclenche
un PASSAGE À L'ACTION chez le client du commerçant. Ce n'est pas une exception
tolérée, c'est le modèle à viser — c'est là que l'actualité rapporte vraiment.
· Coiffeur, rentrée → « le rush des coupes de dernière minute » : le besoin
  existe cette semaine-là et pas une autre. On prend rendez-vous maintenant.
· Restaurant, canicule → la terrasse à l'ombre à midi, la table qu'on réserve
  la veille parce qu'il n'y en aura plus.
· Boutique, retour du froid → la pièce qu'on vient chercher avant tout le monde.
· Coach, rentrée ou janvier → le moment où l'on s'y remet vraiment.
Ce qui distingue ce bon usage du prétexte : le moment CRÉE le besoin, il ne sert
pas d'introduction. Si le post pouvait sortir en mars sans rien perdre, c'est un
prétexte ; si le besoin naît de cette semaine-là, c'est le bon post.
La pertinence est la seule exigence : le moment doit vraiment changer la journée
de ce commerce, et l'action proposée doit être faisable tout de suite.

ET ÇA DOIT SE VOIR SUR L'IMAGE.
Quand le post s'appuie sur une actualité, un événement ou une saison, on doit
VOIR le lien sans lire le texte. La scène du commerce porte un signe du
moment — la lumière écrasante d'un jour de canicule, les cartables au comptoir
à la rentrée, la buée sur la vitrine en hiver, la file du samedi soir.
Une actualité qui n'existe que dans la légende laisse une image muette : le
lecteur ne fait pas le rapprochement, et le post retombe à plat.

CAS PARTICULIER — le client sert PLUSIEURS métiers (logiciel, agence, conseil).
Le test 1 échoue alors par construction : ses clients à lui SONT tous les
métiers. Pour lui, l'actualité ne sert que si elle touche son propre secteur,
ses outils ou ses règles. Sinon : conseil, démonstration, preuve.`;

/**
 * La scène avant le texte.
 *
 * L'ordre inverse — écrire la légende puis chercher une image — produit un
 * visuel rattrapé après coup, et c'est le deuxième motif de refus. Il coûte
 * double : la génération d'image ratée, puis la régénération.
 */
export const REGLE_SCENE_DABORD = `UN SEUL SUJET, DONT DESCENDENT LA SCÈNE ET LE TEXTE.
Écris d'abord LE SUJET en une phrase — de quoi parle ce post, dans le monde du
commerçant. La scène MONTRE ce sujet, le texte EN PARLE. Les deux descendent de
la même phrase, jamais l'un de l'autre.

Sans cette ancre commune, les deux partent chacun de leur côté : un boulanger à
l'image, une aide pour voiture électrique dans la légende. Chacun était
défendable seul ; ensemble ils ne racontent rien.

LA SCÈNE S'ÉCRIT AVANT LE TEXTE.
Décris d'abord la scène, puis rédige l'accroche et la légende EN LA REGARDANT.
L'inverse — écrire le texte puis chercher une image capable de l'illustrer —
donne un visuel rattrapé après coup, et c'est ce que le contrôle refuse.

UNE SCÈNE, JAMAIS UN CONCEPT. Un générateur d'images ne sait pas illustrer « le
gain de temps » ni « la visibilité » : il sait photographier une main qui repose
un téléphone sur un comptoir pendant qu'un client attend. Traduis toujours
l'idée en un moment concret, qu'on pourrait photographier.

TEST : quelqu'un qui voit l'image SANS lire le texte doit comprendre de quoi
parle le post. Si l'image pourrait accompagner n'importe quelle autre légende,
recommence.

CE QUE MONTRE L'IMAGE : LE COMMERCE. Le geste du métier, le produit, le lieu,
les gens. C'est ce qu'on vient voir et c'est ce qui fait entrer quelqu'un.
Le sujet est toujours une chose qui existe dans l'atelier, la boutique, la
cuisine ou la salle — quelque chose que le commerçant pourrait montrer du doigt.`;

/**
 * Le registre varie, et c'est la scène qui décide.
 *
 * Un compte au ton constant devient un bruit de fond. La règle vaut pour le
 * texte comme pour le choix de la scène.
 */
export const REGLE_PERSONNE = `TU PARLES AU COMMERÇANT, PAS DE LUI.
Écris à la DEUXIÈME PERSONNE, à celui qui lit. Jamais à la troisième personne
sur un commerçant anonyme dont tu raconterais l'histoire.

· « Tu passes combien d'heures par semaine sur tes commandes ? » — juste.
· « Ce boulanger passait 10 h par semaine à gérer ses commandes » — inventé.
· « Ce resto affichait complet même sous la canicule » — inventé.

La différence n'est pas de style, elle est de VÉRITÉ. Dès qu'un post raconte ce
qu'a vécu « ce restaurant », « un coiffeur », « cette boutique », il affirme un
fait qu'on ne peut pas prouver — et le contrôle le refuse, à raison. Le lecteur
aussi le sent : tout le monde a déjà lu ce faux témoignage.

La même idée passe toujours en s'adressant à lui : le problème qu'il reconnaît,
la question qu'il se pose, le moment de sa journée. C'est plus fort, en plus :
on ne lui parle pas d'un autre, on lui parle de lui.

SEULE EXCEPTION : un témoignage RÉEL fourni par le client, avec son nom et son
accord. Dans ce cas il est cité tel quel, sans être embelli.`;

export const REGLE_REGISTRE = `VARIE LE REGISTRE — C'EST LA SCÈNE QUI DÉCIDE.
Un compte qui garde le même ton devient un bruit de fond. Alterne d'une
publication à l'autre : drôle, tendu, tendre, factuel, complice.
· HUMOUR quand la situation est absurde ou universelle — la commande de
  dernière minute, le « c'est possible pour ce soir ? ». On rit de la
  situation, JAMAIS du client ni du métier.
· DRAMATIQUE quand l'enjeu est réel — le samedi qu'on rate, la saison qui se
  joue en trois semaines. Une tension vraie, jamais de peur fabriquée ni de
  compte à rebours inventé.
· TENDRESSE quand la scène la porte : l'habitué qui revient, le geste appris
  d'un parent, le premier jour. C'est ce qui fait commenter.
· FACTUEL quand on a de la matière : un chiffre, une méthode, une erreur
  constatée. Sobre, sans esbroufe.
Une seule règle en travers : le registre doit coller à la scène. Une blague sur
une salle vide un lundi de janvier tombe à plat.

L'ACCROCHE OUVRE SUR UNE SITUATION, PAS SUR UN CONSTAT.
« La rentrée, c'est ton sprint le plus important » est un constat : tout le
monde le sait, personne ne s'arrête. « Lundi 8 h, ta vitrine est prête et ton
compte n'a rien posté depuis dix jours » est une situation.
Pas de question rhétorique en ouverture si sa réponse est évidente.`;

/**
 * Le naturel, dit au rédacteur du brief.
 *
 * La version destinée au générateur d'images vit dans
 * `lib/visuals/exigences-reseau.ts` (en anglais, avec le registre du réseau).
 * Celle-ci s'adresse à qui ÉCRIT le brief : c'est là que le défaut naît.
 */
export const REGLE_NATUREL = `ÇA DOIT PASSER POUR UNE VRAIE PHOTO.
Ce qui trahit une image générée n'est presque jamais un défaut de qualité :
c'est une perfection de trop. Tout est rangé, centré, propre, personne n'a l'air
surpris, aucune surface n'a servi.
Demande donc dans le brief les traces de ce qui s'est passé une minute plus
tôt — une miette, un torchon jeté, une empreinte sur la vitre, une chaise mal
remise. Des gens pris en plein geste, pas en pose. Une lumière imparfaite : une
ombre dure, un coin brûlé. Des matières qui ont vécu.
Jamais de composition symétrique ni de sujet parfaitement centré : un vrai
photographe se déplace, et ça se voit.

EXCEPTION : si le client a demandé un rendu illustré, dessiné ou 3D — depuis la
page de création, le studio ou le chat d'un agent — c'est la commande, pas un
défaut. On le lui donne, et on le soigne dans son registre.`;

/**
 * Le carrousel est une série, pas trois images séparées.
 */
export const REGLE_CARROUSEL = `LE CARROUSEL EST UNE SÉRIE, PAS TROIS IMAGES SÉPARÉES.
· Le champ "slides" est OBLIGATOIRE pour ce format : 3 à 5 objets
  { "visual": "...", "text": "..." }. Sans lui, les diapositives suivantes sont
  bricolées à partir de la première et n'ont aucun lien entre elles — c'est le
  défaut le plus visible d'un carrousel raté.
· Toutes les diapositives se passent DANS LE MÊME LIEU, à la même heure, avec la
  même lumière et les mêmes personnes. Seuls le cadrage et le moment changent :
  large, puis le geste, puis le détail, puis le résultat.
· Chaque diapositive FAIT AVANCER l'histoire. Trois angles du même plan ne sont
  pas un carrousel. Si on peut permuter deux diapositives sans rien perdre,
  c'est qu'elles ne racontent rien.`;

/**
 * Tout, dans l'ordre — à coller dans n'importe quel prompt de génération.
 *
 * Les deux prompts appellent CETTE fonction plutôt que de recopier les règles.
 * C'est ce qui garantit qu'elles ne peuvent plus diverger.
 */
export function doctrineContenu(): string {
  return [
    '━━━━━━━━━ DOCTRINE QUALITÉ (source unique) ━━━━━━━━━',
    REGLE_SCENE_DABORD,
    '',
    REGLE_NATUREL,
    '',
    REGLE_ACTUALITE,
    '',
    REGLE_PERSONNE,
    '',
    REGLE_REGISTRE,
    '',
    REGLE_CARROUSEL,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}
