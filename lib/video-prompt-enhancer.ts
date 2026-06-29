import Anthropic from '@anthropic-ai/sdk';

interface VideoPromptOptions {
  duration: number;
  aspectRatio?: string;
  renderStyle?: string;
  characterStyle?: string;
  tone?: string;
  visualStyle?: string;
}

/**
 * Enhance a raw business/description prompt with cinematic video directives.
 * Adds camera movements, motion, transitions, pacing appropriate for the duration.
 */
export async function enhanceVideoPrompt(
  basePrompt: string,
  options: VideoPromptOptions
): Promise<string> {
  const { duration, renderStyle, tone, visualStyle } = options;

  // Determine pacing based on duration
  let pacingGuide: string;
  if (duration <= 10) {
    pacingGuide = 'FAST PACING: Impactful, punchy, every second counts. One powerful camera move. Immediate visual impact.';
  } else if (duration <= 30) {
    pacingGuide = 'MEDIUM PACING: Build-up then payoff. 2-3 distinct camera movements. Start wide, move in. Progressive reveal.';
  } else if (duration <= 60) {
    pacingGuide = 'NARRATIVE PACING: Tell a visual story. Alternating wide and close shots. Emotional arc. Slow reveals with detail shots.';
  } else {
    pacingGuide = 'CINEMATIC PACING: Full story arc. Establishment, development, climax, resolution. Varied camera movements. Breathing room between shots.';
  }

  const styleContext = [
    renderStyle === 'illustration' ? 'Stylized 3D animation' : 'Photorealistic footage',
    tone ? `Mood: ${tone}` : 'Mood: professional and engaging',
    visualStyle ? `Visual style: ${visualStyle}` : 'Visual style: cinematic',
  ].join('. ');

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `Tu es un directeur de la photographie primé, spécialiste des publicités virales et du contenu social media premium. Tu transformes des descriptions en prompts vidéo ultra-cinématiques.

RÈGLES ABSOLUES:
- Réponds EN ANGLAIS uniquement
- 4-8 phrases détaillées
- CHAQUE phrase = 1 mouvement de caméra précis + éclairage + action du sujet
- Mouvements de caméra variés : dolly in/out, tracking shot, crane up/down, steadicam follow, slow pan, whip pan, tilt, orbit, pull focus, rack focus
- Éclairage cinématique : golden hour warmth, soft diffused window light, dramatic rim lighting, neon glow, natural backlight avec lens flare
- Mouvement constant des SUJETS dans le cadre (pas de plans fixes ennuyeux)
- Profondeur de champ : utilise le bokeh, la mise au point sélective, les avant-plans flous
- DIVERSITÉ DES PERSONNES (NON-NÉGOCIABLE) : quand des personnes apparaissent, VARIE explicitement leur origine/ethnicité, âge, genre et corpulence d'une vidéo à l'autre. Décris-les comme un casting réaliste (« mid-30s afro-french woman in linen apron », « 50-year-old maghrebi shopkeeper », « young south-asian barista », etc.) — ne tombe JAMAIS sur la même silhouette « jeune femme blanche souriante » par défaut, ET ne tombe jamais non plus systématiquement sur la même origine (pas « toujours asiatique »).
- DIVERSITÉ DANS LE MÊME REEL (founder 30/06) : si plusieurs personnes apparaissent dans le même plan/reel, ce sont des INDIVIDUS DISTINCTS (visages, morphologies, âges différents) — JAMAIS deux fois la même personne dupliquée (« pas 2 fois la même femme »). Pour un groupe/des clients/une équipe dans le cadre, MÉLANGE les origines DANS LE MÊME PLAN (afro + maghrébin + européen + asiatique + latino), pas un groupe mono-ethnique. Décris chaque personnage du cadre individuellement pour forcer des visages distincts.
- AUTHENTICITÉ ANTI-IA : real skin texture with pores and micro-imperfections, authentic candid expressions caught mid-action (not posed smiles), natural f/2.0 shallow depth of field, slight 35mm film grain, real-world editorial photography vibe (Vogue Local / National Geographic / Cereal Magazine / Apartamento). EXPLICITEMENT BANNIR : porcelain plastic skin, dead/glowing eyes, perfect symmetry, deformed hands, neon glow halos, magenta/cyan saturation, stock photo look, midjourney style, CGI/3D render look, anime/cartoon.
- ${pacingGuide}
- ${styleContext}
- Si le prompt mentionne une ACTUALITÉ/NEWS : créer un lien visuel fort entre le business et cette actualité — l'ambiance, le décor, les comportements des personnages doivent refléter le contexte de l'actualité
- ABSOLUMENT ZÉRO texte, mots, lettres dans la vidéo
- Ne mets PAS de guillemets — donne directement le prompt cinématique`,
      messages: [{
        role: 'user',
        content: `Transforme cette description en prompt vidéo cinématique pour une vidéo de ${duration}s:\n\n"${basePrompt}"`,
      }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (textContent && textContent.type === 'text') {
      const enhanced = textContent.text.trim();
      // Ensure zero-text instruction is always present
      if (!enhanced.toLowerCase().includes('zero text')) {
        return `${enhanced} ABSOLUTELY ZERO text, words, letters, numbers, watermarks in the video.`;
      }
      return enhanced;
    }
  } catch (error) {
    console.error('[video-prompt-enhancer] Claude enhancement failed, using fallback:', error);
  }

  // Fallback: add basic motion directives to the raw prompt
  const motionDirectives = duration <= 10
    ? 'Smooth cinematic dolly in with shallow depth of field. Dynamic subject movement. Professional lighting.'
    : 'Opening wide establishing shot with slow crane movement. Smooth tracking shot following the action. Close-up detail shots with bokeh. Professional cinematic lighting throughout.';

  return `${basePrompt}. ${motionDirectives} ${styleContext}. ABSOLUTELY ZERO text, words, letters, numbers, watermarks in the video.`;
}
