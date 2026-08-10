/**
 * Image quality QA via Sonnet vision.
 *
 * Why: i2i / text-to-image sometimes returns soft, blurry, or smudged
 * frames — particularly when the source photo was already low-res or
 * the strength was too high. Without a check we publish those, and
 * the user complains "the dish is blurry".
 *
 * What this does: sends ONE image to Sonnet vision with a tight
 * prompt asking for a verdict on technical quality (blur, focus,
 * artefacts) — NOT aesthetic preferences. Returns pass/soft/hard
 * fail so the caller can regenerate before publish.
 *
 * Cost: ~€0.005 per call. We call this AFTER generation but BEFORE
 * the overlay step so a regen restarts cleanly.
 */

export type ImageQaVerdict = {
  /**
   * `indisponible` = le controle n'a PAS pu avoir lieu (credit d'API epuise,
   * service injoignable, reponse illisible). Ce n'est pas un verdict favorable.
   *
   * 2026-08-10 — Toutes les branches d'erreur de cette fonction renvoyaient
   * `pass`. Une cle sans credit produisait donc un flot ininterrompu d'images
   * « validees » sans qu'aucune n'ait ete regardee, et rien nulle part ne
   * disait que le controle etait mort. C'est le pire mode de panne : celui qui
   * ressemble au succes.
   *
   * Verifie le jour meme sur la cle de developpement : reponse 400 « credit
   * balance is too low », verdict renvoye « pass ». En production, un journal
   * du 10 aout portait deja la mention « controle vision hors service ».
   *
   * L'appelant decide quoi en faire. Regle du fondateur : on livre quand meme
   * — une panne de NOTRE cote ne suspend pas la publication d'un client — mais
   * on l'enregistre au lieu de la maquiller en succes.
   */
  verdict: 'pass' | 'soft_fail' | 'hard_fail' | 'indisponible';
  /** Pourquoi le controle n'a pas pu avoir lieu, quand c'est le cas. */
  raisonIndisponible?: string;
  // One short sentence on the most important issue, if any.
  issue?: string;
  // 0..1
  confidence?: number;
};

export async function reviewGeneratedImage(input: {
  imageUrl: string;
  visualBrief?: string;
  businessType?: string;
  clientLanguage?: string;       // 2026-06-08 — foreign-script text rejection
  textAllowed?: boolean;         // when true (text-overlay variant), don't penalize Latin text
}): Promise<ImageQaVerdict> {
  // ── Le repli existait, ce contrôle-ci ne l'utilisait pas ──
  //
  // 2026-08-10, le fondateur : « tu peux passer par Gemini, évidemment, on est
  // censé avoir mis le repli. » Il avait raison : `jugerAvecVision` enchaîne
  // Anthropic puis Gemini depuis des semaines, avec coupe-circuit sur crédit
  // épuisé et suivi du coût. Ce module-ci appelait Anthropic en direct et
  // s'arrêtait là — d'où un contrôle mort alors qu'un modèle restait
  // disponible.
  //
  // On emprunte donc la chaîne existante au lieu d'en écrire une seconde. Même
  // raison que pour les carrousels : deux implémentations d'une même chose
  // divergent toujours.
  const { jugerAvecVision, fetchImageBase64 } = await import('./post-coherence-qc');

  const image = await fetchImageBase64(input.imageUrl);
  if (!image) {
    return { verdict: 'indisponible', raisonIndisponible: 'image illisible ou trop petite' };
  }

  const clientLang = (input.clientLanguage || 'fr').toLowerCase();
  const textRule = input.textAllowed
    ? `Text in the image is ALLOWED in this case, but ONLY in ${clientLang.toUpperCase()} (Latin script). ANY Chinese / Japanese / Korean / Cyrillic / Arabic / Devanagari character = hard_fail. Gibberish broken text = hard_fail.`
    : `ANY visible text, character, letter, glyph or word in the image = HARD FAIL. Includes brand signs, menu boards, watermarks, captions, neon signs, license plates. The brief required ZERO text. Foreign-script characters (Chinese / Japanese / Korean / Cyrillic / Arabic / etc) when the client speaks ${clientLang.toUpperCase()} = INSTANT hard_fail with maximum severity.`;

  const system = `You are a senior photo editor reviewing a generated image BEFORE it ships to a client's social feed. You see ONE image and the brief that was meant to drive it.

Your single job: catch TECHNICAL quality failures that would embarrass the client. NOT aesthetic preferences.

TEXT RULE (highest priority): ${textRule}

HARD FAILS (must NOT ship):
- ⚠️ Text in the image violating the text rule above.
- ⚠️ NOT A PHOTOGRAPH. The image reads as illustration, cartoon, anime, 3D render, CGI, digital painting, vector art or a plastic "AI look" (waxy skin, glassy eyes, impossible symmetry, airbrushed surfaces, unnaturally saturated colours). The client asked for the work of a professional photographer: if a viewer scrolling their feed would not believe a camera took this, it is a hard fail. This applies unless the brief EXPLICITLY asked for an illustrated style.
- Subject blurry / out-of-focus where it should be sharp (the dish, the product, the face).
- Unreadable smudged details where the eye expects clarity.
- Severe noise / grain / artefacts (melted edges, deformed limbs, gibberish text patches).
- Wrong subject identity (the dish was supposed to be octopus, image shows pasta).

SOFT FAILS (reviewable, may still ship):
- Slight softness that's stylistic (intentional shallow depth-of-field) but borderline.
- Minor artefact in a non-focal area.
- Composition slightly off but the message lands.

PASS:
- Subject sharp, framing coherent, no embarrassing artefacts.
- ZERO visible text (or text in ${clientLang.toUpperCase()} when allowed by the brief).
- A normal client looking at this would not say "this is blurry" or "this looks AI-broken".

Answer by calling the rendre_verdict tool. Set has_text to true if ANY text is visible, and text_language to the script you detected ('none' when there is no text).`;

  /**
   * Schéma imposé au modèle. Un outil structuré plutôt qu'un JSON demandé en
   * prose : c'est ce que `jugerAvecVision` sait faire des deux côtés de la
   * chaîne, et ça supprime l'analyse d'une réponse libre — la branche qui
   * renvoyait « conforme » quand le texte était illisible.
   */
  const outil = {
    name: 'rendre_verdict',
    description: 'Rend le verdict technique sur l image generee.',
    input_schema: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['pass', 'soft_fail', 'hard_fail'] },
        issue: { type: 'string', description: 'One short sentence on the worst issue, empty if none.' },
        confidence: { type: 'number' },
        has_text: { type: 'boolean' },
        text_language: { type: 'string' },
      },
      required: ['verdict', 'has_text'],
    },
  };

  const parsed = await jugerAvecVision({
    system,
    tool: outil,
    imageBase64: image.data,
    mediaType: image.mediaType,
    texte: `Brief: ${input.visualBrief || 'unknown'}
Business: ${input.businessType || 'unknown'}
Review this image for technical quality.`,
    maxTokens: 300,
  });

  // `null` = AUCUN des deux modèles n'a répondu. Ce n'est pas un verdict
  // favorable, et c'est toute la différence avec la version précédente, qui
  // renvoyait « conforme » dans ce cas et laissait passer des images que
  // personne n'avait regardées.
  if (!parsed) {
    return { verdict: 'indisponible', raisonIndisponible: 'aucun modèle de vision disponible' };
  }

  let verdict: 'pass' | 'soft_fail' | 'hard_fail' =
    ['pass', 'soft_fail', 'hard_fail'].includes(parsed.verdict) ? parsed.verdict : 'pass';
  let issue = typeof parsed.issue === 'string' ? parsed.issue.substring(0, 240) : undefined;

  // ── Défense en profondeur : le motif prime sur le verdict ──
  //
  // 2026-08-10, constaté sur un échantillon réel de 12 posts : le modèle écrit
  // « The image is clearly an illustration, not a photograph, which violates
  // the brief » — et rend le verdict « pass ». Deux fois sur douze. Il voit
  // juste et conclut faux.
  //
  // On ne peut pas se contenter de reformuler la consigne : un modèle qui se
  // contredit se contredira encore. On lit donc ce qu'il a ÉCRIT, et un motif
  // qui décrit un rendu non photographique impose le refus, quel que soit le
  // verdict annoncé. Même principe que la défense sur les écritures étrangères
  // juste en dessous, qui existe depuis juin pour la même raison.
  //
  // Bornes de mot obligatoires : « car » se trouve dans « cartoon », et cette
  // erreur-là a déjà coûté un faux diagnostic dans le contrôle des carrousels.
  const MOTIF_NON_PHOTO = /(^|[^a-z])(illustration|illustrated|cartoon|cartoonish|anime|animated|3d|cgi|render|rendered|rendering|digital painting|vector|drawing|sketch|not a photograph|not photographic|artificial look|ai look|plastic look)([^a-z]|$)/i;
  if (verdict !== 'hard_fail' && issue && MOTIF_NON_PHOTO.test(issue)) {
    verdict = 'hard_fail';
    issue = `Rendu non photographique — ${issue}`;
  }

  // 2026-06-08 — Défense en profondeur sur les écritures étrangères. Même si le
  // modèle a noté « pass », tout texte non latin chez un client de langue
  // latine est un refus. Règle du fondateur : « 0 texte c'est 0, sauf si
  // cohérent et dans la langue du client ».
  const latinLangs = new Set(['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'no']);
  if (parsed.has_text === true && latinLangs.has(clientLang)) {
    const detectedScript = (parsed.text_language || '').toLowerCase();
    const foreignScripts = ['chinese', 'japanese', 'korean', 'hanzi', 'kanji', 'hiragana', 'katakana', 'hangul', 'cyrillic', 'arabic', 'devanagari', 'thai', 'hebrew', 'greek'];
    const isForeignScript = foreignScripts.some((s) => detectedScript.includes(s));
    const isGibberish = /gibberish|broken|garbled|random/.test(detectedScript);
    const textNotAllowed = !input.textAllowed;

    // Le modèle se contredit parfois : has_text à vrai, et une écriture
    // détectée « none ». Observé le 2026-08-10 sur un post rapatrié, refusé
    // pour « Visible text detected (none) » — une phrase qui ne veut rien dire.
    // Refuser sur cette base, c'est jeter une image correcte et en repayer une
    // autre. On retient au lieu de refuser : le post part, et le doute est
    // consigné.
    const seContredit = !detectedScript || detectedScript === 'none';

    if (isForeignScript || isGibberish) {
      verdict = 'hard_fail';
      issue = `Foreign-script text detected (${detectedScript}) — reject for ${clientLang.toUpperCase()} client`;
    } else if (textNotAllowed && !seContredit) {
      verdict = 'hard_fail';
      issue = `Visible text detected (${detectedScript}) — brief required ZERO text`;
    } else if (textNotAllowed && seContredit && verdict === 'pass') {
      verdict = 'soft_fail';
      issue = issue || 'texte peut-être visible, écriture non identifiée — à vérifier';
    }
  }

  return {
    verdict,
    issue,
    confidence: Number.isFinite(parsed.confidence) ? parsed.confidence : undefined,
  };
}
