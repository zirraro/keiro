/**
 * Le réalisme photographique, appliqué à TOUTE génération.
 *
 * Demande du fondateur (2026-08-07) : « je veux absolument des générations
 * d'images et de reels qui fassent le moins IA possible, super naturel comme
 * un photographe pro le ferait — sauf indication contraire du client. »
 *
 * ── Pourquoi ce fichier existe ──
 *
 * Le réalisme était déjà travaillé, mais par endroits : très fort pour les
 * plats en restaurant (dish-in-venue-i2i), présent par métier
 * (business-naturalism), absent partout ailleurs. Un post « équipe », une
 * story promo ou un reel générique sortaient donc avec le rendu par défaut du
 * modèle — celui que tout le monde reconnaît au premier coup d'œil.
 *
 * Une directive commune, injectée dans chaque prompt, garantit le plancher.
 * Les profils par métier continuent de préciser ce que « naturel » veut dire
 * pour un garage ou un institut : ils s'ajoutent, ils ne remplacent pas.
 *
 * ── Ce qui trahit une image générée ──
 *
 * Ce n'est presque jamais le sujet, c'est le rendu : lumière parfaitement
 * homogène sans source identifiable, peau lissée sans pores ni asymétrie,
 * profondeur de champ irréelle, symétrie trop propre, saturation poussée,
 * absence totale de désordre. Un vrai commerce a des traces d'usage — un
 * torchon qui traîne, une chaise mal alignée, un reflet dans une vitre.
 * C'est ce désordre qui rend crédible, et c'est exactement ce que les
 * modèles suppriment par défaut.
 */

import { famillesDe } from '../business-families';

/** Le socle, ajouté à chaque prompt d'image. */
export const REALISME_SOCLE = [
  'PHOTOREALISM — ABSOLUTE PRIORITY: this must read as a real photograph taken by a professional',
  'photographer on a real assignment, never as a generated image.',
  '',
  'CAMERA: full-frame body, fast prime lens (35mm or 50mm), shot at f/2.0–f/4 — real depth of field',
  'with a natural falloff, not a synthetic blur. Slight, believable perspective. Handheld feel.',
  '',
  'LIGHT: one identifiable source (window, shopfront, lamp, sun) with direction and consequence —',
  'real shadows, real falloff, one side darker than the other. Never flat, never evenly lit from',
  'nowhere. Mixed colour temperature is fine and desirable.',
  '',
  'TEXTURE: visible material grain — skin with pores and asymmetry, fabric weave, wood grain,',
  'fingerprints on glass, condensation, crumbs, wear on surfaces. Fine photographic noise in the',
  'shadows. Nothing airbrushed, nothing plastic.',
  '',
  'COMPOSITION: slightly imperfect framing, as a real photographer working fast would get it.',
  'Off-centre is fine. Objects may be cropped by the frame edge. Avoid perfect symmetry.',
  '',
  'LIVED-IN: a real business shows use — a cloth left out, a chair not aligned, a reflection in a',
  'window, a hand entering frame. This everyday untidiness is what makes it credible; do not',
  'clean it away.',
  '',
  'COLOUR: natural, restrained. No boosted saturation, no orange-and-teal grade, no glow.',
].join('\n');

/** Ce qu'on interdit explicitement — la liste qui fait le plus de différence. */
export const REALISME_INTERDITS = [
  'NOT: 3D render, CGI, illustration, digital painting, concept art.',
  'NOT: airbrushed or plastic skin, flawless symmetrical faces, model-agency looks.',
  'NOT: studio product-shot lighting on a real-world scene, softbox glow from every direction.',
  'NOT: over-saturated or HDR-looking colour, halo or bloom effects, lens flare added for style.',
  'NOT: impossibly tidy spaces, showroom perfection, everything centred and aligned.',
  'NOT: stock-photo staging — people laughing at salad, exaggerated thumbs-up, fake eye contact.',
  'NOT: warped hands, extra fingers, mismatched reflections.',
  '',
  // ── ZÉRO TEXTE ──
  //
  // 2026-08-10 — Le repassage des 357 publications du planning a refusé 80
  // images, dont CINQUANTE pour du texte parasite : enseignes inventées,
  // charabia sur un emballage, mots anglais sur un commerce français.
  //
  // Le contrôle qualité rejette le texte depuis des mois. Le générateur, lui,
  // n'a jamais reçu la consigne de ne pas en produire — la ligne précédente
  // parlait d'« artefacts de texte », noyée au milieu des mains déformées, ce
  // qui n'est pas une interdiction mais une remarque. On refusait donc ce
  // qu'on n'avait jamais demandé d'éviter, et on repayait la génération.
  //
  // Formulé en tête, en majuscules, avec les cas concrets : les moteurs
  // d'image suivent mal une consigne noyée, et bien une consigne isolée.
  'ABSOLUTELY NO TEXT ANYWHERE IN THE IMAGE. No letters, words, numbers, glyphs',
  'or characters of any kind. No shop signs, no menu boards, no chalkboards, no',
  'labels on packaging, no price tags, no book covers, no screens showing text,',
  'no watermarks, no logos with readable lettering. If the scene would naturally',
  'contain a sign or a label, frame it out, blur it beyond legibility, or turn it',
  'away from the camera. A single stray character makes the image unusable.',
].join('\n');

/**
 * La directive complète, à injecter dans le prompt image.
 *
 * `styleDemande` court-circuite le socle quand le client a explicitement
 * demandé autre chose — illustration, dessin, rendu graphique. Le fondateur a
 * posé la règle : naturel par défaut, « sauf indication contraire du client ».
 * Son choix prime toujours sur notre plancher.
 */
export function blocRealisme(styleDemande?: string | null): string {
  const style = String(styleDemande || '').toLowerCase();
  const veutAutreChose = /(illustration|dessin|cartoon|3d|rendu|graphique|anim[ée]|flat design|vectoriel|aquarelle)/.test(style);
  if (veutAutreChose) {
    return `\n=== STYLE DEMANDÉ PAR LE CLIENT ===\n`
      + `Le client a demandé un rendu « ${String(styleDemande).slice(0, 80)} ». Tu le respectes :\n`
      + `sa consigne prime sur le réalisme photographique par défaut.\n`;
  }
  return `\n=== RÉALISME PHOTOGRAPHIQUE (priorité absolue) ===\n${REALISME_SOCLE}\n\n${REALISME_INTERDITS}\n`;
}

/**
 * Version courte, pour les prompts déjà longs ou les modèles à fenêtre serrée.
 *
 * Garde ce qui porte le plus : la source de lumière identifiable, la texture,
 * et le refus du lissage. Le reste est du raffinement.
 */
export function blocRealismeCourt(styleDemande?: string | null): string {
  const style = String(styleDemande || '').toLowerCase();
  if (/(illustration|dessin|cartoon|3d|rendu|graphique|anim[ée]|flat design|vectoriel|aquarelle)/.test(style)) {
    return `Rendu demandé par le client : ${String(styleDemande).slice(0, 60)}.`;
  }
  return 'Real photograph, 35mm prime at f/2.8, one identifiable light source with real shadows, '
    + 'visible texture and grain, slightly imperfect framing, lived-in and untidy. '
    + 'NOT 3D, NOT CGI, NOT airbrushed, NOT studio-lit, NOT over-saturated, NOT stock-photo staging.';
}

/**
 * Le registre visuel du métier.
 *
 * Précision du fondateur (2026-08-08) : « par domaine on peut peut-être faire
 * du léché ou d'autres directives de base, mais pour certains domaines et le
 * restaurant, ce n'est pas la direction à prendre — il faut de l'authentique. »
 *
 * Nuance qui manquait. Un restaurant de quartier, une boulangerie, un garage
 * vendent la confiance : la photo doit sentir le lieu réel, avec ses traces
 * d'usage. Une bijouterie, une boutique de mode, un institut haut de gamme
 * vendent le soin et la maîtrise : une image trop brute y ferait bon marché.
 *
 * La différence ne porte JAMAIS sur le réalisme — aucun métier ne veut d'une
 * image qui sente la génération. Elle porte sur la mise en scène : lieu vécu et
 * geste attrapé au vol d'un côté, composition posée et lumière maîtrisée de
 * l'autre. Dans les deux cas, un photographe professionnel, jamais un moteur.
 */
export type RegistreVisuel = 'authentique' | 'soigne';

const REGISTRE_PAR_FAMILLE: Record<string, RegistreVisuel> = {
  // Le vécu vend la confiance.
  restaurant: 'authentique', boulangerie: 'authentique', patisserie: 'authentique',
  boucherie: 'authentique', cafe: 'authentique', bar: 'authentique',
  garage: 'authentique', plombier: 'authentique', electricien: 'authentique',
  menuisier: 'authentique', fleuriste: 'authentique', coiffeur: 'authentique',
  salle_sport: 'authentique', veterinaire: 'authentique', menage: 'authentique',
  // Le soin fait partie du produit.
  bijouterie: 'soigne', mode: 'soigne', opticien: 'soigne',
  institut_beaute: 'soigne', hotel: 'soigne', immobilier: 'soigne',
  comptable: 'soigne', agence: 'soigne',
};

/** Le registre du métier — authentique par défaut, c'est le plus sûr. */
export function registreVisuelPour(businessType?: string | null): RegistreVisuel {
  for (const f of famillesDe(businessType)) {
    if (REGISTRE_PAR_FAMILLE[f]) return REGISTRE_PAR_FAMILLE[f];
  }
  return 'authentique';
}

/**
 * La respiration publicitaire — une publication sur sept, pas plus.
 *
 * Demande du fondateur (2026-08-08) : « on veut des formats photographe pro, et
 * pourquoi pas publicitaire, mais tournant dans la stratégie — pas les
 * publications principales. »
 *
 * Un feed uniquement documentaire finit par se ressembler : même lumière, même
 * geste, même cadrage imparfait. Une affiche de temps en temps casse le rythme
 * et donne un repère de marque. Mais elle ne peut pas devenir la norme, sinon
 * on retombe exactement dans le look publicitaire qu'on vient de retirer.
 *
 * Une sur sept : assez rare pour rester un accent, assez fréquente pour se
 * remarquer sur un mois. Le choix est DÉTERMINISTE, calculé sur la date et le
 * client : deux générations du même jour ne peuvent pas tomber toutes les deux
 * en publicitaire, et le rythme reste vérifiable a posteriori.
 *
 * Le réalisme n'est PAS abandonné pour autant : une affiche crédible reste une
 * photo, simplement composée et pensée pour porter un message.
 */
export function estTourPublicitaire(userId: string | null | undefined, date = new Date()): boolean {
  const jour = Math.floor(date.getTime() / 86400000);
  // Décalage par client : tous les commerces n'ont pas leur affiche le même
  // jour, ce qui éviterait de faire ressembler les comptes entre eux.
  let empreinte = 0;
  for (const c of String(userId || '')) empreinte = (empreinte * 31 + c.charCodeAt(0)) % 7;
  return (jour + empreinte) % 7 === 0;
}

/** Le registre « affiche » — composé, mais toujours photographique. */
export const REGISTRE_AFFICHE = [
  'REGISTER — POSTER: this one is an accent in the feed, not the everyday post.',
  'A composed frame built to carry one message: a clear hero subject, generous negative',
  'space where a headline could sit, deliberate arrangement, a restrained palette.',
  'It REMAINS a real photograph — same single light source, same texture, same grain,',
  'same refusal of airbrushing. A poster shot by a photographer, not a rendered graphic.',
  'No 3D, no CGI, no flat design, no gradient art, no added text.',
].join('\n');

/** Ce qui change entre les deux registres — la mise en scène, jamais le réalisme. */
export function nuanceRegistre(registre: RegistreVisuel): string {
  return registre === 'soigne'
    ? [
        'REGISTER — CONSIDERED: this trade sells care and mastery, so the frame is composed and the',
        'light is controlled. Cleaner surfaces, deliberate arrangement, a calmer palette.',
        'It stays a REAL photograph: same texture, same single light source, same fine grain, same',
        'refusal of airbrushing. Composed does not mean synthetic — a skilled photographer simply',
        'took time. Still no CGI, no plastic skin, no showroom emptiness.',
      ].join('\n')
    : [
        'REGISTER — LIVED-IN: this trade sells trust, and trust comes from the place looking real.',
        'Keep the working mess: a cloth left out, a chair off-line, crumbs, worn surfaces, a hand',
        'entering frame. Catch the gesture mid-action rather than arranging it.',
        'Tidying the scene is the single fastest way to make it look generated.',
      ].join('\n');
}

/**
 * Le socle vidéo — reels et clips.
 *
 * La règle vidéo existante disait « photographer realism — Vogue/Cereal
 * editorial look ». Or « Vogue editorial » pousse vers le léché, le poli, le
 * publicitaire : exactement l'inverse du naturel demandé. Une vidéo trahit
 * d'ailleurs plus vite qu'une photo — un mouvement de caméra trop parfait, une
 * lumière qui ne bouge pas, une peau sans grain, et l'œil décroche.
 *
 * Ce qui rend une vidéo crédible tient à trois choses : une caméra tenue à la
 * main avec ses micro-imperfections, une lumière qui a une source et qui varie
 * quand le sujet bouge, et une action réelle plutôt qu'une pose.
 */
export const REALISME_VIDEO = [
  'REALISM — ABSOLUTE PRIORITY: footage must look shot on a real camera by a real person,',
  'never generated, never a commercial.',
  '',
  'CAMERA: handheld with natural micro-movement — tiny drift, small corrections, imperfect',
  'framing. NOT a perfect gimbal glide, NOT a drone sweep, NOT a locked-off tripod unless the',
  'scene calls for it. Shallow depth of field from a real fast lens, with focus that breathes.',
  '',
  'LIGHT: one identifiable source. As the subject or camera moves, the light on them CHANGES —',
  'that variation is what makes it read as real. Mixed colour temperature welcome.',
  '',
  'ACTION: someone doing their actual job, mid-gesture, not posing or presenting to camera.',
  'Hands working. No eye contact with the lens unless it happens naturally.',
  '',
  'TEXTURE: skin with pores, steam, flour dust, condensation, worn surfaces. Fine grain.',
  'Nothing beautified, nothing smoothed.',
  '',
  'NOT: slow-motion glamour, speed ramps, colour grading with orange-and-teal, lens flares,',
  'bloom, motion graphics, text overlays, logo animations, stock-footage staging, or the',
  'glossy look of an advert. Documentary before commercial, always.',
].join('\n');

/**
 * Les deux formats de reel qui fonctionnent pour un commerce.
 *
 * Demande du fondateur (2026-08-08) : « en image, et un peu clip
 * cinématographie en reel — ou format interview. »
 *
 * Ce sont deux registres bien distincts, et les mélanger donne le pire des
 * deux. Le clip vit du geste et de la matière, sans parole ; l'interview vit
 * de la personne qui parle, et tout le reste s'efface derrière elle.
 *
 * L'interview est le format le plus difficile à truquer et le plus crédible :
 * c'est aussi celui qui exige que le client fournisse son propre média, parce
 * qu'un visage généré se repère immédiatement et trahirait tout le compte.
 */
export const REEL_CLIP = [
  'FORMAT — CINEMATIC CLIP: no speech, no presenter. The subject is the craft itself.',
  'One continuous shot, or a single matched cut from wide to detail on the SAME subject.',
  'Slow, deliberate movement following a real gesture — kneading, pouring, plating, wiping down.',
  'Sound design carries it, not narration. Let the material breathe: steam, flour, water, metal.',
  'Cinematic means patient and composed, NOT graded orange-and-teal, NOT slow-motion glamour.',
].join('\n');

export const REEL_INTERVIEW = [
  'FORMAT — INTERVIEW: one person talking to camera or slightly off-axis, in their own place.',
  'Static or barely-moving frame at eye level, subject off-centre, the workplace readable behind',
  'them but out of focus. Natural light from a window on one side.',
  'They speak as themselves — hesitations, hands moving, a look away mid-sentence. Not a pitch.',
  'This format REQUIRES the client\'s own footage: a generated face is spotted immediately and',
  'discredits the whole account. If no real footage exists, fall back to the cinematic clip.',
].join('\n');

/** À accrocher à un prompt vidéo, sauf style explicitement demandé. */
export function blocRealismeVideo(styleDemande?: string | null): string {
  const style = String(styleDemande || '').toLowerCase();
  if (/(illustration|dessin|cartoon|3d|rendu|graphique|anim[ée]|motion design)/.test(style)) {
    return `Rendu demandé par le client : ${String(styleDemande).slice(0, 60)}.`;
  }
  return REALISME_VIDEO;
}

/**
 * Impose le rendu photo à une diapositive de carrousel.
 *
 * Constat du fondateur (2026-08-07) : « le dernier carrousel, la 1re photo ok,
 * la 2e elle est animée, la 3e en mode robot. Ça sort des indications. »
 *
 * Chaque diapositive est générée SÉPARÉMENT, à partir de la description que le
 * modèle a écrite pour elle. S'il écrit « illustration de… » ou « rendu 3D
 * de… », c'est exactement ce qu'on obtient — et le carrousel part dans trois
 * directions visuelles différentes.
 *
 * On nettoie donc la description des termes qui font dérailler le rendu, et on
 * lui accroche le socle photographique. Le style du client, lui, reste
 * prioritaire : s'il a demandé de l'illustration, on n'y touche pas.
 */
export function diapoRealiste(description: string, styleDemande?: string | null): string {
  const style = String(styleDemande || '').toLowerCase();
  if (/(illustration|dessin|cartoon|3d|rendu|graphique|anim[ée]|flat design|vectoriel|aquarelle)/.test(style)) {
    return description;
  }
  // Les termes qui basculent le moteur en non-photo, retirés du brief lui-même :
  // les laisser et ajouter « photoréaliste » à côté donne un résultat hybride,
  // souvent pire que l'un ou l'autre.
  // Les bornes de mot sont indispensables : sans elles « 3d » se retrouve
  // découpé dans d'autres mots, et la compression d'espaces écrite sans
  // échappement supprimait les suites de la lettre « s » — « glasses »
  // devenait « glae ». Deux bugs invisibles à la lecture rapide.
  const TERMES_NON_PHOTO = /\b(3d render|3d|cgi|illustration|illustrated|cartoon|anime|animated|digital painting|concept art|vector|flat design|watercolor|sketch|drawing|render(ed|ing)?)\b/gi;
  const nettoyee = String(description || '')
    .replace(TERMES_NON_PHOTO, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return nettoyee + ' — ' + blocRealismeCourt();
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LE BRIEF D'UN REEL, ÉCRIT SUR LA GRILLE QUI LE NOTERA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── Le défaut trouvé le 2026-08-10 ──
 *
 * Le fondateur : « vu le prix des reels, on doit avoir la qualité attendue dès
 * la 1re génération. »
 *
 * En comparant le brief de génération et la grille du contrôle qualité, ils se
 * contredisaient sur le point le plus important. Le brief demandait :
 *
 *     « (1) wide ESTABLISHING shot setting the place »
 *
 * et la grille note l'accroche ainsi :
 *
 *     « la PREMIÈRE frame donne-t-elle envie de ne pas scroller ? Mouvement
 *       déjà engagé, gros plan texturé, tension visuelle (10) vs plan large
 *       mou, lieu vide, image de mise en place (0) »
 *
 * On commandait donc exactement ce qui vaut zéro. Le premier essai partait
 * perdant sur l'un des six critères éliminatoires, et il fallait une deuxième
 * génération — payante — pour rattraper une consigne fautive.
 *
 * ── Le principe ──
 *
 * Un générateur ne devine pas comment on le juge. Chaque critère de la grille
 * est donc une consigne explicite du brief, dans le vocabulaire concret que les
 * moteurs suivent — un geste, une matière, un mouvement d'appareil — et jamais
 * en termes abstraits de qualité.
 *
 * Toute évolution de la grille de notation doit être répercutée ici. Les deux
 * textes forment une paire : les laisser diverger, c'est payer des générations
 * pour rien.
 */
export const BRIEF_REEL_SUR_GRILLE = [
  'HOW THIS REEL WILL BE GRADED — write every beat to score high on all six:',
  '',
  '1. HOOK (first frame decides everything). Open ON A GESTURE ALREADY IN MOTION,',
  '   framed CLOSE, with visible texture — hands mid-knead, coffee mid-pour, scissors',
  '   mid-cut, steam already rising. NEVER open on a wide empty room, a storefront, or',
  '   a set-up shot: an establishing wide scores ZERO and the viewer scrolls past.',
  '   Save the wider view for beat 2 or 3, as a reveal.',
  '',
  '2. CONTINUITY. The SAME subject and the SAME object from first frame to last.',
  '   An object that changes between beats — a jar becoming a vase, a raspberry',
  '   becoming a pastry — is the single worst failure. One place, one light, one hand.',
  '',
  '3. COHERENCE. Everything on screen belongs to THIS business. No prop, fruit or',
  '   accessory appearing from nowhere. If the viewer cannot name the trade from any',
  '   single frame, the beat is wrong.',
  '',
  '4. MOTION. Every beat carries REAL movement — the camera travels, or the subject',
  '   acts. Never a still photograph drifting across the frame: a slideshow scores zero.',
  '   One clear move per beat: push-in, rack focus onto the hands, pan following the',
  '   gesture, slow pull-back on the finished result.',
  '',
  '5. FLOW. The beats follow each other: the same scene progressing, a gesture that',
  '   starts and FINISHES, before becoming after. Never cut mid-gesture — land the',
  '   final beat on the completed result, held for a moment.',
  '',
  '6. REALISM. Shot by a person on a real camera. Handheld micro-movement, one',
  '   identifiable light source, imperfect framing. Any plastic, waxy or synthetically',
  '   perfect look is rejected outright.',
  '',
  'NO on-screen text, in any language. No presenter addressing the camera.',
].join('\n');
