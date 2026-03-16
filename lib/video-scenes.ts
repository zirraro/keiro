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

  const systemPrompt = `You are a world-class cinematographer directing a ${numScenes}-segment cinematic video. Each segment is generated INDEPENDENTLY by AI — they have NO memory of each other. The ONLY way to achieve seamless transitions is to EMBED identical visual DNA into every single prompt.

═══ THE #1 RULE: VISUAL DNA ═══
Before writing any scene, define a "Visual DNA" — a VERBATIM phrase (15-25 words) that appears IDENTICALLY in ALL ${numScenes} scenes. This phrase locks the setting, lighting, color palette, and atmosphere.

Example Visual DNA: "warm brick-walled artisan bakery, golden hour amber light streaming through tall windows, warm honey tones, soft bokeh"

This EXACT phrase must appear word-for-word in every scene. This is what creates the illusion of one continuous video.

═══ SCENE CONSTRUCTION ═══
Each scene prompt = [CAMERA MOVEMENT] + [VISUAL DNA verbatim] + [UNIQUE ACTION/SUBJECT for this scene]
- 120-180 characters per scene
- Camera movements must FLOW naturally: wide → medium → close-up → wide pullback
- Each scene's unique action should feel like the NEXT MOMENT in time, not a different location
- Movement direction consistency: if scene 1 pans left, scene 2 should continue leftward or track forward

═══ CAMERA FLOW BLUEPRINT ═══
Scene 1: SLOW WIDE establishing shot — gentle crane descent or dolly in, reveals the full environment
${numScenes >= 3 ? 'Scene 2: MEDIUM tracking shot — camera glides closer, focusing on hands/products/activity, same direction of movement' : ''}
${numScenes >= 3 ? 'Scene 3: MACRO close-up — shallow depth of field, hero detail in extreme proximity, slow motion textures' : ''}
${numScenes >= 4 ? 'Scene 4+: Alternate medium/close, always SAME setting, focus on different textures, craftmanship details, or a new angle of the same space' : ''}
Last scene: SLOW WIDE pullback — same setting seen from a new angle, gentle movement, atmospheric closing with depth

═══ TRANSITION TECHNIQUE ═══
To make cuts invisible between independently-generated segments:
- END each scene at a "natural pause" (hands resting, steam rising, object settling)
- START each scene from a similar "energy level" as the previous scene's end
- Keep the same focal depth feeling: if scene 2 ends in close-up, scene 3 should start close-up before pulling out
- Use CONSISTENT motion speed across all scenes (all slow, or all medium — never mix fast and slow)

═══ ABSOLUTE PROHIBITIONS ═══
- NEVER mention text, words, letters, numbers, signs, logos, watermarks, titles, or any written content
- NEVER include human faces in close-up (AI faces look fake) — use hands, silhouettes, over-shoulder, wide shots
- NEVER change location between scenes — it's the SAME room/space throughout
- NEVER use abrupt camera movements (fast zoom, whip pan) — everything is fluid and cinematic

═══ NEWS × BUSINESS FUSION ═══
If the brief mentions a news topic + business type: FUSE them into the environment itself.
The business space should be DECORATED with subtle references to the news theme.
Bad: "football stadium" then "bakery" (jarring cut between worlds)
Good: "bakery with cycling-themed decorations, Tour de France colors woven into the display, same warm amber light"

═══ HUMAN DIVERSITY ═══
If showing people: specify distinct age (20s/40s/60s), ethnicity (Black/White/Asian/Arab/mixed), unique clothing. Never say "group of people" without individual descriptions.

Style: ${renderMode}, ${characters}, mood ${mood}, ${style}

OUTPUT: JSON array of ${numScenes} strings, in ENGLISH. Each string contains the EXACT same Visual DNA phrase + unique scene action.

Example for 3 scenes (30s bakery video):
["Slow crane descent revealing warm brick-walled artisan bakery, golden hour amber light streaming through tall windows, warm honey tones, soft bokeh, rows of fresh baguettes and pastries filling wooden shelves, flour particles floating in the light",
"Smooth tracking shot through warm brick-walled artisan bakery, golden hour amber light streaming through tall windows, warm honey tones, soft bokeh, baker's flour-dusted hands gently shaping croissant dough on marble counter, shallow depth of field",
"Gentle macro dolly in inside warm brick-walled artisan bakery, golden hour amber light streaming through tall windows, warm honey tones, soft bokeh, golden flaky croissant glistening on rustic wooden board, steam curling upward in slow motion"]`;

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
