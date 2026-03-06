import Anthropic from '@anthropic-ai/sdk';

export interface VideoScene {
  index: number;
  duration: number; // 5 or 10 seconds
  prompt: string;
  type: 'text_to_video' | 'image_to_video'; // first scene = t2v, rest = i2v
}

/**
 * Calculate the number and duration of segments needed for a target duration
 */
export function calculateSegments(targetDuration: number): { duration: number }[] {
  const segments: { duration: number }[] = [];
  let remaining = targetDuration;

  while (remaining > 0) {
    if (remaining >= 10) {
      segments.push({ duration: 10 });
      remaining -= 10;
    } else if (remaining >= 5) {
      segments.push({ duration: 5 });
      remaining -= 5;
    } else {
      // Round up small remainders to 5s
      segments.push({ duration: 5 });
      remaining = 0;
    }
  }

  return segments;
}

/**
 * Decompose a video prompt into sequential scene descriptions using Claude Haiku.
 * Each scene naturally flows from the previous one for visual continuity.
 * Style anchoring ensures consistent visual identity across all segments.
 */
export async function decomposePromptIntoScenes(
  prompt: string,
  targetDuration: number,
  options?: {
    aspectRatio?: string;
    style?: string;
    renderStyle?: string;     // 'photorealistic' or 'illustration'
    characterStyle?: string;  // 'real' or 'fiction'
    tone?: string;            // 'professional', 'fun', etc
    visualStyle?: string;     // 'cinematic', 'documentary', etc
  }
): Promise<VideoScene[]> {
  const segments = calculateSegments(targetDuration);
  const numScenes = segments.length;

  // For single segment (10s or less), no decomposition needed
  if (numScenes <= 1) {
    return [{
      index: 0,
      duration: segments[0]?.duration || 10,
      prompt: prompt,
      type: 'text_to_video',
    }];
  }

  // Build style anchor string that will be injected into EVERY scene prompt
  const styleAnchor = buildStyleAnchor(options);

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const systemPrompt = `Tu es un réalisateur vidéo expert spécialisé dans les plans-séquences fluides. Tu décomposes une description de vidéo en ${numScenes} scènes séquentielles qui forment UN SEUL PLAN CONTINU.

RÈGLES DE CONTINUITÉ VISUELLE ABSOLUES :
- Chaque scène est la SUITE DIRECTE de la précédente — comme un seul mouvement de caméra continu
- MÊME palette de couleurs, MÊME éclairage, MÊME atmosphère dans TOUTES les scènes
- La dernière image de la scène N doit pouvoir se fondre naturellement avec la première image de la scène N+1
- Utilise des transitions de caméra fluides : travelling latéral, zoom progressif, panoramique lent, dolly in/out
- JAMAIS de cut brutal, JAMAIS de changement de lieu soudain, JAMAIS de changement d'éclairage
- Les personnages/objets présents dans une scène restent visibles ou référencés dans la suivante

STYLE VISUEL À MAINTENIR DANS CHAQUE SCÈNE :
${styleAnchor || '- Style cinématique professionnel, éclairage naturel cohérent'}

STRUCTURE NARRATIVE :
- Scène 1 : Plan d'établissement large, présentation du lieu/contexte
- Scènes intermédiaires : Rapprochement progressif, détails, action
- Dernière scène : Plan de conclusion, légèrement plus large ou moment clé

CHAQUE PROMPT DE SCÈNE DOIT INCLURE :
1. Le mouvement de caméra exact (ex: "slow dolly in", "smooth pan left to right")
2. L'éclairage (ex: "warm golden hour light", "soft ambient light")
3. Ce qui est visible à l'écran (cohérent avec la scène précédente)
4. ZERO texte, mots, lettres dans la vidéo

${options?.aspectRatio ? `Format : ${options.aspectRatio}` : ''}

Réponds UNIQUEMENT avec un JSON array. Chaque prompt en ANGLAIS, 2-4 phrases.
Format : [{"scene": 1, "prompt": "..."}, {"scene": 2, "prompt": "..."}, ...]`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Décompose cette vidéo de ${targetDuration}s en ${numScenes} scènes séquentielles fluides (chaque scène = ~10 secondes) :\n\n"${prompt}"\n\nRappel : chaque prompt doit inclure le mouvement de caméra, l'éclairage, et maintenir la continuité visuelle parfaite.`,
    }],
  });

  try {
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    let jsonStr = textContent.text.trim();
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const scenes: { scene: number; prompt: string }[] = JSON.parse(jsonStr);

    // Inject style anchor into each scene prompt for consistency
    return scenes.map((scene, i) => ({
      index: i,
      duration: segments[i]?.duration || 10,
      prompt: styleAnchor
        ? `${scene.prompt} ${styleAnchor} ABSOLUTELY ZERO text, words, letters, numbers, watermarks.`
        : `${scene.prompt} ABSOLUTELY ZERO text, words, letters, numbers, watermarks.`,
      type: i === 0 ? 'text_to_video' as const : 'image_to_video' as const,
    }));
  } catch (error) {
    console.error('[video-scenes] Failed to parse Claude response, using enhanced fallback:', error);
    // Enhanced fallback with style-anchored prompts
    return segments.map((seg, i) => ({
      index: i,
      duration: seg.duration,
      prompt: i === 0
        ? prompt
        : `Seamless continuation of the previous shot. ${styleAnchor || 'Maintain identical lighting, color palette, and atmosphere.'} Smooth camera movement transitioning naturally from the previous frame. ${prompt} ABSOLUTELY ZERO text, words, letters, watermarks.`,
      type: i === 0 ? 'text_to_video' as const : 'image_to_video' as const,
    }));
  }
}

/**
 * Build a style anchor string from options to inject into every scene prompt.
 * This ensures consistent visual identity across segments.
 */
function buildStyleAnchor(options?: {
  renderStyle?: string;
  characterStyle?: string;
  tone?: string;
  visualStyle?: string;
  style?: string;
}): string {
  if (!options) return '';

  const parts: string[] = [];

  if (options.renderStyle === 'illustration') {
    parts.push('Stylized 3D illustration, digital art, colorful animated style');
  } else if (options.renderStyle) {
    parts.push('PHOTOREALISTIC footage, real camera, real textures, real lighting');
  }

  if (options.characterStyle === 'fiction') {
    parts.push('animated fictional characters');
  } else if (options.characterStyle === 'real') {
    parts.push('real diverse humans');
  }

  if (options.tone) parts.push(`Mood: ${options.tone}`);
  if (options.visualStyle) parts.push(`Style: ${options.visualStyle}`);
  if (options.style) parts.push(options.style);

  return parts.length > 0 ? parts.join('. ') + '.' : '';
}
