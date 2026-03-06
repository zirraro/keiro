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
 */
export async function decomposePromptIntoScenes(
  prompt: string,
  targetDuration: number,
  options?: {
    aspectRatio?: string;
    style?: string;
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

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const systemPrompt = `Tu es un réalisateur vidéo expert. Tu décomposes une description de vidéo en ${numScenes} scènes séquentielles.

RÈGLES IMPORTANTES :
- Chaque scène doit être une CONTINUATION NATURELLE de la précédente (même lieu, même sujet, mouvement de caméra qui suit)
- Les scènes doivent former une histoire visuelle cohérente et fluide
- Chaque prompt de scène doit être une description visuelle pure (pas de texte, pas de dialogue)
- Commence par un plan large/d'ensemble, puis zoom progressivement sur les détails
- Utilise des transitions naturelles : panoramique, travelling, zoom lent
- Chaque prompt doit faire 1-3 phrases maximum
- Les prompts doivent être en ANGLAIS (les modèles de génération vidéo fonctionnent mieux en anglais)
${options?.aspectRatio ? `- Format vidéo : ${options.aspectRatio}` : ''}
${options?.style ? `- Style visuel : ${options.style}` : ''}

Réponds UNIQUEMENT avec un JSON array, sans explication.
Format : [{"scene": 1, "prompt": "..."}, {"scene": 2, "prompt": "..."}, ...]`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Décompose cette vidéo en ${numScenes} scènes séquentielles de ~10 secondes chacune :\n\n"${prompt}"`,
    }],
  });

  try {
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Extract JSON from response (may be wrapped in markdown code blocks)
    let jsonStr = textContent.text.trim();
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const scenes: { scene: number; prompt: string }[] = JSON.parse(jsonStr);

    return scenes.map((scene, i) => ({
      index: i,
      duration: segments[i]?.duration || 10,
      prompt: scene.prompt,
      type: i === 0 ? 'text_to_video' as const : 'image_to_video' as const,
    }));
  } catch (error) {
    console.error('[video-scenes] Failed to parse Claude response, using fallback:', error);
    // Fallback: use the original prompt for all scenes with slight variations
    return segments.map((seg, i) => ({
      index: i,
      duration: seg.duration,
      prompt: i === 0
        ? prompt
        : `Continue the previous scene: ${prompt}. Focus on details and movement.`,
      type: i === 0 ? 'text_to_video' as const : 'image_to_video' as const,
    }));
  }
}
