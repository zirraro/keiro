/**
 * Ce qu'« excellent » veut dire, réseau par réseau.
 *
 * ── Pourquoi ce fichier existe ──
 *
 * Fondateur, 2026-08-11 : « on avait mis en place un contrôle qualité sur reel,
 * images et carrousels sur Insta et TikTok, et il faut le mettre sur LinkedIn,
 * sachant que les stratégies sont différentes par réseau. » Puis, sur le fond :
 * « on veut de la qualité photographe pro sur Insta, pareil sur TikTok avec un
 * peu plus de cinéma, et professionnel sur LinkedIn. »
 *
 * Jusqu'ici les contrôles jugeaient tout à la même aune — le prompt du contrôle
 * d'image commençait littéralement par « You audit Instagram visuals », y
 * compris quand la publication partait sur TikTok ou LinkedIn. Un même barème
 * pour trois audiences qui n'attendent pas la même chose : la photo léchée qui
 * fait s'arrêter sur Instagram passe pour de la publicité sur LinkedIn, et la
 * sobriété qui inspire confiance sur LinkedIn n'existe pas dans un fil TikTok.
 *
 * Une seule définition, ici, pour que les trois contrôles (image, reel,
 * cohérence éditoriale) disent la même chose — et pour qu'ajouter un réseau
 * demande d'écrire ce qu'on y attend, plutôt que de le découvrir en produisant
 * du contenu médiocre.
 *
 * ── La règle qui vaut partout ──
 *
 * « Pas d'image ou de reel qui ressemble à de l'IA, robot, cartoon ou animé,
 * sauf si demandé expressément par le client. » Elle ne dépend pas du réseau :
 * un rendu qui se voit comme généré coûte la confiance sur les trois. On la
 * garde donc à part, et on ne la lève que sur demande explicite.
 */

export type Reseau = 'instagram' | 'tiktok' | 'linkedin';

export interface ExigenceReseau {
  nom: string;
  /** Ce qu'on attend de l'image ou de la vidéo. Injecté tel quel dans les prompts. */
  visuel: string;
  /** Ce qu'on attend du texte et de l'accroche. */
  texte: string;
  /**
   * Note minimale sur 10 pour partir. Volontairement différente : sur LinkedIn
   * une publication tiède ne fait pas de mal, elle ne fait rien ; sur TikTok
   * elle consomme une place dans un fil où l'algorithme juge en trois secondes.
   */
  notePlancher: number;
}

export const EXIGENCES: Record<Reseau, ExigenceReseau> = {
  instagram: {
    nom: 'Instagram',
    visuel: `QUALITÉ ATTENDUE : celle d'un PHOTOGRAPHE PROFESSIONNEL.
· Lumière construite — on doit sentir d'où elle vient, elle sculpte le sujet au lieu de l'aplatir.
· Matière lisible : la croûte, le grain du bois, la buée sur le verre, le tissu. C'est ce qui distingue une vraie photo d'un rendu.
· Profondeur de champ maîtrisée : sujet net, arrière-plan qui recule proprement. Jamais de flou sur le sujet principal.
· Cadrage décidé, pas centré par défaut. Un premier plan, un fond, un point où l'œil se pose.
· Colorimétrie naturelle : ni saturation criarde, ni filtre uniforme.
Le fil Instagram est une vitrine : une image tiède y coûte un abonné.`,
    texte: `La PREMIÈRE LIGNE est seule visible avant « plus » : elle doit poser une tension, un chiffre concret ou une question qui pique. Ton incarné, tutoiement, respiration entre les lignes.`,
    notePlancher: 7,
  },

  tiktok: {
    nom: 'TikTok',
    visuel: `QUALITÉ ATTENDUE : la même exigence photographique que sur Instagram, avec UN PEU PLUS DE CINÉMA.
· Tout ce qui vaut pour la photo pro vaut ici : lumière construite, matière, netteté du sujet.
· En plus : une intention de cinéma — étalonnage, contraste assumé, une ambiance. On doit sentir un plan, pas une prise.
· Le mouvement fait partie de l'image : un travelling lent, une profondeur qui bouge, une action qui se déroule. Une image fixe et morte n'a rien à faire dans un fil TikTok.
· Vertical plein cadre, sujet lisible sur un petit écran, rien d'important dans les marges qui seront couvertes par l'interface.
· Les TROIS PREMIÈRES SECONDES décident de tout : le sujet doit être identifiable immédiatement, sans plan d'introduction.
Attention : « cinéma » ne veut pas dire irréel. Le rendu reste celui d'une caméra, jamais d'un moteur de rendu.`,
    texte: `L'accroche joue dans les trois premières secondes, à l'oral comme à l'écrit. Directe, parlée, sans préambule. On entre dans le sujet au premier mot.`,
    notePlancher: 7,
  },

  linkedin: {
    nom: 'LinkedIn',
    visuel: `QUALITÉ ATTENDUE : PROFESSIONNELLE, au sens propre du terme.
· On montre le travail réel : l'atelier, l'équipe en situation, le geste métier, le poste de travail, le chantier, un écran ou un document LISIBLE.
· Sobriété : lumière juste, cadrage propre, pas d'effet. Ce qui fait la valeur ici est la crédibilité, pas le spectaculaire.
· La netteté et la lumière restent au niveau d'un photographe professionnel — sobre ne veut pas dire négligé.
· Ni photo de banque d'images générique (poignée de main, gratte-ciel, courbe qui monte), ni mise en scène publicitaire.
· Un visuel qui pourrait illustrer n'importe quelle entreprise n'illustre celle-ci en rien.
Le lecteur de LinkedIn juge d'abord le SÉRIEUX. Une image trop léchée y est lue comme de la publicité, et il passe.`,
    texte: `Registre professionnel : on s'adresse à des pairs, pas à des clients qu'on racole. L'accroche est un CONSTAT D'EXPERTISE ou une observation de terrain, jamais un appât.
· Pas de tutoiement racoleur, pas de chapelet d'emojis, pas de « 🚀 » ni de « le secret que personne ne te dit ».
· On peut être direct et vivant, mais ce qui retient ici est ce qu'on APPREND, pas ce qu'on promet.
· Un chiffre, une méthode, une erreur constatée : de la matière.`,
    notePlancher: 7,
  },
};

/** Le réseau, avec Instagram en repli quand rien n'est précisé. */
export function exigenceDe(plateforme?: string | null): ExigenceReseau {
  const cle = String(plateforme || '').toLowerCase();
  return EXIGENCES[cle as Reseau] || EXIGENCES.instagram;
}

/**
 * La règle qui ne dépend d'aucun réseau.
 *
 * `clientADemande` la lève : le client peut vouloir une illustration, un rendu
 * 3D ou un personnage dessiné, et il le demande depuis la page de création, le
 * studio ou le chat d'un agent. Dans ce cas ce n'est pas un défaut, c'est la
 * commande — et un contrôle qui la refuserait empêcherait le client d'obtenir
 * ce qu'il a demandé.
 */
export function regleAntiRenduIA(clientADemande = false): string {
  if (clientADemande) {
    return `RENDU NON PHOTOGRAPHIQUE : le client l'a EXPRESSÉMENT DEMANDÉ pour cette publication. Un rendu illustré, dessiné, 3D ou stylisé est donc ATTENDU ici — ne le compte pas comme un défaut. Juge-le sur son exécution : est-il soigné, lisible, cohérent avec le propos ?`;
  }
  return `AUCUN RENDU QUI SE VOIT COMME GÉNÉRÉ — c'est éliminatoire.
Sont refusés : l'aspect « image d'IA » (peau lissée en plastique, regard vitreux, lumière irréelle, symétrie trop parfaite, arrière-plan qui fond), le rendu 3D, le style cartoon, dessin animé, illustration vectorielle, personnage de synthèse, robot, ou tout ce qui ressemble à un moteur de rendu plutôt qu'à un appareil photo.
Vérifie en particulier : les MAINS et les doigts, le TEXTE incrusté dans l'image (lettres déformées ou inventées), les visages en arrière-plan, les objets qui se fondent l'un dans l'autre, les reflets incohérents.
Le client vend à de vraies personnes : une image qui sent la machine lui coûte sa crédibilité. Si tu hésites entre « photo » et « généré », c'est que ça se voit — considère que ça se voit.`;
}

/**
 * ── La même exigence, dite au GÉNÉRATEUR ──
 *
 * Fondateur, 2026-08-11 : « il faut sortir le plus vite possible, de préférence
 * dès la 1re génération, une top image ou un top reel. »
 *
 * C'est le seul endroit où qualité et coût vont dans le même sens. Aujourd'hui
 * le pipeline génère, contrôle, et régénère jusqu'à deux fois si la note est
 * sous le plancher : chaque reprise est payée. Or le contrôle sait exactement
 * ce qu'il cherche, et le générateur ne l'a jamais su — il recevait une
 * consigne de réalisme identique pour les trois réseaux.
 *
 * On donne donc au générateur le barème du juge, réseau par réseau. Une reprise
 * évitée, c'est une génération économisée ET une publication meilleure.
 *
 * En anglais : les moteurs d'image suivent nettement mieux une consigne en
 * anglais, et c'est déjà la langue des prompts du projet.
 */
/**
 * Ce qui fait qu'une image passe pour vraie.
 *
 * Fondateur, 2026-08-12 : « surtout pour les métiers clients et les produits,
 * il faut du super naturel, on ne doit pas voir que c'est de l'IA. »
 *
 * Le défaut d'une image générée n'est presque jamais un défaut de qualité :
 * c'est une PERFECTION de trop. Tout est rangé, centré, propre, personne n'a
 * l'air surpris, aucune surface n'a servi. Une vraie photo porte les traces de
 * ce qui s'est passé juste avant — une miette, un torchon jeté, un reflet mal
 * placé. Ce sont ces accidents qui font qu'on ne se pose pas la question.
 *
 * Vaut pour les trois réseaux : c'est la base commune, le registre du réseau
 * s'ajoute par-dessus.
 */
const BASE_NATUREL = `━━━ IT MUST PASS FOR A REAL PHOTOGRAPH ━━━
What gives a generated image away is almost never poor quality — it is one
perfection too many. Everything tidy, centred, spotless, nobody caught
off-guard, no surface that has been used.
- Leave the traces of what happened a minute earlier: crumbs, a cloth thrown
  down, a fingerprint on the glass, a chair not pushed back in, stock that is
  not perfectly aligned.
- Real people, caught mid-gesture, not posing: eyes not always on the lens, a
  half-finished movement, ordinary clothes with creases, skin with texture and
  pores — never smooth, never waxen.
- Imperfect light is credible light: a hard shadow, a blown-out corner, a
  reflection where a photographer would not have wanted one.
- Materials that have lived: worn wood, scratched metal, a slightly faded sign.
- Never a symmetrical composition or a perfectly centred subject. A real
  photographer moves, and it shows.
This is the FIRST criterion — before beauty. A slightly imperfect photograph
that reads as true beats a flawless image that reads as made.`;

/**
 * Ce qu'on dit au générateur quand le client a demandé AUTRE CHOSE qu'une photo.
 *
 * Fondateur, 2026-08-12 : « si le client demande via création, studio ou même
 * via le chat une autre forme, on s'adapte. »
 *
 * Sans cette porte, le bloc ci-dessus se retournerait contre lui : on lui
 * imposerait du réalisme là où il a explicitement commandé une illustration.
 * Le contrôle sait déjà lever la règle anti-rendu ; le générateur doit savoir
 * en faire autant, sinon les deux se contredisent et le client n'obtient jamais
 * ce qu'il a demandé.
 */
const RENDU_DEMANDE = `━━━ THE CLIENT ASKED FOR THIS RENDERING ━━━
An illustrated, drawn, 3D or stylised rendering is what was ORDERED here — it
is not a defect. Do not force photorealism onto it.
Execute it well instead: a clear subject, deliberate composition, a coherent
palette, clean lines, readable at thumbnail size. Craft, in the register asked
for.`;

export function directiveGeneration(plateforme?: string | null, renduDemandeParLeClient = false): string {
  const cle = String(plateforme || '').toLowerCase();
  const NATUREL = renduDemandeParLeClient ? RENDU_DEMANDE : BASE_NATUREL;

  if (cle === 'tiktok') {
    return `━━━ NETWORK: TIKTOK ━━━
Same photographic realism as always, with a CINEMATIC intent on top.
- Filmic grade: deeper shadows, assumed contrast, a touch of halation in the highlights.
  It should feel like one frame lifted out of a longer take, not a photo taken to be posted.
- Vertical 9:16. The subject must read on a small screen. Keep the top and bottom sixth
  clear of anything essential — the interface covers them.
- Imply MOTION: a pour caught mid-air, steam rising, a hand entering frame, someone turning.
  A dead still frame has no place in a TikTok feed.
- The first instant decides everything: the subject is identifiable immediately, no
  establishing shot, no build-up.
Cinematic NEVER means unreal — a cinema CAMERA, never a render engine.

${NATUREL}`;
  }

  if (cle === 'linkedin') {
    return `━━━ NETWORK: LINKEDIN ━━━
Documentary / reportage register — this is a workplace, photographed as it is.
- Show the real work: the workshop, the gesture of the trade, the team in the middle of
  something, the workstation, the site. Something a professional would recognise.
- Sober and credible before spectacular: natural light, clean framing, no advertising
  staging, no glow, no styling for effect.
- Slightly wider framing than a lifestyle shot — the professional CONTEXT is the subject.
- BANNED, they read as stock and destroy credibility instantly: handshakes, skylines,
  rising graphs, suited people pointing at a whiteboard, generic open-plan offices.
Sober does NOT mean careless: same professional-photographer standard of light, sharpness
and texture. A reader of LinkedIn judges seriousness first — an over-polished image reads
as an advert, and they scroll past.

${NATUREL}`;
  }

  return `━━━ NETWORK: INSTAGRAM ━━━
Editorial lifestyle photography, at the level of a professional photographer on assignment.
- Built light: one identifiable source that sculpts the subject instead of flattening it.
- Readable material: crust, wood grain, condensation on glass, fabric weave. That is what
  separates a real photograph from a render.
- Controlled depth of field: subject tack sharp, background receding naturally.
- Decided framing, never centred by default — a foreground, a background, somewhere for
  the eye to land.
It must hold up as a thumbnail in the grid: the feed is a shop window, and a lukewarm
image costs a follower.

${NATUREL}`;
}

/**
 * Bloc prêt à coller dans un prompt de contrôle. Rassemble l'exigence du
 * réseau et la règle universelle, pour qu'aucun contrôle n'en applique
 * la moitié.
 */
export function blocExigence(plateforme?: string | null, opts?: { renduNonPhotoDemande?: boolean; avecTexte?: boolean }): string {
  const e = exigenceDe(plateforme);
  return [
    `═══ RÉSEAU : ${e.nom} ═══`,
    e.visuel,
    ...(opts?.avecTexte ? ['', e.texte] : []),
    '',
    regleAntiRenduIA(opts?.renduNonPhotoDemande),
  ].join('\n');
}
