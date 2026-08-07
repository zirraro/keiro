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
  'NOT: visible text artefacts, warped hands, extra fingers, mismatched reflections.',
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
