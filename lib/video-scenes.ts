import Anthropic from '@anthropic-ai/sdk';
import { fetchNewsContext, analyzeTrendForVisuals } from '@/lib/prompt-optimizer';

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
    newsUrl?: string;
    newsTitle?: string;
    newsDescription?: string;
    businessType?: string;
    businessDescription?: string;
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

  // Deep trend analysis if news context provided
  let enrichedPrompt = prompt;
  if (options?.newsUrl && options?.newsTitle && options?.businessType) {
    try {
      const articleContent = await fetchNewsContext(options.newsUrl, options.newsTitle);
      const analysis = await analyzeTrendForVisuals(
        options.newsTitle, options.newsDescription || '', articleContent,
        options.businessType, options.businessDescription
      );
      if (analysis) {
        enrichedPrompt = `${prompt}\n\nDEEP TREND ANALYSIS (use for stronger business-news visual link):\n${analysis}`;
        console.log('[video-scenes] Enriched prompt with trend analysis');
      }
    } catch (err) {
      console.warn('[video-scenes] Trend analysis failed, continuing with original prompt');
    }
  }

  try {
    const scenePrompts = await generateShortScenePrompts(enrichedPrompt, segments, options);

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
1. Each scene: 100-180 characters max. Rich visual description only.
2. NEVER mention text, words, letters, signs, logos, watermarks, titles, captions, or any written content. The AI generates ugly gibberish if you mention any text-related concept.
3. Format: [camera movement] + [SETTING anchor] + [lighting] + [specific subject/action with details]
4. If brief has NEWS + BUSINESS: every scene must VISUALLY FUSE both — not separately, but intertwined. The business environment incorporates visual elements of the news.
5. HUMAN DIVERSITY: each person described must be UNIQUE — specify distinct age (20s/40s/60s), ethnicity (Black/White/Asian/Arab/mixed), hair style, clothing. Never use "group of people" without detailing individuals.
6. PREFER showing hands, products, silhouettes, over-the-shoulder views, wide shots. AVOID close-up face shots — AI faces look artificial.

SEAMLESS CONTINUITY:
Repeat a "visual anchor" in EVERY scene (exact same words):
- SAME setting (e.g., "warm brick-walled restaurant" repeated verbatim)
- SAME lighting (e.g., "golden hour amber light" repeated verbatim)
- SAME color palette (e.g., "warm amber tones" repeated verbatim)

NEWS × BUSINESS FUSION (if applicable):
Don't show news and business separately. FUSE them visually:
- Bad: "football stadium" then "bakery" (two separate worlds)
- Good: "bakery window with cycling decorations, croissants on a peloton-themed display, golden hour warm light"
The business ENVIRONMENT should be decorated with, inspired by, or connected to the news topic.

SCENE FLOW for ${numScenes} scenes:
- Scene 1: Slow wide establishing — full environment showing the news-business fusion, gentle camera movement
${numScenes >= 3 ? '- Scene 2: Medium tracking — same setting, hands working on products, details that echo the news theme' : ''}
${numScenes >= 3 ? '- Scene 3: Macro close-up — same setting, hero product in extreme detail, shallow depth of field, slow motion' : ''}
${numScenes >= 4 ? '- Additional: alternate medium/close-up, always same setting, focus on textures and craftmanship' : ''}
- Last scene: Wide pullback, same setting, slow motion, warm closing atmosphere

Style: ${renderMode}, ${characters}, mood ${mood}, ${style}

OUTPUT: JSON array of strings, one per scene, in ENGLISH.
Example for 3 scenes (30s video, "bakery" business + "Tour de France" news):
["Slow crane descent into charming Parisian bakery, golden hour amber light through bay windows, yellow cycling jerseys displayed alongside fresh baguettes, vintage bicycle wheel hanging as decoration, anamorphic lens flare",
"Smooth tracking shot of baker's flour-dusted hands in same charming bakery, golden hour amber light, shaping croissants on marble counter, a small cycling figurine on the shelf behind, warm amber tones, shallow depth of field",
"Gentle macro dolly in on golden flaky croissant in same charming bakery, golden hour amber light, a tiny Tour de France flag tucked beside it on rustic wooden board, steam rising in slow motion, film grain"]`;

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
