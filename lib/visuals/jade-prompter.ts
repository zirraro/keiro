/**
 * Shared "Jade-grade" visual prompt pipeline.
 *
 * Jade's content agent built up a detailed Seedream prompt system over
 * months — brand-identity guide, quality standards, thumbnail rules,
 * negative prompt. The user wants that same expertise reused everywhere
 * else in KeiroAI where visuals get generated:
 *   - /generate (free public generator)
 *   - /studio (paid edit surface)
 *   - /gallery visual regeneration
 *   - /api/seedream/* direct endpoints
 * When the client uploads an image into any of those surfaces, Jade's
 * image-to-image pipeline should lift it just like it does for her own
 * daily posts.
 *
 * Callers get two functions:
 *   generateJadeImage(visualBrief, format)                   — text-to-image
 *   generateJadeImageFromReference(url, visualBrief, format) — image-to-image
 *
 * Both return a permanent Supabase-hosted URL (or Seedream temp URL on
 * cache failure), or null on hard failure.
 */

import Anthropic from '@anthropic-ai/sdk';

const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

export const JADE_STYLE_GUIDE = `You are an elite prompt engineer for Seedream (text-to-image AI).
Your goal: create premium, brand-consistent visuals for KeiroAI clients (local businesses on social media).

BRAND / VISUAL PRINCIPLES:
- Studio-quality lighting (soft, directional, no harsh shadows)
- Clean compositions with a clear focal point and negative space
- Modern colour grading (slightly desaturated, filmic)
- 4K detail level, sharp focus on subject, depth of field when it serves the story
- Magazine-quality atmosphere (Vogue, Apple, Nike benchmark)
- Respect the client's brand colours and tone when mentioned in the brief

FOR SOCIAL THUMBNAILS:
- Readable at 100×100 px thumbnail size
- Strong contrast between subject and background
- Single clear focal point (no clutter)
- Bold colour blocks rather than dense textures

ABSOLUTELY FORBIDDEN:
- Any text, letters, numbers, signs, watermarks, logos
- Smartphones, phones, tablets, screens, mockups, UI
- Hex color codes — use colour names (deep violet, soft amber…)
- Generic stock-photo feel`;

const NEGATIVE_PROMPT = 'text, words, letters, numbers, writing, typography, signs, labels, captions, watermarks, logos, headlines, slogans, brand names, price tags, menus, screens with text, readable characters, digits';
const NO_TEXT_SUFFIX = '\nCRITICAL: Absolutely NO text, NO letters, NO words, NO numbers, NO writing, NO signs, NO labels, NO watermarks, NO logos, NO digits, NO characters, NO typography anywhere in the image. The image must contain ZERO readable text or number-like shapes. Pure photographic visual only.';

function claude() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  return new Anthropic({ apiKey: key });
}

async function callClaude(params: { system: string; message: string; maxTokens?: number }): Promise<string> {
  const response = await claude().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: params.maxTokens ?? 400,
    system: params.system,
    messages: [{ role: 'user', content: params.message }],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

function sizeFor(format: string): { width: number; height: number } {
  if (format === 'story' || format === 'reel' || format === 'video') return { width: 1440, height: 2560 };
  if (format === 'text' || format === 'linkedin') return { width: 2560, height: 1440 };
  return { width: 1920, height: 1920 };
}

function formatBriefForClaude(format: string): string {
  switch (format) {
    case 'carrousel':
    case 'post':
      return 'Square (1:1) Instagram grid thumbnail. Magazine-level composition.';
    case 'story':
      return 'Vertical 9:16 story. Striking premium composition, dramatic lighting. This is the FIRST thing people see — it must stop the scroll.';
    case 'reel':
    case 'video':
      return 'Vertical 9:16 video thumbnail. Bold, cinematic feel.';
    case 'linkedin':
    case 'text':
      return 'Horizontal 16:9 LinkedIn format, professional and corporate-friendly.';
    default:
      return 'Square 1:1 premium social visual.';
  }
}

async function optimiseBrief(visualBrief: string, format: string): Promise<string> {
  const optimized = await callClaude({
    system: JADE_STYLE_GUIDE,
    message: `Create a PREMIUM visual prompt for a ${format} post.\n\nVisual brief: ${visualBrief}\n\nFormat context: ${formatBriefForClaude(format)}\n\nIMPORTANT: Do NOT include hex color codes, aspect ratios, numbers, or technical specs. Describe colors by name. Output a PURE VISUAL DESCRIPTION. Think Vogue / Apple / Nike quality — never generic.`,
  });
  return (optimized || visualBrief) + NO_TEXT_SUFFIX;
}

/**
 * Video-specific Jade prompt. Used by /api/seedream/t2v, /api/seedream/i2v,
 * and any other video generation surface. The style guide is the same
 * but we inject video-specific guidance: camera movement, rhythm,
 * lighting shifts, subject behaviour.
 *
 * Exposed so callers can fetch the optimised prompt then submit it to
 * whichever video API they use (Seedance, Kling, etc.).
 */
export async function optimiseJadeVideoPrompt(
  videoBrief: string,
  opts: { aspectRatio?: string; duration?: number; hasReferenceImage?: boolean } = {},
): Promise<string> {
  try {
    const optimized = await callClaude({
      system: JADE_STYLE_GUIDE + `

VIDEO-SPECIFIC GUIDANCE:
- Describe camera movement explicitly (slow dolly-in, handheld, static lock-off, top-down reveal…)
- Describe lighting evolution if relevant (natural daylight, golden hour spill, neon glow)
- Describe subject behaviour (pouring, kneading, arranging, gesturing) — action beats state
- Keep the opening frame strong enough to work as a thumbnail in social feeds
- Duration ${opts.duration || 5}s — match pacing to duration (faster cuts for short, slower for long)
- Aspect ratio ${opts.aspectRatio || '9:16'} — stage composition accordingly
- ${opts.hasReferenceImage ? 'This is IMAGE-TO-VIDEO — keep subject + space recognisable, animate the existing scene naturally.' : 'This is TEXT-TO-VIDEO — no reference, invent a premium scene from scratch.'}

OUTPUT: the final video prompt, ready to be sent to the generation API. No intro, no explanation.`,
      message: `Brief: ${videoBrief}\n\nWrite the optimised video prompt.`,
      maxTokens: 450,
    });
    return (optimized || videoBrief) + NO_TEXT_SUFFIX;
  } catch {
    return videoBrief + NO_TEXT_SUFFIX;
  }
}

async function optimiseI2iBrief(visualBrief: string, format: string): Promise<string> {
  const optimized = await callClaude({
    system: JADE_STYLE_GUIDE + `

CRITICAL: You are writing an IMAGE-TO-IMAGE enhancement prompt. The reference image is the CLIENT'S REAL photo of their space / product / moment — it is the FOUNDATION of the final image, not just a hint. Your job is to describe how to POLISH and MASTER the existing photo while keeping every identifiable element (same venue, same subjects, same products, same layout, same objects on the table…) intact.

You may add:
  - editorial lighting (natural golden-hour warmth, soft key light, cinematic fill)
  - cleaner composition (crop guidance if needed, negative space rebalance)
  - brand-aligned palette grading (shift saturation or warmth toward the brand colours)
  - magazine-quality atmosphere (shallow depth of field, subtle colour grading)
  - small tasteful additions that fit naturally (steam on a hot dish, soft bokeh background, natural elements)

You MUST NOT:
  - change the building, room, or type of venue
  - replace or remove the main subject
  - invent people, products or decor that aren't in the original
  - push it so far that the venue is unrecognisable

When the brief hints at a trend / news angle, weave that mood in subtly (lighting, small styling touches) without introducing new elements that contradict the base photo.`,
    message: `Write the image-to-image enhancement prompt.\n\nBrief: ${visualBrief}\n\nFormat: ${format}\n\nReturn just the prompt, no intro.`,
    maxTokens: 300,
  });
  return (optimized || visualBrief) + NO_TEXT_SUFFIX;
}

async function cacheImageToStorage(sourceUrl: string, postId: string): Promise<string | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return null;
    const res = await fetch(sourceUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceKey);
    const path = `generated/${postId}.jpeg`;
    const { error } = await admin.storage
      .from('business-assets')
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    const { data } = admin.storage.from('business-assets').getPublicUrl(path);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

/**
 * Standard text-to-image with Jade's prompt pipeline.
 */
export async function generateJadeImage(
  visualBrief: string,
  format: string = 'post',
): Promise<string | null> {
  try {
    const prompt = (await optimiseBrief(visualBrief, format)).slice(0, 2000);
    const { width, height } = sizeFor(format);

    const res = await fetch(SEEDREAM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SEEDREAM_API_KEY}` },
      body: JSON.stringify({
        model: 'seedream-4-5-251128',
        prompt,
        negative_prompt: NEGATIVE_PROMPT,
        size: `${width}x${height}`,
        response_format: 'url',
        seed: -1,
        watermark: false,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tempUrl = data.data?.[0]?.url || null;
    if (!tempUrl) return null;
    const permanent = await cacheImageToStorage(tempUrl, `jade-gen-${Date.now()}`);
    return permanent || tempUrl;
  } catch {
    return null;
  }
}

/**
 * Image-to-image lift with Jade's prompt pipeline. Reference image is
 * used as the BASE (the client's real photo IS the foundation); prompt
 * describes the desired editorial polish to add on top.
 *
 * strength: 0.3 default — we want the client's content preserved and
 * just lifted (editorial lighting, cleaner composition, on-brand
 * palette, tiny styling additions). Higher strengths drift toward
 * "different scene" which defeats the purpose.
 */
export async function generateJadeImageFromReference(
  referenceImageUrl: string,
  visualBrief: string,
  format: string = 'post',
  strength: number = 0.3,
): Promise<string | null> {
  try {
    const prompt = (await optimiseI2iBrief(visualBrief, format)).slice(0, 1500);
    const { width, height } = sizeFor(format);

    const res = await fetch(SEEDREAM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SEEDREAM_API_KEY}` },
      body: JSON.stringify({
        model: 'seedream-4-5-251128',
        prompt,
        image: referenceImageUrl,
        image_strength: strength,
        strength,
        negative_prompt: NEGATIVE_PROMPT + ', different building, different room, different venue',
        size: `${width}x${height}`,
        response_format: 'url',
        seed: -1,
        watermark: false,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tempUrl = data.data?.[0]?.url || null;
    if (!tempUrl) return null;
    const permanent = await cacheImageToStorage(tempUrl, `jade-i2i-${Date.now()}`);
    return permanent || tempUrl;
  } catch {
    return null;
  }
}
