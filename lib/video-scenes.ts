import Anthropic from '@anthropic-ai/sdk';

export interface VideoScene {
  index: number;
  duration: number; // 5 or 10 seconds
  prompt: string;
  type: 'text_to_video' | 'image_to_video';
}

/**
 * Calculate the number and duration of segments needed for a target duration.
 * Prefers 10s segments, uses 5s for remainders.
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
      segments.push({ duration: 5 });
      remaining = 0;
    }
  }

  return segments;
}

/**
 * SINGLE Claude call: analyzes the creative brief AND produces short visual scene prompts.
 * Each scene prompt is max 120 chars, purely visual (no meta-instructions).
 * Ensures strong business-news link and fluid continuity between segments.
 */
export async function decomposePromptIntoScenes(
  prompt: string,
  targetDuration: number,
  options?: {
    aspectRatio?: string;
    style?: string;
    renderStyle?: string;
    characterStyle?: string;
    tone?: string;
    visualStyle?: string;
  }
): Promise<VideoScene[]> {
  const segments = calculateSegments(targetDuration);
  const numScenes = segments.length;

  // For single segment (10s or less), no decomposition needed
  if (numScenes <= 1) {
    // Still enhance the single prompt via Claude
    try {
      const shortPrompt = await generateShortScenePrompts(prompt, [segments[0]], options);
      return [{
        index: 0,
        duration: segments[0]?.duration || 10,
        prompt: shortPrompt[0] || prompt.substring(0, 200),
        type: 'text_to_video',
      }];
    } catch {
      return [{
        index: 0,
        duration: segments[0]?.duration || 10,
        prompt: prompt.substring(0, 200),
        type: 'text_to_video',
      }];
    }
  }

  try {
    const scenePrompts = await generateShortScenePrompts(prompt, segments, options);

    // Validate we got enough scenes
    const scenes: VideoScene[] = scenePrompts.map((p, i) => ({
      index: i,
      duration: segments[i]?.duration || 10,
      prompt: p,
      type: 'text_to_video' as const,
    }));

    // Pad if Claude returned fewer scenes than expected
    while (scenes.length < numScenes) {
      const idx = scenes.length;
      const lastPrompt = scenes[scenes.length - 1].prompt;
      scenes.push({
        index: idx,
        duration: segments[idx].duration,
        prompt: lastPrompt.replace(/^[A-Z][a-z]+\s/, 'Continuing '),
        type: 'text_to_video',
      });
    }

    return scenes;
  } catch (error) {
    console.error('[video-scenes] Claude scene generation failed, using fallback:', error);
    return buildFallbackScenes(prompt, segments, options);
  }
}

/**
 * Core: Single Claude call that reads the full creative brief and outputs
 * SHORT, purely visual scene descriptions for Seedance.
 */
async function generateShortScenePrompts(
  briefPrompt: string,
  segments: { duration: number }[],
  options?: {
    aspectRatio?: string;
    renderStyle?: string;
    characterStyle?: string;
    tone?: string;
    visualStyle?: string;
  }
): Promise<string[]> {
  const numScenes = segments.length;
  const renderMode = options?.renderStyle === 'illustration'
    ? 'stylized 3D animation, digital art'
    : 'photorealistic cinematic footage';
  const characters = options?.characterStyle === 'fiction'
    ? 'animated fictional characters'
    : 'real diverse humans';
  const mood = options?.tone || 'professional';
  const style = options?.visualStyle || 'cinematic';

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const systemPrompt = `You are an elite cinematographer creating a ${numScenes}-segment video. Each segment is generated INDEPENDENTLY by AI, so visual continuity must be EMBEDDED in every prompt.

CRITICAL RULES:
1. Each scene: 80-150 characters max. Pure visual description only.
2. NEVER include instructions like "no text", "zero watermarks". Only describe what IS visible.
3. Format: [camera] + [SETTING anchor] + [lighting] + [subject/action]
4. If brief has NEWS + BUSINESS: every scene must VISUALLY connect both.

SEAMLESS CONTINUITY (most important):
Since segments are generated separately, you MUST repeat a "visual anchor" in EVERY scene:
- SAME setting description (e.g., "warm brick-walled restaurant" in every scene)
- SAME lighting keywords (e.g., "golden hour warm light" in every scene)
- SAME color palette keywords (e.g., "warm amber tones" in every scene)
- SAME subject/character description if people are present
- Camera movements should feel progressive: wide → medium → close → wide

SCENE FLOW for ${numScenes} scenes:
- Scene 1: Wide establishing — introduce full environment, slow movement
${numScenes >= 3 ? '- Scene 2: Medium shot — same setting, closer on people/action/products' : ''}
${numScenes >= 3 ? '- Scene 3: Close-up hero shot — same setting, detail on key element, gentle slow motion' : ''}
${numScenes >= 4 ? '- Additional scenes: alternate between medium and close-up, always same setting' : ''}
- Last scene: should feel like a natural ending (slow motion, gentle fade feeling)

Style: ${renderMode}, ${characters}, mood ${mood}, ${style}

OUTPUT: JSON array of strings, one per scene, in ENGLISH.
Example for 3 scenes (30s video, restaurant + rugby theme):
["Slow crane descent into warm brick-walled Italian restaurant, golden hour amber light through arched windows, rugby pennants hanging from wooden beams, diverse customers at candlelit tables",
"Smooth tracking shot through same warm brick-walled restaurant, golden hour amber light, close on diverse group of friends raising wine glasses and cheering, rugby match glowing on wall TV behind them",
"Gentle dolly in to chef in same warm brick-walled restaurant, golden hour amber light, presenting steaming pasta on rustic plate, shallow depth of field, soft slow motion steam rising"]`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Read this creative brief and generate ${numScenes} short visual scene descriptions (${segments.map((s, i) => `scene ${i + 1}: ${s.duration}s`).join(', ')}):\n\n${briefPrompt}`,
    }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  let jsonStr = textContent.text.trim();
  const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  const scenes: string[] = JSON.parse(jsonStr);
  console.log(`[video-scenes] Generated ${scenes.length} scene prompts:`, scenes.map((s, i) => `[${i}] ${s.length}chars "${s.substring(0, 60)}..."`));

  // Inject style suffix into each scene to enforce render mode + character type
  // This is critical: Seedance needs explicit keywords to respect the user's choice
  const renderSuffix = renderMode.includes('photorealistic')
    ? 'photorealistic, shot on cinema camera'
    : 'stylized 3D animation, colorful digital art';
  const charSuffix = characters.includes('fiction')
    ? 'animated fictional characters, cartoon style'
    : 'real humans, natural skin, realistic faces';
  const styleSuffix = `, ${renderSuffix}, ${charSuffix}`;

  return scenes.map(s => {
    const withStyle = `${s}${styleSuffix}`;
    // Keep total under 200 chars — Seedance truncates long prompts and we need room for flags
    return withStyle.length > 200 ? withStyle.substring(0, 200) : withStyle;
  });
}

/**
 * Fallback: generate basic scene prompts without Claude
 */
function buildFallbackScenes(
  prompt: string,
  segments: { duration: number }[],
  options?: { renderStyle?: string; tone?: string; visualStyle?: string }
): VideoScene[] {
  // Extract key visual elements from the prompt
  const shortPrompt = prompt.substring(0, 150).replace(/["\n]/g, ' ').trim();

  const cameraMovements = [
    'Slow crane descent into',
    'Smooth tracking shot through',
    'Dolly in close-up of',
    'Steady orbit around',
    'Gentle pan across',
    'Tilt up revealing',
  ];

  return segments.map((seg, i) => {
    const camera = cameraMovements[i % cameraMovements.length];
    const lighting = i === 0 ? 'warm golden hour light' : i === segments.length - 1 ? 'dramatic rim lighting' : 'soft ambient lighting';
    const fallbackPrompt = `${camera} ${shortPrompt}, ${lighting}, cinematic depth of field`;

    return {
      index: i,
      duration: seg.duration,
      prompt: fallbackPrompt.substring(0, 200),
      type: 'text_to_video' as const,
    };
  });
}
