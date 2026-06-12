import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';
import { getContentSystemPrompt, getWeeklyPlanPrompt } from '@/lib/agents/content-prompt';
import { publishImageToInstagram, publishStoryToInstagram, publishCarouselToInstagram } from '@/lib/meta';
import { publishTikTokVideoViaFileUpload, initTikTokPhotoUpload, refreshTikTokToken } from '@/lib/tiktok';
import { createT2VTask, checkT2VTask } from '@/lib/kling';
import { publishReelToInstagram } from '@/lib/meta';
import { ANTI_AI_REALISM } from '@/lib/visuals/realism';
import { recordAutoPublish } from '@/lib/agents/auto-publish-cap';
import { runPublishGate, logGateVerdict } from '@/lib/agents/publish-gate';
// Ken Burns + FFmpeg removed — doesn't work on Vercel serverless
// Video pipeline now uses Seedance T2V / Kling T2V
import { completeDirective, loadContextWithAvatar } from '@/lib/agents/shared-context';
import { escalateAgentError } from '@/lib/agents/error-escalation';
import { decomposePromptIntoScenes, calculateSegments } from '@/lib/video-scenes';
import { createVideoJob } from '@/lib/video-jobs-db';
import { diagnosePublishFailure, sendPublishAlert, isTransientPublishError, nextRetryDelayMs, MAX_PUBLISH_RETRIES } from '@/lib/agents/publish-diagnostics';
import { saveLearning, saveAgentFeedback } from '@/lib/agents/learning';
import { sendPublishNotification } from '@/lib/agents/publish-notification';

// ──────────────────────────────────────
// 2026-06-03 v2 — Smart LLM router for Lena.
// - Simple captions/hashtags → Gemini (parité qualité, 3x cheaper)
// - Complex briefs (mix 2 univers, news integration, client photos remix
//   → Sonnet directs Bytedance better)
// The router lib (lib/agents/llm-router.ts) handles fallback to Sonnet
// if Gemini fails. Founder ask: keep quality where it matters.
// ──────────────────────────────────────
async function callClaude({ system, message, maxTokens = 2000 }: { system: string; message: string; maxTokens?: number }): Promise<string> {
  const { smartLlmCall, detectLenaComplexity } = await import('@/lib/agents/llm-router');
  const complexity = detectLenaComplexity(message);
  const r = await smartLlmCall({
    agent: 'lena',
    complexity,
    system,
    message,
    maxTokens,
    callTag: 'content',
  });
  return r.text;
}

export const runtime = 'nodejs';
// 2026-06-07 — Bumped 300→600s after morning_batch timeout caught in
// admin digest. The bottleneck is long video generation (Seedance up to
// 90s) + multi-chunk TikTok upload (~30-60s) + IG carousel polling
// (~20-40s). 300s was too tight when several happened in a row.
export const maxDuration = 600;

/**
 * Strip cross-platform mentions from a caption right before publish.
 * Defensive gate against (a) old posts re-launched from queue that were
 * generated before the platform-isolation prompt rule shipped, and (b)
 * LLM slip-ups despite the instruction.
 *
 * Strategy: replace platform-name mentions with neutral terms ("ici",
 * "le feed", "tes followers"). Drop algo references that reveal a
 * cross-platform discussion ("L'algo Instagram a changé" on TikTok =
 * obvious self-tell). Leaves the rest of the caption intact.
 */
// 2026-06-12 — Founder report: posts TikTok à 0 vue. Le reach TikTok dépend
// fortement des hashtags de DÉCOUVERTE (le For You les utilise pour catégoriser)
// en plus des tags de niche. On garantit un set optimisé : 1-2 tags découverte
// FR + les tags de niche du LLM, dédupliqués et capés à 6 (limite guardrail).
// Un post sous-taggé (0-2 hashtags) ou sans tag découverte = peu de portée.
function optimizeTikTokHashtags(raw: string[]): string[] {
  const clean = (raw || []).map(h => String(h).replace(/^#/, '').trim()).filter(Boolean);
  const lower = new Set(clean.map(h => h.toLowerCase()));
  const out = [...clean];
  // Discovery tags FR (signalent le For You) — ajoutés s'ils manquent.
  for (const d of ['pourtoi', 'fyp']) {
    if (!lower.has(d) && out.length < 6) { out.push(d); lower.add(d); }
  }
  // Dédup + cap 6.
  const seen = new Set<string>();
  const final: string[] = [];
  for (const h of out) {
    const k = h.toLowerCase();
    if (!seen.has(k)) { seen.add(k); final.push(h); }
    if (final.length >= 6) break;
  }
  return final;
}

function sanitizePlatformMentions(caption: string, targetPlatform: 'tiktok' | 'instagram' | 'linkedin'): string {
  if (!caption) return caption;
  let out = caption;

  // Build the list of forbidden platforms (= all except target).
  const forbidden: Record<string, RegExp[]> = {
    instagram: [
      /\binstagram\b/gi,
      /\binsta(?!nt)\b/gi,   // "insta" but not "instant"
      /\balgo\s+insta(?:gram)?\b/gi,
      /\bfeed\s+insta(?:gram)?\b/gi,
      /\bIG(?=\s|[.,!?:;]|$)/g,
      /\breels?\s+insta(?:gram)?\b/gi,
    ],
    tiktok: [
      /\btiktok\b/gi,
      /\btik[- ]?tok\b/gi,
      /\btt(?=\s|[.,!?:;]|$)/g,
      /\balgo\s+tiktok\b/gi,
    ],
    linkedin: [
      /\blinkedin\b/gi,
      /\blinkdn\b/gi,
      /\blink[- ]?in\b/gi,
    ],
    facebook: [
      /\bfacebook\b/gi,
      /\bFB(?=\s|[.,!?:;]|$)/g,
    ],
  };

  const platformsToScrub = Object.keys(forbidden).filter(p => p !== targetPlatform);
  for (const p of platformsToScrub) {
    for (const re of forbidden[p]) {
      out = out.replace(re, (match) => {
        // Pick a neutral replacement based on context
        if (/^(IG|TT|FB)$/i.test(match)) return 'ici';
        if (/algo/i.test(match)) return "l'algo";
        if (/feed/i.test(match)) return 'le feed';
        if (/reel/i.test(match)) return 'les vidéos';
        return 'ici';
      });
    }
  }

  // Clean up double-spaces left by removals
  out = out.replace(/  +/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
  return out;
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function verifyAuth(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return { authorized: true, isCron: true };
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return { authorized: false };
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    if (profile?.is_admin) return { authorized: true, isAdmin: true };
    // Allow authenticated clients to access their own content
    return { authorized: true, isClient: true, userId: user.id };
  } catch {}
  return { authorized: false };
}

// ──────────────────────────────────────
// Generate visual using KeiroAI's own Seedream API (proof of product)
// ──────────────────────────────────────
const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';
// 2026-06-03 — Strengthened anti-charabia. Founder reported: text intégré
// dans l'image était parfois du charabia (mots qui ne veulent rien dire).
// Cause: Seedream essayait de générer du texte mais ratait. Solution:
// FORCER 100% sans texte. KeiroAI ajoute le texte via overlay post-gen.
// Pour les rares cas où un mot exact est nécessaire (overlay programmé),
// le prompt passe par image-provider avec exactTextInImage param.
const NO_TEXT_SUFFIX = `

🚫 ABSOLUTE RULE — ZERO TEXT IN IMAGE:
- NO words, NO letters, NO numbers, NO writing, NO captions
- NO signs with readable text, NO labels, NO menus with text
- NO watermarks, NO logos with visible brand names
- NO typography, NO characters of any alphabet
- NO price tags, NO dates, NO street signs with text
- NO computer screens / phone screens with visible text
- NO books / newspapers with readable text

The image MUST be 100% text-free. KeiroAI adds text later via clean overlay.

If the scene naturally contains a sign/screen/menu, render it BLANK or BLURRED. NEVER attempt to generate readable text — Seedream typically produces gibberish/distorted letters that ruin the visual quality.

Pure photographic visual only. Composition focused on the SUBJECT, atmosphere, lighting, color story — NEVER on text.`;

/**
 * KEIROAI brand style guide — used ONLY for KeiroAI's own marketing
 * posts (when there is no client business context). Injects the violet
 * brand identity. NEVER use this for client-facing posts about their
 * restaurant / florist / boutique — see CLIENT_STYLE_GUIDE below.
 */
const SEEDREAM_STYLE_GUIDE_KEIROAI = `You are an elite prompt engineer for Seedream (text-to-image AI).
Your goal: create premium, brand-consistent visuals for KeiroAI (AI marketing tool for local businesses).

BRAND VISUAL IDENTITY (KeiroAI ONLY — does NOT apply to client posts):
- Primary color: deep violet — innovation, premium tech
- Secondary: soft purple, deep black, warm white
- Accent: amber for energy
- Style: clean flat design, subtle 3D elements, modern tech aesthetic
- Mood: professional yet approachable, innovative yet simple

QUALITY STANDARDS:
- Studio-quality lighting (soft, directional, no harsh shadows)
- Clean compositions with clear focal point
- Negative space for breathing room
- Modern color grading (slightly desaturated, filmic)
- 4K detail level, sharp focus on subject
- Depth of field when appropriate

ABSOLUTELY FORBIDDEN:
- Any text, letters, numbers, writing, signs, watermarks, logos
- Smartphones, phones, tablets, screens, devices, mockups, UI screenshots
- Hex color codes — use color names instead
- Aspect ratios or technical specs — describe the feeling not the format
- Cluttered compositions with too many elements
- Stock photo aesthetic (generic, lifeless)

Output ONLY the optimized English prompt — pure visual description, no technical jargon. Nothing else.`;

/**
 * CLIENT style guide — used for posts about a client's actual business
 * (their restaurant, boutique, salon, etc.). The whole point is to
 * respect THEIR palette, THEIR lighting, THEIR ambience — never inject
 * KeiroAI's violet brand identity into a client's content.
 */
const SEEDREAM_STYLE_GUIDE_CLIENT = `You are an elite prompt engineer for Seedream (image-to-image AI). You serve a local-business client (restaurant, café, boutique, salon, florist, etc.).

CRITICAL — RESPECT THE CLIENT'S OWN BRAND:
- The reference image IS the client's real space / product / dish — keep its palette, lighting, mood, materials EXACTLY as they appear.
- DO NOT inject KeiroAI brand colors. NO violet, NO purple, NO amber accents unless those colours already exist in the reference photo.
- Use natural editorial photography language: warm/cool natural light, real textures (wood, marble, stone, linen, ceramic), authentic restaurant/shop atmosphere.
- Match the reference's existing colour palette word-for-word — terracotta walls stay terracotta, marble stays marble, wood stays wood.

QUALITY STANDARDS:
- Editorial / magazine-quality lifestyle photography — REAL PHOTOGRAPH, not CGI
- Phrasing to use: "documentary photo", "natural light photograph", "shot on Leica with 35mm lens", "photographic still"
- Soft natural light matching the time of day implied by the reference
- Shallow depth of field where appropriate, NEVER aggressive macro bokeh
- Realistic textures: visible wood grain, real ceramic glaze, real fabric weave, light reflections that look photographed (not rendered)
- The frame should look like a real photo a food/travel journalist would shoot in this place — not an architectural visualization, not a 3D render, not a video game scene

ABSOLUTELY FORBIDDEN:
- Text, letters, numbers, writing, signs, watermarks, logos
- Phones, tablets, screens, mockups, UI elements
- Violet, purple, lilac, magenta, amber tinting (unless the reference photo has it)
- Studio gradients, flat-design backgrounds, isometric/3D-render aesthetics
- Stock-photo cliché props (Macbook, coffee + notebook combo, etc.)
- Saturated post-processing — keep it natural and grounded
${ANTI_AI_REALISM}
Output ONLY the optimized English prompt — pure visual description, no jargon, no markdown.`;

// Default export — keep the legacy name pointing to the KeiroAI guide
// so existing callers (text-to-image generations on KeiroAI's own
// account) keep their brand identity. Client paths explicitly use
// SEEDREAM_STYLE_GUIDE_CLIENT.
const SEEDREAM_STYLE_GUIDE = SEEDREAM_STYLE_GUIDE_KEIROAI;

/**
 * Cache a temporary Seedream URL to Supabase Storage for permanent access.
 */
async function cacheImageToStorage(tempUrl: string, postId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const imgResponse = await fetch(tempUrl);
    if (!imgResponse.ok) {
      console.error('[Content] Failed to download image for caching:', imgResponse.status);
      return null;
    }
    const buffer = await imgResponse.arrayBuffer();
    if (buffer.byteLength === 0) return null;

    const contentType = imgResponse.headers.get('content-type') || 'image/png';
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
    const fileName = `content/${postId}-${Date.now()}.${ext}`;

    const blob = new Blob([buffer], { type: contentType });
    const { error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(fileName, blob, { contentType, upsert: false });

    if (uploadError) {
      console.error('[Content] Storage upload error:', uploadError.message);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('generated-images')
      .getPublicUrl(fileName);

    console.log('[Content] Image cached to storage:', publicUrl?.substring(0, 80));
    return publicUrl || null;
  } catch (error: any) {
    console.error('[Content] Image caching failed:', error.message);
    return null;
  }
}

/**
 * Image-to-image Seedream call — takes the client's OWN uploaded photo
 * as a reference, then asks the model to re-render it with improved
 * lighting / composition / brand-aligned ambiance while keeping the
 * subject + space recognisable. This is the "pimp my real photo" mode
 * the user explicitly asked for.
 *
 * Seedream (ByteDance Ark) accepts a reference image via the `image`
 * parameter in the generations endpoint. If the API rejects the call
 * we return null so the caller can fall back to plain generation.
 *
 * strength: 0 = keep the original almost intact, 1 = fully re-imagine.
 * We default to 0.4 — enough to polish without making the venue
 * unrecognisable (a fleuriste must still look like THEIR fleuriste).
 */
async function generateVisualFromReference(
  referenceImageUrl: string,
  visualDescription: string,
  format: string,
  strength = 0.4,
  /**
   * When the client has uploaded both a dish/product AND a venue/space
   * photo, the scheduler passes BOTH here. We then i2i on the VENUE
   * (keep the client's real dining room/shop as the canvas) and put the
   * specific dish described in `dishContext` onto the table inside that
   * real space. This is the true "dish-in-venue" composition — not a
   * generic studio shot. `referenceImageUrl` in this case is the VENUE URL.
   */
  dishContext?: { file_url: string; analysis: any } | null,
): Promise<string | null> {
  try {
    const dishBlock = dishContext?.analysis ? `

DISH / PRODUCT TO COMPOSE INTO THIS VENUE:
- What is it: ${dishContext.analysis.summary || 'a signature dish'}
- Visible elements: ${(dishContext.analysis.visible_elements || []).join(', ') || 'unspecified'}
- Ambiance: ${dishContext.analysis.ambiance || 'unspecified'}
- Palette: ${(dishContext.analysis.color_palette || []).join(', ') || 'unspecified'}
- Style: ${(dishContext.analysis.style_descriptors || []).join(', ') || 'unspecified'}

COMPOSITION RULE — CRITICAL:
- The reference image is the client's REAL dining room / boutique interior. It MUST remain the dominant subject of the frame (75%+ of the image is the room itself: walls, tables, windows, ambient light).
- Place the dish / product on a DISTANT or MID-GROUND table, not the foreground. The dish takes AT MOST 15% of the frame area — like seeing a plate on a table while walking into a restaurant. The viewer's first impression is THE ROOM, then they notice the plate as one of many details.
- Camera distance: WIDE shot of the room. The plate sits at natural eating distance from another diner's POV, NOT close to the lens. NO macro photography. NO food-photography hero crop.
- Do NOT zoom into the dish. Do NOT use aggressive bokeh that erases the room. Do NOT invent new furniture. Keep the room's layout, furniture, wall colour, lighting, materials EXACTLY as shown in the reference.
- Match the reference's natural colour palette — terracotta walls stay terracotta, marble stays marble, wood stays wood. NO violet, NO purple, NO amber unless the reference photo itself contains them.
- Only the dish described above belongs in the frame — no generic food, no props that were not already in the reference room.

⛔ DISH FIDELITY — TRUTH-IN-MENU RULE ⛔
The dish you depict will be SEEN BY FUTURE CUSTOMERS who then come to the restaurant expecting that exact plate. If the photo shows what they don't get, they're disappointed and the restaurant loses trust.
- KEEP the source dish's QUANTITY: same number of pieces, same portion size, same protein-to-side ratio. If the source plate has 3 prawns, do NOT show 6. If there's one glass of wine, do NOT add two.
- KEEP the same INGREDIENTS visible. If there are radishes on top, keep radishes. Do NOT swap herbs (basil → cilantro), do NOT add ingredients that weren't there (no extra micro-greens, no decorative flowers, no sauce drizzle the chef doesn't actually do).
- KEEP the tableware count: same number of plates, glasses, cutlery in frame. Do NOT multiply.
- You CAN improve LIGHTING (warmer, softer), CAMERA ANGLE (slightly higher/lower), DEPTH OF FIELD, and the AMBIENT BACKGROUND. You CAN clean clutter. You CANNOT change WHAT IS ON THE PLATE.
- If you're unsure whether something would change quantity/ingredient identity, the answer is: keep it as the source has it.` : '';

    // Pick the right style guide. When we have a dishContext (meaning
    // we're working from a real client's dish+venue pair), use the
    // CLIENT guide that respects their natural palette. Otherwise we're
    // generating either a KeiroAI marketing visual OR a single-asset
    // i2i where the asset is the source of truth — both use the
    // KeiroAI guide as the brand baseline.
    const styleGuideForI2I = dishContext ? SEEDREAM_STYLE_GUIDE_CLIENT : SEEDREAM_STYLE_GUIDE_KEIROAI;

    const optimizedText = await callClaude({
      system: styleGuideForI2I + `\n\nIMPORTANT: You are writing an IMAGE-TO-IMAGE prompt. ${dishContext ? 'The reference image is the client\'s REAL restaurant / boutique interior — it must stay recognisable AND the room (not the dish) must be the visual subject. The dish is a tasteful accent, not the hero.' : `The reference image is the client\'s REAL photo. Re-render with: (a) better professional lighting, (b) cleaner composition, (c) magazine-quality atmosphere.

⛔ TRUTH-IN-MENU RULE — applies to ANY dish/product/item shot:
- Keep the EXACT QUANTITY shown in the source. 3 prawns stays 3 prawns. One glass stays one glass.
- Keep the SAME INGREDIENTS visible. Don't swap herbs, don't add micro-greens that aren't there, don't drizzle a sauce the chef doesn't use.
- Keep the SAME TABLEWARE COUNT. Don't multiply plates, glasses, cutlery.
- You CAN improve: lighting, depth-of-field, camera angle slightly, ambient background, clean clutter.
- You CANNOT change: what's on the plate, how much of it, the chef's presentation choices.
- A future customer will order based on this photo. If they don't get what they saw, the restaurant loses trust.
Keep the SUBJECT and SPACE recognisable — never invent new elements or change the venue type.`}${dishBlock}`,
      message: `Write the image-to-image prompt.\n\nPost brief: ${visualDescription}\n\nFormat: ${format}\n\n${dishContext ? '⛔ TRUTH-IN-MENU REMINDER: A future customer will see this image and order based on it. Preserve quantity, ingredients, plate count, glass count exactly as the source. Improve lighting/composition, never change WHAT is on the plate.\n\n' : ''}Return just the prompt, no intro, no explanation.`,
      maxTokens: dishContext ? 500 : 350,
    });

    const rawPrompt = (optimizedText || visualDescription) + NO_TEXT_SUFFIX;
    const imagePrompt = rawPrompt.length > 1500 ? rawPrompt.substring(0, 1500) : rawPrompt;

    let width = 1920;
    let height = 1920;
    if (format === 'story' || format === 'reel' || format === 'video') {
      width = 1440; height = 2560;
    } else if (format === 'text') {
      width = 2560; height = 1440;
    }

    console.log(`[Content] Seedream image-to-image (${width}x${height}, strength=${strength}) from:`, referenceImageUrl);

    const seedreamRes = await fetch(SEEDREAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'seedream-4-5-251128',
        prompt: imagePrompt,
        image: referenceImageUrl,
        image_strength: strength,
        // Some Ark variants expect `strength` instead of `image_strength`.
        // Sending both is safe — unknown fields are ignored.
        strength,
        negative_prompt: 'text, words, letters, numbers, writing, typography, signs, labels, watermarks, logos, price tags, screens with text, readable characters, digits, different building, different room, different venue, 3D render, CGI, architectural visualization, video game graphics, unreal engine, plastic look, cartoon, illustration, painting, drawing, isometric, low-poly, smooth plastic surfaces, oversaturated colors',
        size: `${width}x${height}`,
        response_format: 'url',
        seed: -1,
        watermark: false,
      }),
    });

    if (!seedreamRes.ok) {
      const errBody = await seedreamRes.text().catch(() => '');
      console.warn('[Content] Seedream i2i rejected:', seedreamRes.status, errBody.substring(0, 300));
      return null;
    }

    const data = await seedreamRes.json();
    const tempUrl = data.data?.[0]?.url || null;
    if (!tempUrl) return null;

    const postId = `i2i-${Date.now()}`;
    const permanent = await cacheImageToStorage(tempUrl, postId);
    return permanent || tempUrl;
  } catch (e: any) {
    console.warn('[Content] Seedream i2i error:', e?.message?.substring?.(0, 200));
    return null;
  }
}

async function generateVisual(visualDescription: string, format: string, userIdForReuse?: string, platformForReuse?: string): Promise<string | null> {
  try {
    // 2026-06-03 — Levier 3: visual reuse INTRA-client.
    // 30% probability d'utiliser un top performer du client (économie
    // Bytedance + renforce les visuels qui marchent). Pas de cross-client.
    if (userIdForReuse) {
      try {
        const { pickReuseOrGenerate } = await import('@/lib/visuals/visual-reuse');
        const decision = await pickReuseOrGenerate(getSupabaseAdmin(), userIdForReuse, {
          platform: platformForReuse,
          format,
        });
        if (decision.mode === 'reuse' && decision.reuse) {
          console.log(`[Content] ♻️  Reusing top-performing visual (score=${decision.reuse.performance_score}, ${decision.reuse.engagement.likes} likes) — Bytedance call SKIPPED`);
          // Note: caller should call markVisualReused() after creating the new post
          return decision.reuse.visual_url;
        }
      } catch (reuseErr: any) {
        console.warn('[Content] visual-reuse check failed (non-fatal):', reuseErr?.message?.slice(0, 100));
      }
    }

    // Optimize the visual description into an elite Seedream prompt.
    // 2026-06-12 — Founder rule (super important): TOUT le contenu doit être le
    // plus NATUREL possible, comme une vraie photo, ZÉRO effet IA et ZÉRO
    // couleur IA/violet — y compris les posts de KeiroAI elle-même. L'ancien
    // guide marque violet (SEEDREAM_STYLE_GUIDE) est retiré pour le contenu : on
    // utilise TOUJOURS le guide photo-réaliste + le bloc anti-AI-tells.
    const t2iSystem = `You are an elite prompt engineer for Seedream (text-to-image AI). The output must look like an AUTHENTIC PHOTOGRAPH a real person shot — NOT a branded graphic, NOT a 3D render, NOT an illustration.

⛔ ZERO AI/brand colours: NO violet, purple, lilac, magenta, electric blue, neon, or synthetic gradient — EVER (unless the real-world subject is naturally that colour, e.g. lavender, an eggplant). Use grounded photographic palettes: natural daylight, warm amber, terracotta, soft cream, charcoal, sage, wood tones, linen. Light is a colour: golden hour, north-window soft light, tungsten warm.

QUALITY STANDARDS:
- Editorial / lifestyle photography — REAL PHOTOGRAPH, not CGI, not flat design, not isometric, not clay-render.
- Phrasing to use: "documentary photo", "natural light photograph", "shot on a 35mm lens", "candid photographic still".
- Soft natural light, realistic depth of field (never aggressive macro bokeh), believable real textures.

ABSOLUTELY FORBIDDEN: text/letters/numbers, phones/screens/mockups, studio gradients, flat-design or 3D-render aesthetics, stock-photo clichés, over-saturation, ANY violet/purple/neon AI-looking colour.
${ANTI_AI_REALISM}
Output ONLY the optimized English prompt — pure visual description, no jargon, no markdown.`;
    void SEEDREAM_STYLE_GUIDE;
    const optimizedText = await callClaude({
      system: t2iSystem,
      message: `Create a PREMIUM visual prompt for a ${format} post.\n\nVisual brief: ${visualDescription}\n\nFormat context: ${format === 'carrousel' || format === 'post' ? 'Square format (1:1), must look stunning as Instagram grid thumbnail. Professional photography quality, magazine-level composition.' : format === 'story' ? 'Vertical 9:16 story format. MUST be visually STRIKING and PREMIUM — think high-end magazine ad or luxury brand story. Bold typography-ready composition, dramatic lighting, professional product photography or lifestyle shot. This is the FIRST thing people see, it must STOP the scroll.' : format === 'reel' || format === 'video' ? 'Vertical 9:16 video thumbnail format. Bold, eye-catching, cinematic feel.' : 'Horizontal 16:9 LinkedIn format, professional and corporate-friendly.'}\n\nIMPORTANT: Do NOT include any hex color codes, aspect ratios, numbers, or technical specifications. Describe colors by name only. Output a PURE VISUAL DESCRIPTION. Make it PREMIUM quality — not basic, not generic. Think Vogue, Apple, Nike level visuals.`,
      maxTokens: 400,
    });

    const rawPrompt = (optimizedText || visualDescription) + NO_TEXT_SUFFIX;
    const imagePrompt = rawPrompt.length > 2000 ? rawPrompt.substring(0, 2000) : rawPrompt;

    // ── Pre-flight validator (Phase 1) — économise 0,04 €/call sur prompt cassé.
    try {
      const { validateImagePrompt } = await import('@/lib/validators');
      const v = validateImagePrompt(imagePrompt, { format });
      if (v.severity === 'block') {
        console.warn(`[Content] Image prompt BLOCKED by validator (q=${v.quality_score}). Skipping Seedream call.`);
        console.warn(`[Content] Findings: ${v.findings.map(f => f.code).join(', ')}`);
        return null;
      }
      if (v.severity === 'warn') {
        console.log(`[Content] Image prompt warnings (q=${v.quality_score}): ${v.findings.map(f => f.code).join(', ')}`);
      }
    } catch { /* validator failure must not block hot path */ }

    // Determine aspect ratio based on format
    // Seedream requires minimum 3,686,400 pixels — ALL sizes must meet this
    let width = 1920;
    let height = 1920; // 1920x1920 = 3,686,400 ✓
    if (format === 'story' || format === 'reel' || format === 'video') {
      width = 1440; height = 2560; // 9:16 mobile = 3,686,400 ✓
    } else if (format === 'text') {
      width = 2560; height = 1440; // 16:9 LinkedIn = 3,686,400 ✓
    }
    // carrousel, post = 1:1 (1920x1920 = 3,686,400)

    console.log(`[Content] Generating visual with Seedream (${width}x${height})...`);
    const _seedreamStart = Date.now();

    const seedreamRes = await fetch(SEEDREAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'seedream-4-5-251128',
        prompt: imagePrompt,
        // 2026-06-03 — Negative prompt élargi : ajout gibberish, fake words,
        // distorted text qui sont les causes du "charabia" reporté par le
        // founder. Seedream essaie de générer du texte → on bloque toutes
        // les formes de texte / pseudo-texte.
        negative_prompt: 'text, words, letters, numbers, writing, typography, signs, labels, captions, watermarks, logos, headlines, slogans, brand names, price tags, menus, screens with text, readable characters, digits, gibberish text, fake words, distorted letters, random text, scribbles, illegible writing, garbled text, pseudo-text, alphabet soup, foreign characters, kanji, kanji-like shapes, computer code, low quality, blurry, deformed',
        size: `${width}x${height}`,
        response_format: 'url',
        seed: -1,
        watermark: false,
      }),
    });

    if (!seedreamRes.ok) {
      const errBody = await seedreamRes.text().catch(() => '');
      console.error('[Content] Seedream HTTP error:', seedreamRes.status, errBody.substring(0, 500));
      return null;
    }

    const seedreamData = await seedreamRes.json();
    const tempUrl = seedreamData.data?.[0]?.url || null;

    // 2026-06-09 — log cost (fire-and-forget)
    if (tempUrl) {
      try {
        const { logApiCost, PROVIDER_EUR } = await import('@/lib/admin/api-cost-logger');
        logApiCost({
          provider: 'seedream',
          kind: 'image_gen',
          units: 1,
          cost_eur: PROVIDER_EUR.seedream_image,
          user_id: userIdForReuse || null,
          agent: 'content',
          metadata: { width, height, format, duration_ms: Date.now() - _seedreamStart },
        }).catch(() => {});
      } catch { /* silent */ }
    }

    if (!tempUrl) {
      console.warn('[Content] Seedream returned no image URL');
      return null;
    }

    // Cache to Supabase Storage for permanent URL (Seedream URLs expire in ~1h)
    const postId = `post-${Date.now()}`;
    const permanentUrl = await cacheImageToStorage(tempUrl, postId);
    if (permanentUrl) {
      console.log('[Content] Visual generated + cached to permanent storage');
      return permanentUrl;
    }

    // Fallback to temp URL if caching fails
    console.warn('[Content] Cache failed, using temporary Seedream URL');
    return tempUrl;
  } catch (e: any) {
    console.error('[Content] Visual generation error:', e.message);
    return null;
  }
}

// ──────────────────────────────────────
// Publish to Instagram via Graph API
// ──────────────────────────────────────
/**
 * Check if an image/video URL has already been published to Instagram recently.
 * Prevents duplicate publications of the same visual.
 */
async function checkDuplicatePublication(
  supabase: any,
  visualUrl: string | undefined,
  videoUrl: string | undefined,
  platform: string = 'instagram',
  daysBack: number = 7
): Promise<{ isDuplicate: boolean; existingPostId?: string; existingPermalink?: string }> {
  if (!visualUrl && !videoUrl) return { isDuplicate: false };

  const since = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];

  // Check content_calendar for same visual_url or video_url published recently
  const conditions: string[] = [];
  if (visualUrl) conditions.push(`visual_url.eq.${visualUrl}`);
  if (videoUrl) conditions.push(`video_url.eq.${videoUrl}`);

  const { data: existing } = await supabase
    .from('content_calendar')
    .select('id, instagram_permalink, visual_url, video_url, published_at')
    .eq('status', 'published')
    .eq('platform', platform)
    .gte('scheduled_date', since)
    .or(conditions.join(','))
    .limit(1);

  if (existing && existing.length > 0) {
    console.warn(`[Content] DUPLICATE DETECTED: visual already published as post ${existing[0].id} on ${existing[0].published_at}`);
    return {
      isDuplicate: true,
      existingPostId: existing[0].id,
      existingPermalink: existing[0].instagram_permalink,
    };
  }

  // Second safety net: also check instagram_posts for same media URL
  // This catches stories that were published but missed by content_calendar dedup
  const mediaUrl = videoUrl || visualUrl;
  if (mediaUrl) {
    const { data: igExisting } = await supabase
      .from('instagram_posts')
      .select('id, permalink, posted_at')
      .or(`original_media_url.eq.${mediaUrl},cached_media_url.eq.${mediaUrl}`)
      .gte('posted_at', since)
      .limit(1);

    if (igExisting && igExisting.length > 0) {
      console.warn(`[Content] DUPLICATE DETECTED (instagram_posts): media already posted as ${igExisting[0].id} on ${igExisting[0].posted_at}`);
      return {
        isDuplicate: true,
        existingPostId: igExisting[0].id,
        existingPermalink: igExisting[0].permalink,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Runtime cache: whether content_calendar actually has the retry_count /
 * next_retry_at columns. Lazily filled on first check — true = columns exist,
 * false = migration 20260413_add_publish_retry.sql hasn't been applied yet
 * (in which case we fall back to plain publish_failed instead of writing
 * unknown columns, which would roll the whole update back and cause an
 * infinite retry loop on every cron run).
 */
let retryColumnsAvailable: boolean | null = null;

async function checkRetryColumns(supabase: any): Promise<boolean> {
  if (retryColumnsAvailable !== null) return retryColumnsAvailable;
  try {
    const { error } = await supabase
      .from('content_calendar')
      .select('retry_count, next_retry_at')
      .limit(1);
    if (error && /column .* does not exist/i.test(error.message || '')) {
      console.warn('[Content] retry_count/next_retry_at columns missing — apply migration 20260413_add_publish_retry.sql. Retry feature disabled until then.');
      retryColumnsAvailable = false;
    } else {
      retryColumnsAvailable = !error;
    }
  } catch {
    retryColumnsAvailable = false;
  }
  return retryColumnsAvailable;
}

/**
 * Apply retry-on-transient-error policy to a failed publish attempt.
 * - Transient errors (timeout, 5xx, rate limit) under MAX_PUBLISH_RETRIES:
 *   mutate updateData to set status='retry_pending' with next_retry_at + retry_count.
 *   The next execute_publication cron run will pick it up.
 * - Permanent errors OR retries exhausted: keep the existing publish_failed fields.
 * - If the retry_count/next_retry_at columns haven't been added yet (migration
 *   not applied), we silently skip retry and let the caller write publish_failed.
 * Returns true if the post was scheduled for retry (caller should skip alert email).
 */
async function applyPublishRetry(
  supabase: any,
  updateData: Record<string, any>,
  currentRetryCount: number,
  errorMessage: string,
  postId: string,
  platform: string,
): Promise<boolean> {
  if (!isTransientPublishError(errorMessage)) return false;
  if (currentRetryCount >= MAX_PUBLISH_RETRIES) {
    console.warn(`[Content] Post ${postId}: max retries (${MAX_PUBLISH_RETRIES}) reached on ${platform} — giving up`);
    return false;
  }
  // Guard: without the migration, we can't track retry_count safely — fall
  // back to plain publish_failed so the update doesn't reject.
  const hasCols = await checkRetryColumns(supabase);
  if (!hasCols) return false;

  const nextRetryAt = new Date(Date.now() + nextRetryDelayMs(currentRetryCount)).toISOString();
  updateData.status = 'retry_pending';
  updateData.retry_count = currentRetryCount + 1;
  updateData.next_retry_at = nextRetryAt;
  updateData.publish_error = errorMessage;
  delete updateData.published_at;
  delete updateData.publish_diagnostic;
  console.log(`[Content] Post ${postId}: transient ${platform} error — retry ${currentRetryCount + 1}/${MAX_PUBLISH_RETRIES} at ${nextRetryAt}`);
  return true;
}

async function publishToInstagram(
  post: { id?: string; format?: string; caption?: string; hashtags?: string[]; visual_url?: string; video_url?: string },
  supabase: any,
  orgId?: string | null,
  userId?: string | null
): Promise<{ success: boolean; permalink?: string; error?: string }> {
  // Declared here so the catch block at the bottom can reference it for
  // the token-expiry auto-disconnect flow.
  let effectivePostOwnerId: string | null = userId || (post as any).user_id || null;
  // ─── ATOMIC CLAIM ─────────────────────────────────────────────
  // Two cron paths (slot loop + execute_publication backlog) can both
  // pick the same approved row and race. Without an atomic claim, both
  // call the IG Graph API and IG publishes the same image twice.
  // Founder reported the duplicate on 2026-05-27.
  //
  // Pattern: UPDATE … SET status='publishing' WHERE id=X AND status IN
  // ('approved','draft','publish_failed','retry_pending') RETURNING id.
  // If 0 rows returned, another process already took it — we abort.
  // On failure path below, we restore to 'approved' so a retry pass
  // can re-claim.
  if (post.id) {
    try {
      const { data: claimed, error: claimErr } = await supabase
        .from('content_calendar')
        .update({ status: 'publishing', updated_at: new Date().toISOString() })
        .eq('id', post.id)
        .in('status', ['approved', 'draft', 'publish_failed', 'retry_pending'])
        .select('id, instagram_permalink')
        .maybeSingle();
      if (claimErr || !claimed) {
        // Race: another process already claimed this row. Check
        // whether it landed → if so, return success with the
        // existing permalink so the caller's success branch is
        // idempotent (doesn't downgrade status to 'approved' /
        // 'publish_failed' afterwards). Founder reported
        // 2026-05-27: duplicate IG posts because the race wasn't
        // gated.
        const { data: current } = await supabase
          .from('content_calendar')
          .select('status, instagram_permalink')
          .eq('id', post.id)
          .maybeSingle();
        if (current?.status === 'published') {
          console.log(`[Content] publishToInstagram: ${post.id} already published by another process — no-op`);
          return { success: true, permalink: current?.instagram_permalink || undefined };
        }
        if (current?.status === 'publishing') {
          console.warn(`[Content] publishToInstagram: ${post.id} in 'publishing' state by another process — no-op (avoids dup)`);
          return { success: true };
        }
        console.warn(`[Content] publishToInstagram: ${post.id} claim returned no row (status: ${current?.status}) — skipping`);
        return { success: false, error: 'already_claimed_by_another_process' };
      }
    } catch (claimErr: any) {
      console.warn(`[Content] publishToInstagram claim threw: ${claimErr?.message}`);
      // If claim fails for non-race reasons (DB blip), continue cautiously
    }
  }
  // Helper: release the 'publishing' claim if we exit without
  // promoting it to 'published'. Caller's status update happens
  // after we return, but if we crash or hit a non-claim error,
  // this restores the row so the next pass can re-claim it.
  const releaseClaimOnFailure = async () => {
    if (!post.id) return;
    try {
      await supabase
        .from('content_calendar')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', post.id)
        .eq('status', 'publishing'); // only revert if still in our claim state
    } catch { /* best-effort */ }
  };
  try {
    // ── DAILY CAP — never publish more than N posts/day for this user ──
    // Today mrzirraro hit 16 IG posts in 12h (mix of cron + tests +
    // auto-publish). Without a deterministic cap the agent will spam
    // the feed and get rate-limited or shadow-banned. Default 3/day,
    // overridable via org_agent_configs.config.daily_publish_limit_instagram.
    if (effectivePostOwnerId) {
      try {
        let dailyLimit = 3;
        const { data: cfg } = await supabase
          .from('org_agent_configs')
          .select('config')
          .eq('user_id', effectivePostOwnerId)
          .eq('agent_id', 'content')
          .maybeSingle();
        const cfgLimit = (cfg?.config as any)?.daily_publish_limit_instagram;
        if (Number.isInteger(cfgLimit) && cfgLimit >= 0 && cfgLimit <= 50) dailyLimit = cfgLimit;

        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const { count: publishedToday } = await supabase
          .from('content_calendar')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', effectivePostOwnerId)
          .eq('platform', 'instagram')
          .eq('status', 'published')
          .gte('published_at', todayStart.toISOString());
        if ((publishedToday || 0) >= dailyLimit) {
          console.warn(`[Content] Daily IG cap reached for user ${effectivePostOwnerId.slice(0, 8)}: ${publishedToday}/${dailyLimit} — postponing to tomorrow`);
          // Reschedule this post to tomorrow so the cron doesn't loop
          // on it every 30 min for the rest of the day. Keep status
          // 'approved' — it'll fire naturally at the new date.
          if (post.id) {
            try {
              const tomorrow = new Date();
              tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
              const tomorrowDate = tomorrow.toISOString().split('T')[0];
              await supabase
                .from('content_calendar')
                .update({
                  scheduled_date: tomorrowDate,
                  publish_diagnostic: `daily_cap_${publishedToday}/${dailyLimit}_postponed_to_${tomorrowDate}`,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', post.id);
            } catch {}
          }
          return {
            success: false,
            error: `daily_cap_reached:${publishedToday}/${dailyLimit}`,
          };
        }
      } catch (capErr: any) {
        // If the cap check itself fails we don't block the publish —
        // we'd rather a degraded check than a stuck pipeline.
        console.warn('[Content] daily cap check failed (non-fatal):', capErr?.message);
      }
    }

    // ── Dedup check: prevent publishing the same image twice ──
    const dupCheck = await checkDuplicatePublication(supabase, post.visual_url, post.video_url, 'instagram');
    if (dupCheck.isDuplicate) {
      console.warn(`[Content] Skipping duplicate Instagram publication. Already published as ${dupCheck.existingPostId}`);
      // Release claim AND mark as 'skipped' so we don't re-try
      if (post.id) {
        try {
          await supabase.from('content_calendar')
            .update({ status: 'skipped', publish_diagnostic: `dup_of_${dupCheck.existingPostId}`, updated_at: new Date().toISOString() })
            .eq('id', post.id)
            .eq('status', 'publishing');
        } catch { /* best-effort */ }
      }
      return {
        success: false,
        error: `Duplicate: cette image a déjà été publiée (post ${dupCheck.existingPostId}${dupCheck.existingPermalink ? `, ${dupCheck.existingPermalink}` : ''})`,
      };
    }

    // Multi-tenant: find IG tokens by org_id first, fallback to admin
    let publishProfile: any = null;

    if (orgId) {
      // Try to find the org owner's IG tokens
      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('role', 'owner')
        .single();

      if (orgMember?.user_id) {
        const { data: orgProfile } = await supabase
          .from('profiles')
          .select('id, instagram_business_account_id, facebook_page_access_token, instagram_igaa_token, instagram_username')
          .eq('id', orgMember.user_id)
          .single();

        if (orgProfile?.instagram_business_account_id && (orgProfile?.facebook_page_access_token || orgProfile?.instagram_igaa_token)) {
          publishProfile = orgProfile;
          effectivePostOwnerId = orgProfile.id || orgMember.user_id;
          console.log(`[Content] Using org owner's IG tokens (org: ${orgId})`);
        }
      }
    }

    // Try client userId if no org profile found
    // Also try post.user_id as fallback (set when post was created)
    const effectiveUserId = userId || (post as any).user_id || null;
    if (!publishProfile && effectiveUserId) {
      const { data: clientProfile } = await supabase
        .from('profiles')
        .select('id, instagram_business_account_id, facebook_page_access_token, instagram_igaa_token, instagram_username')
        .eq('id', effectiveUserId)
        .single();
      if (clientProfile?.instagram_business_account_id && (clientProfile?.facebook_page_access_token || clientProfile?.instagram_igaa_token)) {
        publishProfile = clientProfile;
        effectivePostOwnerId = clientProfile.id || effectiveUserId;
        console.log(`[Content] Using client's IG tokens (userId: ${effectiveUserId})`);
      }
    }

    if (!publishProfile) {
      console.warn('[Content] No client IG profile found for publishing — skipping');
      await releaseClaimOnFailure();
      return { success: false, error: 'Client Instagram non connecte. Aucune publication.' };
    }

    const igUserId = publishProfile.instagram_business_account_id;
    // Prefer permanent IGAA token; fall back to FB page token. lib/meta
    // auto-routes to graph.instagram.com when token starts with IGAA.
    const pageAccessToken = publishProfile.instagram_igaa_token || publishProfile.facebook_page_access_token;

    if (!igUserId || !pageAccessToken) {
      console.error('[Content] Admin has no Instagram tokens configured');
      await releaseClaimOnFailure();
      return { success: false, error: 'Instagram tokens not configured for admin user' };
    }

    if (!post.visual_url && !post.video_url) {
      await releaseClaimOnFailure();
      return { success: false, error: 'No visual_url or video_url available for publishing' };
    }

    // Build caption with hashtags — visually clean formatting
    let hashtagsArr = Array.isArray(post.hashtags) ? post.hashtags : [];
    let rawCaption = (post.caption || '').trim();

    // 2026-06-03 — Pre-publish guardrails. Catches Meta/TikTok policy
    // violations (hate, medical/finance claims, shadow-banned tags,
    // foreign watermarks) BEFORE the API call. Blocked posts go back to
    // 'draft' so the founder can review; warnings ship the sanitized
    // version.
    try {
      const { checkPublishGuardrails, logGuardrails } = await import('@/lib/moderation/content-guardrails');
      const gr = await checkPublishGuardrails({
        platform: 'instagram',
        caption: rawCaption,
        hashtags: hashtagsArr,
        videoUrl: post.video_url,
        visualSource: (post as any).visual_source || 'ai_generated',
      });
      if (effectivePostOwnerId && post.id) {
        await logGuardrails(supabase, effectivePostOwnerId, post.id, gr, 'instagram');
      }
      if (!gr.ok) {
        console.warn(`[Content] Guardrails BLOCKED IG publish for ${post.id}: ${gr.blocked.join(' | ')}`);
        if (post.id) {
          await supabase
            .from('content_calendar')
            .update({
              status: 'draft',
              publish_diagnostic: `guardrails: ${gr.blocked.join(' | ')}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', post.id);
        }
        return { success: false, error: `Guardrails: ${gr.blocked[0]}` };
      }
      // Apply sanitized caption + hashtags
      rawCaption = gr.sanitized.caption;
      hashtagsArr = gr.sanitized.hashtags;
    } catch (e: any) {
      console.warn('[Content] Guardrails check failed (non-blocking):', e?.message);
    }

    // 2026-06-06 — Defensive platform-isolation sanitizer (same as TT path).
    // Strips TikTok / LinkedIn / Facebook mentions from IG captions before
    // publish, even when the LLM generated the post under older rules.
    rawCaption = sanitizePlatformMentions(rawCaption, 'instagram');
    hashtagsArr = hashtagsArr.filter(h => !/(tiktok|tt_|linkedin|linkdn|facebook|fb_)/i.test(String(h)));

    // Ensure caption ends with proper spacing before hashtags
    const captionNeedsSeparator = rawCaption.length > 0 && !rawCaption.endsWith('\n');
    const hashtagLine = hashtagsArr.length > 0 ? hashtagsArr.map(h => h.startsWith('#') ? h : `#${h}`).join(' ') : '';
    const fullCaption = rawCaption + (hashtagLine ? (captionNeedsSeparator ? '\n\n・・・\n\n' : '\n\n') + hashtagLine : '');

    const format = (post.format || 'post').toLowerCase();

    console.log(`[Content] Publishing to Instagram as ${format} (ig_user: ${igUserId})...`);

    let result: { id: string; permalink?: string };

    if (format === 'reel' || format === 'video') {
      // Reels/video: publish as Instagram Reel (video required)
      if (post.video_url) {
        console.log('[Content] Publishing Instagram REEL with video');
        result = await publishReelToInstagram(igUserId, pageAccessToken, post.video_url, fullCaption);
      } else if (post.visual_url) {
        // No video available — fallback to image post
        console.log('[Content] Reel requested but no video — falling back to image post');
        result = await publishImageToInstagram(igUserId, pageAccessToken, post.visual_url, fullCaption);
      } else {
        await releaseClaimOnFailure();
        return { success: false, error: 'No video_url for Reel publishing' };
      }
    } else if (format === 'story') {
      // Stories don't have captions via Graph API
      const storyResult = await publishStoryToInstagram(igUserId, pageAccessToken, post.visual_url!);
      result = { id: storyResult.id };
    } else if (format === 'carrousel') {
      // Real carousel: use per-slide visual descriptions when the LLM
      // provided them (post.slides[]). Otherwise fall back to narrative-
      // aware variations of the base description.
      //
      // Bug caught 2026-06-05 by founder: previously generated 3 images
      // from same base + trivial suffixes ("alternative angle", "close-up"),
      // so before/after carousels looked like 3 angles of the same scene
      // — not a real narrative. The LLM was already outputting slides[]
      // with distinct `visual` per slide; the code just ignored it.
      const carouselUrls: string[] = [post.visual_url!];
      const baseDesc = (post as any).visual_description || (post as any).hook || (post as any).caption || 'premium product';
      const slides: Array<{ visual?: string; text?: string; style?: string }> = Array.isArray((post as any).slides) ? (post as any).slides : [];

      // Use slides[1..N].visual for slides 2..N+1 (slide 1 = base image already there).
      // Cap at 9 extra slides (IG max = 10).
      const slidesToUse = slides.slice(1, 10);
      if (slidesToUse.length > 0) {
        console.log(`[Content] Carousel: using ${slidesToUse.length} per-slide visual_description from LLM`);
        for (const s of slidesToUse) {
          const slideDesc = s.visual?.trim();
          if (!slideDesc) continue;
          try {
            const varUrl = await generateVisual(slideDesc, 'carrousel');
            if (varUrl) carouselUrls.push(varUrl);
          } catch { /* skip slide on error */ }
        }
      }

      // Fallback when slides[] is missing — produce 2 SEMANTICALLY distinct
      // variations (not just angles). The variations describe a narrative
      // arc (before vs after, problem vs solution, wide vs detail) so the
      // carousel feels like a story even without explicit slide briefs.
      if (carouselUrls.length === 1) {
        const narrativeVariations = [
          `${baseDesc}. NARRATIVE SLIDE 2 — visually opposed to slide 1: if slide 1 is empty/cold/quiet, this slide is alive/warm/full of motion. If slide 1 is a wide establishing shot, this is a close-up of a specific human gesture or tangible result. Different time of day, different framing, different energy. Editorial photography aesthetic, real skin texture, natural light, no AI tells.`,
          `${baseDesc}. NARRATIVE SLIDE 3 — proof/result moment: a single concrete tangible element that demonstrates the outcome (busy reservation book, smile of a real customer mid-bite, hand counting tip, full dining room from owner's POV). Documentary photography intimacy, shallow depth of field, golden-hour or window-light, NO repeated subject from slides 1 or 2.`,
        ];
        for (const variation of narrativeVariations) {
          try {
            const varUrl = await generateVisual(variation, 'carrousel');
            if (varUrl) carouselUrls.push(varUrl);
          } catch { /* skip variation on error */ }
        }
      }

      if (carouselUrls.length >= 2) {
        console.log(`[Content] Publishing carousel with ${carouselUrls.length} images`);
        result = await publishCarouselToInstagram(igUserId, pageAccessToken, carouselUrls, fullCaption);
      } else {
        console.log('[Content] Carousel fallback: only 1 image generated, publishing as single post');
        result = await publishImageToInstagram(igUserId, pageAccessToken, post.visual_url!, fullCaption);
      }
    } else {
      // post or any other format → single image publish
      result = await publishImageToInstagram(igUserId, pageAccessToken, post.visual_url!, fullCaption);
    }

    console.log(`[Content] Instagram publish success — media id: ${result.id}${result.permalink ? `, permalink: ${result.permalink}` : ''}`);

    // Auto-save to instagram_posts table for instant gallery/thumbnail update.
    // Writes under the actual post owner (client or org owner) so the library
    // widget's `WHERE user_id = currentUser` query picks it up immediately.
    // Falls back to admin only if we truly don't know the owner.
    try {
      let ownerId = effectivePostOwnerId;
      if (!ownerId) {
        const { data: adminProfile } = await supabase
          .from('profiles').select('id').eq('is_admin', true).single();
        ownerId = adminProfile?.id;
      }
      await supabase.from('instagram_posts').upsert({
        id: result.id,
        user_id: ownerId,
        caption: fullCaption.substring(0, 2000),
        permalink: result.permalink || `https://www.instagram.com/p/${result.id}/`,
        media_type: format === 'reel' || format === 'video' ? 'VIDEO' : format === 'story' ? 'STORY' : format === 'carrousel' ? 'CAROUSEL_ALBUM' : 'IMAGE',
        posted_at: new Date().toISOString(),
        original_media_url: post.video_url || post.visual_url || '',
        cached_media_url: post.video_url || post.visual_url || '',
        synced_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      console.log(`[Content] Post saved to instagram_posts under owner ${ownerId} for gallery auto-refresh`);
    } catch (e: any) {
      console.warn('[Content] Failed to save to instagram_posts:', e.message);
    }

    return { success: true, permalink: result.permalink };
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('[Content] Instagram publish error:', msg);

    // Detect Meta token expiry / revocation — codes 190 or subcode
    // 463/467/458/464 (various OAuthException flavours). When hit, we
    // clear the client's IG tokens from profiles and email them to
    // reconnect. Keeps the 90-day token lifecycle safe without
    // silently accumulating publish_failed records.
    const tokenExpired = /code.?:?\s*190\b/.test(msg)
      || /error_subcode.?:?\s*(463|467|458|464)\b/.test(msg)
      || /access token.*expired/i.test(msg)
      || /permissions.*revoked/i.test(msg)
      || /session has expired/i.test(msg);

    if (tokenExpired && effectivePostOwnerId) {
      try {
        await supabase
          .from('profiles')
          .update({
            instagram_business_account_id: null,
            facebook_page_access_token: null,
            instagram_igaa_token: null,
            instagram_username: null,
          })
          .eq('id', effectivePostOwnerId);
        console.log(`[Content] IG tokens cleared for ${effectivePostOwnerId} (token expired/revoked)`);

        // Notify the client via a crm_activity row + ops escalation so
        // Hugo's next outbound can send the re-auth email.
        await supabase.from('agent_logs').insert({
          agent: 'content',
          action: 'ig_token_expired_auto_disconnect',
          status: 'warning',
          error_message: msg.substring(0, 500),
          data: {
            user_id: effectivePostOwnerId,
            action: 'email_client_to_reconnect',
            reconnect_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com'}/integrations/meta`,
          },
          created_at: new Date().toISOString(),
        });
      } catch (cleanupErr: any) {
        console.error('[Content] IG token cleanup failed:', cleanupErr?.message);
      }
    }

    // Any unhandled exception → release our claim so a future pass
    // can retry. Without this, a single IG outage would leave the row
    // stuck in 'publishing' forever.
    await releaseClaimOnFailure();
    return { success: false, error: msg };
  }
}

// ──────────────────────────────────────
// Seedance T2V API constants (same as /api/seedream/t2v)
// ──────────────────────────────────────
const SEEDANCE_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

/**
 * Extract video URL from Seedance task status response (mirrors checkSeedanceTaskStatus in t2v route).
 */
function extractSeedanceVideoUrl(data: any): string | null {
  if (data.content && typeof data.content === 'object' && !Array.isArray(data.content)) {
    if (data.content.video_url) return typeof data.content.video_url === 'string' ? data.content.video_url : data.content.video_url.url || null;
  }
  if (data.content && Array.isArray(data.content)) {
    for (const item of data.content) {
      if (item.type === 'video_url' && item.video_url?.url) return item.video_url.url;
      if (item.type === 'video' && item.url) return item.url;
      if (item.video_url) return typeof item.video_url === 'string' ? item.video_url : item.video_url.url;
    }
  }
  return data.output?.video_url || data.output?.url || data.result?.video_url || data.result?.url || data.video_url || data.url || data.data?.video_url || null;
}

// ──────────────────────────────────────
// Generate TikTok/short video via Seedance T2V (+ Kling T2V fallback)
// Returns permanent Supabase Storage URL or null
// ──────────────────────────────────────
async function generateTikTokVideo(visualDescription: string): Promise<string | null> {
  try {
    // Optimize prompt for viral video generation
    const optimizedPrompt = await callClaude({
      system: `Tu es le meilleur créateur de vidéos virales pour les réseaux sociaux. Tu convertis des briefs marketing en prompts vidéo EXCEPTIONNELS pour Seedance AI.

RÈGLES POUR UN PROMPT VIDÉO VIRAL :
- Décris une SCÈNE UNIQUE avec du MOUVEMENT captivant (pas statique)
- Inclus des MOUVEMENTS DE CAMÉRA (dolly in, pan, tracking shot, drone aerial)
- Lumière cinématique : golden hour, néons, rétro-éclairage dramatique
- Émotions fortes : surprise, satisfaction, émerveillement
- Style : ultra réaliste 4K cinématique, profondeur de champ
- JAMAIS de texte, lettres, mots, logos dans la vidéo
- Max 200 caractères, EN ANGLAIS uniquement
- Le prompt doit donner une vidéo qui ARRÊTE le scroll

Output UNIQUEMENT le prompt vidéo, rien d'autre.`,
      message: `Create a 10s vertical video prompt from this brief: ${visualDescription}`,
      maxTokens: 200,
    });

    const videoPrompt = (optimizedPrompt || visualDescription).substring(0, 250);
    console.log(`[Content] Generating video: "${videoPrompt.substring(0, 80)}..."`);

    const apiKey = process.env.SEEDREAM_API_KEY || SEEDREAM_API_KEY;

    // ═══ PROVIDER ORDER: Kling primary, Seedance fallback ═══
    // To swap on 2026-03-24: move Seedance block above Kling block

    // --- Try Kling T2V first (primary) ---
    try {
      console.log('[Content] Trying Kling T2V (primary)...');
      const klingTaskId = await createT2VTask({
        prompt: videoPrompt,
        duration: '10',
        aspect_ratio: '9:16',
      });
      console.log(`[Content] Kling T2V task created: ${klingTaskId}`);

      const maxWait = 180_000;
      const pollInterval = 8_000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        const result = await checkT2VTask(klingTaskId);
        if (result.status === 'completed' && result.videoUrl) {
          console.log(`[Content] Kling T2V completed: ${result.videoUrl.substring(0, 80)}...`);
          const cachedUrl = await cacheVideoToStorage(result.videoUrl, `tiktok-${Date.now()}`);
          return cachedUrl || result.videoUrl;
        }
        if (result.status === 'failed') {
          console.error(`[Content] Kling T2V failed: ${result.error}`);
          break;
        }
        console.log(`[Content] Kling T2V polling... status: ${result.status}`);
      }
    } catch (klingErr: any) {
      console.warn('[Content] Kling T2V failed:', klingErr.message);
    }

    // --- Fallback to Seedance T2V ---
    try {
      console.log('[Content] Kling failed — falling back to Seedance T2V...');
      const formattedPrompt = `${videoPrompt} --camerafixed false --duration 10`;
      const seedanceRes = await fetch(SEEDANCE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'seedance-1-5-pro-251215',
          content: [{ type: 'text', text: formattedPrompt }],
        }),
      });

      if (!seedanceRes.ok) {
        const errText = await seedanceRes.text().catch(() => '');
        throw new Error(`Seedance HTTP ${seedanceRes.status}: ${errText.substring(0, 200)}`);
      }

      const seedanceData = await seedanceRes.json();
      const taskId = seedanceData.id || seedanceData.task_id || seedanceData.data?.id || seedanceData.data?.task_id;
      if (!taskId) throw new Error('Seedance returned no task ID');

      console.log(`[Content] Seedance fallback task created: ${taskId}`);

      const maxWait = 240_000;
      const pollInterval = 10_000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        const statusRes = await fetch(`${SEEDANCE_API_URL}/${taskId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (!statusRes.ok) { console.warn(`[Content] Seedance status error: ${statusRes.status}`); continue; }

        const statusData = await statusRes.json();
        const status = statusData.status || statusData.data?.status || statusData.state || statusData.data?.state;

        if (status === 'succeeded' || status === 'completed' || status === 'success' || status === 'done') {
          const videoUrl = extractSeedanceVideoUrl(statusData);
          if (videoUrl) {
            console.log(`[Content] Seedance T2V completed: ${videoUrl.substring(0, 80)}...`);
            // 2026-06-09 — log Seedance cost (fire-and-forget)
            try {
              const { logApiCost, PROVIDER_EUR } = await import('@/lib/admin/api-cost-logger');
              logApiCost({
                provider: 'seedance',
                kind: 'video_10s',
                units: 1,
                cost_eur: PROVIDER_EUR.seedance_10s,
                agent: 'content',
                metadata: { fallback: 'kling_failed' },
              }).catch(() => {});
            } catch { /* silent */ }
            const cachedUrl = await cacheVideoToStorage(videoUrl, `tiktok-${Date.now()}`);
            return cachedUrl || videoUrl;
          }
          console.warn('[Content] Seedance completed but no video URL');
          break;
        }
        if (status === 'failed' || status === 'error' || status === 'cancelled') {
          console.error(`[Content] Seedance T2V failed: ${statusData.error || status}`);
          break;
        }
        console.log(`[Content] Seedance polling... status: ${status}`);
      }
    } catch (seedanceErr: any) {
      console.warn('[Content] Seedance T2V also failed:', seedanceErr.message);
    }

    console.error('[Content] Both Kling and Seedance T2V failed');
    return null;
  } catch (e: any) {
    console.error('[Content] Video generation error:', e.message);
    return null;
  }
}

/**
 * Cache a video file to Supabase Storage for permanent URL.
 */
async function cacheVideoToStorage(tempUrl: string, videoId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const videoResponse = await fetch(tempUrl);
    if (!videoResponse.ok) return null;
    const buffer = await videoResponse.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
    const fileName = `content/videos/${videoId}.mp4`;
    const blob = new Blob([buffer], { type: contentType });
    const { error: uploadError } = await supabase.storage
      .from('generated-images').upload(fileName, blob, { contentType, upsert: false });
    if (uploadError) {
      console.error('[Content] Video cache upload error:', uploadError.message);
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from('generated-images').getPublicUrl(fileName);
    console.log('[Content] Video cached to permanent storage');
    return publicUrl || null;
  } catch (e: any) {
    console.error('[Content] Video caching failed:', e.message);
    return null;
  }
}

// ──────────────────────────────────────
// Create an async long video job (30s+) via the video-long pipeline
// Returns the job ID — the video-poll cron will advance and publish
// ──────────────────────────────────────
async function createAsyncLongVideo(
  visualDescription: string,
  caption: string,
  duration: number = 30,
  aspectRatio: string = '9:16',
  postId: string,
): Promise<{ jobId: string | null; coverUrl: string | null }> {
  try {
    console.log(`[Content] === ASYNC LONG VIDEO PIPELINE (${duration}s) ===`);

    // Step 1: Generate cover image via Seedream
    const imageUrl = await generateVisual(visualDescription, 'video');
    console.log(`[Content] Cover image: ${imageUrl ? imageUrl.substring(0, 80) : 'failed'}`);

    // Step 2: Create elite cinematic video brief via Claude
    // This brief will be decomposed into multiple scenes by decomposePromptIntoScenes
    const videoPromptRaw = await callClaude({
      system: `Tu es un directeur de photographie primé qui crée des vidéos virales pour TikTok. Tu transformes un brief marketing en une DESCRIPTION CINÉMATIQUE détaillée qui servira de base pour une vidéo de ${duration} secondes découpée en plusieurs segments.

OBJECTIF : Créer une vidéo qui semble être UN SEUL PLAN CONTINU filmé dans un même lieu, avec une progression narrative fluide.

RÈGLES ABSOLUES :
- Décris UN SEUL LIEU/DÉCOR précis et détaillé (type de mur, matériaux, lumière exacte, palette de couleurs)
- Le lieu doit être VISUELLEMENT RICHE : textures, objets décoratifs, profondeur
- Inclus une PROGRESSION NARRATIVE : révélation → action → détail → conclusion
- Précise la LUMIÈRE exacte : "golden hour amber light streaming through tall windows" pas juste "belle lumière"
- Précise la PALETTE : "warm honey tones, deep mahogany wood, soft cream accents"
- JAMAIS de texte, lettres, mots, logos, panneaux dans la vidéo
- JAMAIS de visages en gros plan (l'IA fait des visages artificiels) — mains, silhouettes, plans larges
- EN ANGLAIS uniquement
- 200-350 caractères

Le prompt doit contenir assez de détails visuels pour qu'un directeur photo puisse en tirer ${Math.ceil(duration / 10)} plans différents dans le MÊME décor.

Output UNIQUEMENT le prompt vidéo, rien d'autre.`,
      message: `Brief marketing: ${visualDescription}\nCaption: ${caption}\nDurée: ${duration}s (sera découpé en ${Math.ceil(duration / 10)} segments de 10s)\nFormat: vertical 9:16 TikTok`,
      maxTokens: 400,
    });

    const videoPrompt = (videoPromptRaw || visualDescription).substring(0, 400);
    console.log(`[Content] Video prompt (${duration}s): "${videoPrompt.substring(0, 100)}..."`);

    // Step 3: Decompose into scenes via Claude
    const scenes = await decomposePromptIntoScenes(videoPrompt, duration, {
      aspectRatio,
      renderStyle: 'photorealistic',
      tone: 'professional',
      visualStyle: 'cinematic',
    });

    console.log(`[Content] Decomposed into ${scenes.length} scenes for ${duration}s`);

    // Step 4: Build job segments
    const jobSegments = scenes.map((scene) => ({
      index: scene.index,
      duration: scene.duration,
      prompt: scene.prompt,
      type: scene.type,
      taskId: null as string | null,
      videoUrl: null as string | null,
      status: 'pending' as 'pending' | 'generating' | 'completed' | 'failed',
      provider: null as ('s' | 'k' | null),
    }));

    // Step 5: Start generating segment 0 via Kling T2V (primary)
    let firstTaskId: string | null = null;
    let firstProvider: 's' | 'k' = 'k';

    // Try Kling T2V first
    try {
      console.log('[Content] Starting segment 0 via Kling T2V...');
      const klingTaskId = await createT2VTask({
        prompt: scenes[0].prompt,
        duration: String(scenes[0].duration >= 10 ? 10 : 5),
        aspect_ratio: aspectRatio,
      });
      firstTaskId = klingTaskId;
      firstProvider = 'k';
      console.log(`[Content] Segment 0 started: Kling taskId=${klingTaskId}`);
    } catch (klingErr: any) {
      console.warn('[Content] Kling T2V failed for segment 0:', klingErr.message);

      // Fallback: Seedance T2V
      try {
        const apiKey = process.env.SEEDREAM_API_KEY || SEEDREAM_API_KEY;
        const segDuration = scenes[0].duration >= 10 ? 10 : 5;
        const formattedPrompt = `${scenes[0].prompt.substring(0, 200)} --camerafixed false --ratio ${aspectRatio} --duration ${segDuration}`;
        const SEEDANCE_T2V_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';
        const seedanceRes = await fetch(SEEDANCE_T2V_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'seedance-1-5-pro-251215', content: [{ type: 'text', text: formattedPrompt }] }),
        });
        if (!seedanceRes.ok) throw new Error(`Seedance HTTP ${seedanceRes.status}`);
        const seedanceData = await seedanceRes.json();
        const taskId = seedanceData.id || seedanceData.task_id || seedanceData.data?.id || seedanceData.data?.task_id;
        if (!taskId) throw new Error('Seedance returned no task ID');
        firstTaskId = `seedream_${taskId}`;
        firstProvider = 's';
        console.log(`[Content] Segment 0 started: Seedance taskId=${firstTaskId}`);
      } catch (seedanceErr: any) {
        console.error('[Content] Both Kling and Seedance failed for segment 0:', seedanceErr.message);
        return { jobId: null, coverUrl: imageUrl };
      }
    }

    // Step 6: Create the video job in DB
    jobSegments[0].taskId = firstTaskId;
    jobSegments[0].status = 'generating';
    jobSegments[0].provider = firstProvider;

    const supabase = getSupabaseAdmin();
    // Use a system user ID for cron-created jobs
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
    const job = await createVideoJob(supabase, {
      user_id: SYSTEM_USER_ID,
      status: 'generating',
      total_segments: jobSegments.length,
      completed_segments: 0,
      current_segment_task_id: firstTaskId!,
      segments: jobSegments,
      prompt: videoPrompt,
      duration,
      aspect_ratio: aspectRatio,
    });

    if (!job) {
      console.error('[Content] Failed to create video job via RPC');
      return { jobId: null, coverUrl: imageUrl };
    }

    console.log(`[Content] Video job created: ${job.id} (${scenes.length} segments, ${duration}s)`);

    // Step 7: Link job to content_calendar post
    await supabase.from('content_calendar').update({
      video_job_id: job.id,
      visual_url: imageUrl,
      status: 'video_generating',
      updated_at: new Date().toISOString(),
    }).eq('id', postId);

    return { jobId: job.id, coverUrl: imageUrl };
  } catch (e: any) {
    console.error('[Content] Async long video creation error:', e.message);
    return { jobId: null, coverUrl: null };
  }
}

// ──────────────────────────────────────
// Generate video via Seedance T2V (+ Kling T2V fallback) for Reels & TikTok
// Pipeline: cover image (Seedream) → elite video prompt → Seedance T2V → cache
// ──────────────────────────────────────
async function generateVideoWithNarration(
  visualDescription: string,
  caption: string,
  format: string = 'reel',
  duration: number = 5
): Promise<{ videoUrl: string | null; coverUrl: string | null }> {
  try {
    console.log(`[Content] === VIDEO PIPELINE (Seedance T2V + Kling fallback) ===`);

    // Step 1: Generate the cover image via Seedream
    console.log('[Content] Step 1: Generating Seedream cover image...');
    const imageUrl = await generateVisual(visualDescription, format);
    if (!imageUrl) {
      console.error('[Content] Image generation failed — aborting video pipeline');
      return { videoUrl: null, coverUrl: null };
    }
    console.log('[Content] Cover image generated:', imageUrl.substring(0, 80));

    // Step 2: Create an elite viral video prompt via Claude Haiku
    console.log('[Content] Step 2: Creating elite video prompt...');
    const videoPromptRaw = await callClaude({
      system: `Tu es le meilleur créateur de vidéos virales pour les réseaux sociaux. Tu convertis des briefs marketing en prompts vidéo EXCEPTIONNELS pour Seedance AI.

RÈGLES POUR UN PROMPT VIDÉO VIRAL :
- Décris une SCÈNE UNIQUE avec du MOUVEMENT captivant (pas statique)
- Inclus des MOUVEMENTS DE CAMÉRA (dolly in, pan, tracking shot, drone aerial)
- Lumière cinématique : golden hour, néons, rétro-éclairage dramatique
- Émotions fortes : surprise, satisfaction, émerveillement
- Style : ultra réaliste 4K cinématique, profondeur de champ
- JAMAIS de texte, lettres, mots, logos dans la vidéo
- Max 200 caractères, EN ANGLAIS uniquement
- Le prompt doit donner une vidéo qui ARRÊTE le scroll

Output UNIQUEMENT le prompt vidéo, rien d'autre.`,
      message: `Brief marketing: ${visualDescription}\nCaption: ${caption}`,
      maxTokens: 200,
    });

    const videoPrompt = (videoPromptRaw || visualDescription).substring(0, 250);
    console.log(`[Content] Video prompt: "${videoPrompt.substring(0, 100)}..."`);

    // ── Pre-flight validator — économise ~0,30 €/clip sur prompt cassé.
    try {
      const { validateVideoPrompt } = await import('@/lib/validators');
      const v = validateVideoPrompt(videoPrompt, { duration, format });
      if (v.severity === 'block') {
        console.warn(`[Content] Video prompt BLOCKED (q=${v.quality_score}): ${v.findings.map(f => f.code).join(', ')}`);
        return { videoUrl: null, coverUrl: imageUrl };
      }
      if (v.severity === 'warn') {
        console.log(`[Content] Video prompt warnings (q=${v.quality_score}): ${v.findings.map(f => f.code).join(', ')}`);
      }
    } catch { /* validator failure must not block hot path */ }

    // ═══ PROVIDER ORDER: Kling primary, Seedance fallback ═══
    // To swap on 2026-03-24: move Seedance block above Kling block

    // Step 3: Try Kling T2V first (primary)
    console.log('[Content] Step 3: Calling Kling T2V API (primary)...');
    let videoUrl: string | null = null;
    const apiKey = process.env.SEEDREAM_API_KEY || SEEDREAM_API_KEY;

    try {
      // Kling supports '5' and '10' second durations
      const klingDuration = duration >= 10 ? '10' : '5';
      const klingTaskId = await createT2VTask({
        prompt: videoPrompt,
        duration: klingDuration,
        aspect_ratio: '9:16',
      });
      console.log(`[Content] Kling T2V task created: ${klingTaskId} (${klingDuration}s)`);

      const maxWaitK = 180_000;
      const pollIntervalK = 8_000;
      const startK = Date.now();

      while (Date.now() - startK < maxWaitK) {
        await new Promise(r => setTimeout(r, pollIntervalK));
        const result = await checkT2VTask(klingTaskId);
        if (result.status === 'completed' && result.videoUrl) {
          videoUrl = result.videoUrl;
          console.log(`[Content] Kling T2V completed: ${videoUrl.substring(0, 80)}...`);
          // 2026-06-09 — log cost
          try {
            const { logApiCost, PROVIDER_EUR } = await import('@/lib/admin/api-cost-logger');
            const cost = duration >= 10 ? PROVIDER_EUR.kling_10s : PROVIDER_EUR.kling_5s;
            logApiCost({
              provider: 'kling',
              kind: duration >= 10 ? 'video_10s' : 'video_5s',
              units: 1,
              cost_eur: cost,
              agent: 'content',
              metadata: { duration, taskId: klingTaskId },
            }).catch(() => {});
          } catch { /* silent */ }
          break;
        }
        if (result.status === 'failed') {
          console.error(`[Content] Kling T2V failed: ${result.error}`);
          break;
        }
        console.log(`[Content] Kling T2V polling... status: ${result.status}`);
      }

      if (!videoUrl && Date.now() - startK >= maxWaitK) {
        console.error('[Content] Kling T2V timeout after 3 minutes');
      }
    } catch (klingErr: any) {
      console.warn('[Content] Kling T2V failed:', klingErr.message);
    }

    // Step 4: If Kling failed, fallback to Seedance T2V
    if (!videoUrl) {
      console.log('[Content] Kling failed — falling back to Seedance T2V...');
      try {
        const seedanceDur = Math.min(duration, 10); // Seedance max ~10s per segment
        const formattedPrompt = `${videoPrompt} --camerafixed false --duration ${seedanceDur}`;
        const seedanceRes = await fetch(SEEDANCE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'seedance-1-5-pro-251215',
            content: [{ type: 'text', text: formattedPrompt }],
          }),
        });

        if (!seedanceRes.ok) {
          const errText = await seedanceRes.text().catch(() => '');
          throw new Error(`Seedance HTTP ${seedanceRes.status}: ${errText.substring(0, 200)}`);
        }

        const seedanceData = await seedanceRes.json();
        const taskId = seedanceData.id || seedanceData.task_id || seedanceData.data?.id || seedanceData.data?.task_id;
        if (!taskId) throw new Error('Seedance returned no task ID');

        console.log(`[Content] Seedance fallback task created: ${taskId}`);

        const maxWaitS = 240_000;
        const pollIntervalS = 10_000;
        const startS = Date.now();

        while (Date.now() - startS < maxWaitS) {
          await new Promise(r => setTimeout(r, pollIntervalS));
          const statusRes = await fetch(`${SEEDANCE_API_URL}/${taskId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` },
          });
          if (!statusRes.ok) { console.warn(`[Content] Seedance status error: ${statusRes.status}`); continue; }

          const statusData = await statusRes.json();
          const status = statusData.status || statusData.data?.status || statusData.state || statusData.data?.state;

          if (status === 'succeeded' || status === 'completed' || status === 'success' || status === 'done') {
            videoUrl = extractSeedanceVideoUrl(statusData);
            if (videoUrl) {
              console.log(`[Content] Seedance T2V completed: ${videoUrl.substring(0, 80)}...`);
            } else {
              console.warn('[Content] Seedance completed but no video URL');
            }
            break;
          }
          if (status === 'failed' || status === 'error' || status === 'cancelled') {
            console.error(`[Content] Seedance T2V failed: ${statusData.error || status}`);
            break;
          }
          console.log(`[Content] Seedance polling... status: ${status}`);
        }
      } catch (seedanceErr: any) {
        console.warn('[Content] Seedance T2V also failed:', seedanceErr.message);
      }
    }

    // Step 5: Cache the video to Supabase Storage for permanent URL
    if (videoUrl) {
      const videoId = `reel-${Date.now()}`;
      const cachedUrl = await cacheVideoToStorage(videoUrl, videoId);
      const finalUrl = cachedUrl || videoUrl;
      console.log(`[Content] === VIDEO PIPELINE COMPLETE: ${finalUrl.substring(0, 80)} ===`);
      return { videoUrl: finalUrl, coverUrl: imageUrl };
    }

    // Video generation failed entirely — return cover image anyway
    console.warn('[Content] Video generation failed (both Seedance + Kling) — returning cover only');
    return { videoUrl: null, coverUrl: imageUrl };
  } catch (e: any) {
    console.error('[Content] Video pipeline error:', e.message);
    return { videoUrl: null, coverUrl: null };
  }
}

// ──────────────────────────────────────
// Publish to TikTok (ALWAYS as video — photo API not supported)
// ──────────────────────────────────────
async function publishToTikTok(
  post: { id?: string; format?: string; caption?: string; hashtags?: string[]; visual_url?: string; video_url?: string },
  supabase: any
): Promise<{ success: boolean; publish_id?: string; error?: string; unaudited?: boolean }> {
  // ─── ATOMIC CLAIM ─── same pattern as publishToInstagram so two
  // concurrent crons can't publish the same TikTok row twice.
  if (post.id) {
    try {
      const { data: claimed } = await supabase
        .from('content_calendar')
        .update({ status: 'publishing', updated_at: new Date().toISOString() })
        .eq('id', post.id)
        .in('status', ['approved', 'draft', 'publish_failed', 'retry_pending'])
        .select('id')
        .maybeSingle();
      if (!claimed) {
        const { data: current } = await supabase
          .from('content_calendar')
          .select('status, tiktok_publish_id')
          .eq('id', post.id)
          .maybeSingle();
        if (current?.status === 'published') {
          return { success: true, publish_id: current?.tiktok_publish_id || undefined };
        }
        if (current?.status === 'publishing') return { success: true };
        return { success: false, error: 'already_claimed_by_another_process' };
      }
    } catch { /* DB blip — continue */ }
  }
  const releaseTtClaim = async () => {
    if (!post.id) return;
    try {
      await supabase.from('content_calendar')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', post.id)
        .eq('status', 'publishing');
    } catch { /* best-effort */ }
  };
  try {
    // 2026-06-04 — Multi-tenant : use the POST OWNER's TikTok tokens,
    // not the admin's. Founder caught this : the founder's account is
    // NOT admin (is_admin=false). He connected TikTok on his client
    // profile, but publishToTikTok was querying .eq('is_admin', true)
    // → wrong row OR null → "tiktok_not_connected" → no publish.
    //
    // Falls back to admin profile only if the post has no user_id
    // (legacy admin-tooling path).
    const ownerId: string | null = (post as any).user_id || null;
    const profileQuery = ownerId
      ? supabase.from('profiles')
          .select('tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry, tiktok_user_id')
          .eq('id', ownerId)
          .maybeSingle()
      : supabase.from('profiles')
          .select('tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry, tiktok_user_id')
          .eq('is_admin', true)
          .limit(1)
          .maybeSingle();
    const { data: ownerProfile, error: profileError } = await profileQuery;

    if (profileError || !ownerProfile) {
      console.error(`[Content] No TikTok profile for owner ${ownerId || 'admin'}`);
      await releaseTtClaim();
      return { success: false, error: 'No TikTok profile found' };
    }

    let accessToken = ownerProfile.tiktok_access_token;
    const refreshToken = ownerProfile.tiktok_refresh_token;

    if (!accessToken || !refreshToken) {
      // Not configured → silently skip (not a real error). The cron keeps
      // running normally, the admin can connect TikTok later. Prevents the
      // "error_escalated_publish_tiktok" noise in every cron log cycle.
      await releaseTtClaim();
      return { success: false, error: 'tiktok_not_connected', unaudited: true };
    }

    // Refresh token if expired
    const tokenExpiry = ownerProfile.tiktok_token_expiry ? new Date(ownerProfile.tiktok_token_expiry) : null;
    if (!tokenExpiry || tokenExpiry <= new Date()) {
      console.log('[Content] TikTok token expired, refreshing...');
      try {
        const clientKey = process.env.TIKTOK_CLIENT_KEY || process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
        const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
        if (!clientKey || !clientSecret) {
          await releaseTtClaim();
          return { success: false, error: 'TIKTOK_CLIENT_KEY/SECRET not configured' };
        }
        const refreshed = await refreshTikTokToken(refreshToken, clientKey, clientSecret);
        accessToken = refreshed.access_token;
        // Update tokens in DB — on the SAME profile we read from
        // (post owner if set, else admin). Previously this UPDATE was
        // always targeting is_admin=true even when the read used the
        // founder/client profile, so multi-tenant refreshes silently
        // overwrote the admin row.
        const updateQuery = ownerId
          ? supabase.from('profiles').update({
              tiktok_access_token: refreshed.access_token,
              tiktok_refresh_token: refreshed.refresh_token,
              tiktok_token_expiry: new Date(Date.now() + (refreshed.expires_in || 86400) * 1000).toISOString(),
            }).eq('id', ownerId)
          : supabase.from('profiles').update({
              tiktok_access_token: refreshed.access_token,
              tiktok_refresh_token: refreshed.refresh_token,
              tiktok_token_expiry: new Date(Date.now() + (refreshed.expires_in || 86400) * 1000).toISOString(),
            }).eq('is_admin', true);
        await updateQuery;
        console.log(`[Content] TikTok token refreshed successfully for ${ownerId || 'admin'}`);
      } catch (refreshError: any) {
        console.error('[Content] TikTok token refresh failed:', refreshError.message);
        // 2026-06-04 — Log the failure so token-lifecycle cron can
        // detect "refresh broken" and email the client to reconnect.
        try {
          await supabase.from('agent_logs').insert({
            agent: 'content',
            action: 'tiktok_token_refresh_failed',
            status: 'error',
            error_message: (refreshError.message || '').substring(0, 500),
            user_id: (post as any).user_id || null,
            data: { error: refreshError.message, refresh_token_present: !!refreshToken },
            created_at: new Date().toISOString(),
          });
        } catch { /* logging best-effort */ }
        // 2026-06-05 — Founder ask: "quand le token est expiré force
        // directement la deconnexion stp sur keiro comme ca le client
        // doit juste se reconnecter direct". On NULL les 3 champs
        // tiktok_* du profil propriétaire pour que l'UI affiche
        // "non connecté" + bouton reconnect.
        const ownerForCleanup = (post as any).user_id || ownerId;
        if (ownerForCleanup) {
          try {
            await supabase
              .from('profiles')
              .update({
                tiktok_access_token: null,
                tiktok_refresh_token: null,
                tiktok_token_expiry: null,
              })
              .eq('id', ownerForCleanup);
            console.log(`[Content] Force-disconnected TikTok for ${ownerForCleanup} (refresh broken)`);
          } catch (cleanupErr: any) {
            console.warn('[Content] force-disconnect cleanup failed:', cleanupErr?.message);
          }
        }
        // 2026-06-05 — Founder ask: au moment de l'erreur, on email
        // LE CLIENT concerné (pas l'admin) pour qu'il reconnecte. Le
        // post_id est queue'é dans agent_logs.tiktok_post_pending_reauth
        // pour qu'on le relance après reconnect OAuth.
        try {
          const { notifyClientTikTokReauth } = await import('@/lib/agents/tiktok-reauth-mailer');
          if (ownerForCleanup && post.id) {
            await notifyClientTikTokReauth(supabase, ownerForCleanup, post.id, `refresh_failed: ${refreshError.message?.substring(0, 100)}`);
          }
        } catch (mailErr: any) {
          console.warn('[Content] notifyClientTikTokReauth threw:', mailErr?.message);
        }
        await releaseTtClaim();
        return { success: false, error: `Token refresh failed: ${refreshError.message}` };
      }
    }

    let hashtagsArr = Array.isArray(post.hashtags) ? post.hashtags : [];
    let rawCaptionTT = (post.caption || '').trim();

    // 2026-06-03 — Pre-publish guardrails for TikTok. Catches downrank
    // terms (covid cure / 5g danger / etc.), > 6 hashtags, foreign IG
    // watermark URLs. Blocked posts return to 'draft' for review.
    try {
      const { checkPublishGuardrails, logGuardrails } = await import('@/lib/moderation/content-guardrails');
      const gr = await checkPublishGuardrails({
        platform: 'tiktok',
        caption: rawCaptionTT,
        hashtags: hashtagsArr,
        videoUrl: post.video_url,
        visualSource: (post as any).visual_source || 'ai_generated',
      });
      // We don't have userId in this scope — pull from post if set
      const ownerId = (post as any).user_id || null;
      if (ownerId && post.id) {
        await logGuardrails(supabase, ownerId, post.id, gr, 'tiktok');
      }
      if (!gr.ok) {
        console.warn(`[Content] Guardrails BLOCKED TikTok publish for ${post.id}: ${gr.blocked.join(' | ')}`);
        if (post.id) {
          await supabase
            .from('content_calendar')
            .update({
              status: 'draft',
              publish_diagnostic: `guardrails: ${gr.blocked.join(' | ')}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', post.id);
        }
        await releaseTtClaim();
        return { success: false, error: `Guardrails: ${gr.blocked[0]}` };
      }
      rawCaptionTT = gr.sanitized.caption;
      hashtagsArr = gr.sanitized.hashtags;
    } catch (e: any) {
      console.warn('[Content] Guardrails check failed (non-blocking):', e?.message);
    }

    // 2026-06-06 — Platform isolation defensive sanitizer.
    // Founder caught regression: a batch of TikTok posts re-launched after
    // reconnect contained "Instagram"/"feed Insta" mentions — they were
    // generated weeks ago before the isolation rule shipped, then went out
    // verbatim when the catch-up cron flipped them to approved. We scrub
    // cross-platform mentions HERE at the publish gate so any path that
    // bypasses fresh LLM generation still ships clean copy.
    rawCaptionTT = sanitizePlatformMentions(rawCaptionTT, 'tiktok');
    hashtagsArr = hashtagsArr.filter((h: string) => !/(instagram|insta|linkedin|facebook|fb_)/i.test(String(h)));
    // Optimise pour le reach TikTok : garantit des tags de découverte + niche.
    hashtagsArr = optimizeTikTokHashtags(hashtagsArr);
    const hashtagLineTT = hashtagsArr.length > 0 ? hashtagsArr.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(' ') : '';
    const fullCaption = rawCaptionTT + (hashtagLineTT ? '\n\n' + hashtagLineTT : '');

    // TikTok: publish as VIDEO or PHOTO depending on content
    // Priority: 1) existing video_url → video, 2) image with photo-friendly format → photo, 3) generate video
    let videoUrl = post.video_url;
    const visualUrl = post.visual_url;
    const format = (post.format || '').toLowerCase();

    // Decide: photo or video?
    // Video formats always get video; photo/carousel/static formats can use photo
    const isVideoFormat = format.includes('reel') || format.includes('vidéo') || format.includes('video');
    const hasVideo = !!videoUrl;
    const hasImage = !!visualUrl;

    // Vary between photo and video: if no video exists and format isn't video-specific, publish as photo
    if (!hasVideo && hasImage && !isVideoFormat) {
      console.log(`[Content] TikTok: publishing as PHOTO (format: ${format}, has image: ${hasImage})`);
      // 2026-06-10 — Founder rule: TikTok PHOTO publications MUST be a
      // carousel of AT LEAST 2 coherent images. A single-photo TT post
      // still shows the carousel icon in the feed which felt broken
      // (user reported "icone caroussel mais 1 seule photo"). We build a
      // narrative companion using LLM slides[] when available, falling
      // back to a single semantic variation if not. If the companion
      // generation fails we still publish the single photo (better than
      // skipping the post entirely).
      const tiktokPhotoUrls: string[] = [visualUrl!];
      const baseDescTT = (post as any).visual_description || (post as any).hook || (post as any).caption || 'premium product';
      const ttSlides: Array<{ visual?: string; text?: string; style?: string }> = Array.isArray((post as any).slides) ? (post as any).slides : [];
      const ttSlidesToUse = ttSlides.slice(1, 5); // TikTok feels best with 2-5 photos
      if (ttSlidesToUse.length > 0) {
        console.log(`[Content] TikTok carousel: using ${ttSlidesToUse.length} per-slide visuals from LLM`);
        for (const s of ttSlidesToUse) {
          const slideDesc = s.visual?.trim();
          if (!slideDesc) continue;
          try {
            const varUrl = await generateVisual(slideDesc, 'carrousel');
            if (varUrl) tiktokPhotoUrls.push(varUrl);
          } catch { /* skip slide on error */ }
        }
      }
      if (tiktokPhotoUrls.length === 1) {
        // Generate 1 narrative companion (TikTok min for a true carousel
        // feeling). Keep it cheap — 1 extra image only, not 3.
        const companion = `${baseDescTT}. CARROUSEL SLIDE 2 — visuellement complémentaire de slide 1: si slide 1 est un plan large, ce slide est un détail (close-up sur un geste, une texture, une expression authentique). Si slide 1 montre un produit, ce slide montre le moment où le client en profite. Même univers, même lumière naturelle, même palette, mais nouveau cadrage et nouvelle énergie. Photographie éditoriale, peau réelle, NO AI tells, NO repeated subject framing.`;
        try {
          const varUrl = await generateVisual(companion, 'carrousel');
          if (varUrl) tiktokPhotoUrls.push(varUrl);
        } catch { /* skip on error */ }
      }
      console.log(`[Content] TikTok PHOTO carousel: publishing ${tiktokPhotoUrls.length} image(s)`);
      try {
        const result = await initTikTokPhotoUpload(
          accessToken,
          tiktokPhotoUrls,
          fullCaption.substring(0, 2200),
        );
        // 2026-06-03 — Draft submissions (TikTok inbox, MEDIA_UPLOAD
        // fallback) MUST NOT be reported as 'published'. Mark the
        // calendar row as needing-manual-finalize so the founder/client
        // sees it never went live.
        if (result.is_draft) {
          console.warn(`[Content] TikTok PHOTO submitted as DRAFT (needs manual finalize): ${result.publish_id}`);
          if (post.id) {
            try {
              await supabase
                .from('content_calendar')
                .update({
                  status: 'awaiting_manual_publish',
                  publish_diagnostic: 'tiktok_direct_post refusé (app non-audited) — finalise dans l\'app TikTok.',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', post.id);
            } catch { /* best-effort */ }
          }
          await releaseTtClaim();
          return { success: false, error: 'tiktok_draft_needs_manual_finalize', publish_id: result.publish_id };
        }
        console.log(`[Content] TikTok PHOTO published LIVE: ${result.publish_id}`);
        return { success: true, publish_id: result.publish_id };
      } catch (photoErr: any) {
        console.warn('[Content] TikTok photo publish failed, falling back to video:', photoErr.message);
        // Fall through to video generation
      }
    }

    // Video path
    if (!videoUrl) {
      const visualDesc = (post as any).visual_description || post.caption || 'Professional marketing content for local business';
      console.log('[Content] TikTok: no video_url — generating via Seedance/Kling T2V...');
      videoUrl = await generateTikTokVideo(visualDesc) || undefined;
    }

    if (!videoUrl) {
      // Last resort: try photo if we have an image
      if (hasImage) {
        console.log('[Content] TikTok: video generation failed, attempting photo (carousel) as last resort');
        // Same 2-photo carousel rule as primary photo path.
        const fallbackUrls: string[] = [visualUrl!];
        try {
          const companion = `${(post as any).visual_description || post.caption || 'premium product'}. CARROUSEL SLIDE 2 — visuellement complémentaire: cadrage opposé (détail vs large, geste vs scène), même lumière et même univers. Photographie éditoriale, NO AI tells.`;
          const varUrl = await generateVisual(companion, 'carrousel');
          if (varUrl) fallbackUrls.push(varUrl);
        } catch { /* keep single photo on companion failure */ }
        try {
          const result = await initTikTokPhotoUpload(accessToken, fallbackUrls, fullCaption.substring(0, 2200));
          if (result.is_draft) {
            await releaseTtClaim();
            return { success: false, error: 'tiktok_draft_needs_manual_finalize', publish_id: result.publish_id };
          }
          return { success: true, publish_id: result.publish_id };
        } catch (e: any) {
          await releaseTtClaim();
          return { success: false, error: `Both video and photo failed: ${e.message}` };
        }
      }
      await releaseTtClaim();
      return { success: false, error: 'No video or image available for TikTok publishing' };
    }

    // 2026-06-07 — Boost mode: video lands in user's TikTok INBOX (draft).
    // User opens the TikTok app, picks a CML trending sound, edits if
    // needed, and publishes. Strategic for max algo boost.
    const useDraft = (post as any).boost_mode === true;
    console.log(`[Content] Publishing TikTok VIDEO (${useDraft ? 'DRAFT/inbox' : 'DIRECT'}): ${videoUrl.substring(0, 60)}...`);
    const result = await publishTikTokVideoViaFileUpload(
      accessToken,
      videoUrl,
      fullCaption.substring(0, 2200),
      { privacy_level: 'PUBLIC_TO_EVERYONE', draft: useDraft }
    );
    if (result.is_draft) {
      console.log(`[Content] TikTok video sent to INBOX: ${result.publish_id}`);
      return { success: true, publish_id: result.publish_id, is_draft: true } as any;
    }
    console.log(`[Content] TikTok video published: ${result.publish_id}`);
    return { success: true, publish_id: result.publish_id };
  } catch (error: any) {
    const msg = error.message || 'Unknown TikTok publishing error';
    console.error('[Content] TikTok publish error:', msg);

    // Detect unaudited app — don't retry, just flag clearly
    if (msg.includes('unaudited_client')) {
      return {
        success: false,
        error: 'TikTok Content Posting API non audité. Soumettez App Review sur developers.tiktok.com pour activer la publication.',
        unaudited: true,
      };
    }

    await releaseTtClaim();
    return { success: false, error: msg };
  }
}

// ──────────────────────────────────────
// GET: Cron — generate daily post OR weekly plan
// ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const { authorized, isCron } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY non configurée' }, { status: 500 });
  }

  const orgId = request.nextUrl.searchParams.get('org_id') || null;
  let userId = request.nextUrl.searchParams.get('user_id') || null;
  // Fallback: get userId from session if not in URL (client direct calls)
  if (!userId) {
    try { const { user } = await getAuthUser(); if (user) userId = user.id; } catch {}
  }
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...

  // ── Load client settings from org_agent_configs (if per-client call) ──
  let clientSettings: Record<string, any> = {};
  if (userId) {
    try {
      const { data: cfg } = await supabase
        .from('org_agent_configs')
        .select('config')
        .eq('user_id', userId)
        .eq('agent_id', 'content')
        .maybeSingle();
      if (cfg?.config) clientSettings = cfg.config;
    } catch {}
  }

  try {
    // Check if there's already a post for today (filter by user_id if per-client)
    let todayQuery = supabase
      .from('content_calendar')
      .select('id, platform, format, status')
      .eq('scheduled_date', todayStr);
    if (userId) todayQuery = todayQuery.eq('user_id', userId);
    const { data: todayPosts } = await todayQuery;

    // Check slot param for midday/evening content
    const slot = request.nextUrl.searchParams.get('slot');

    // If no post for today, generate one on the fly
    if (!todayPosts || todayPosts.length === 0) {
      console.log('[Content] No posts for today — generating one now');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, undefined, undefined, orgId, userId, clientSettings);
    }

    // Auto-publish: only 1 post per slot to spread publications throughout the day
    // Each content slot (morning, midday, evening) publishes max 1 post, avoiding 3 at once
    // Publish mode: 'auto' = publish immediately, 'notify' = send email notification first (draft→notify→approve→publish)
    // Read publish_mode from URL param (cron) or from stored admin preference
    let publishMode = request.nextUrl.searchParams.get('publish_mode') || 'auto';
    if (publishMode === 'auto') {
      // Check if admin has set notify preference in agent_logs config
      const { data: modeConfig } = await supabase
        .from('agent_logs')
        .select('data')
        .eq('agent', 'content')
        .eq('action', 'publish_mode_config')
        .order('created_at', { ascending: false })
        .limit(1);
      if (modeConfig?.[0]?.data?.publish_mode === 'notify') {
        publishMode = 'notify';
      }
    }

    // Per-client autonomy toggle (Léna's planning tab → org_agent_configs,
    // agent_id='content'). When the client has turned a network's auto-publish
    // OFF, scheduled posts on that network must NOT silently auto-publish —
    // they go to validation (notify → pending_approval, validated 1-by-1).
    // We ONLY honour the toggle when a config row exists: clients who never
    // opened the settings keep the legacy auto behaviour (no surprise flip).
    let clientAutoByNetwork: Record<string, boolean> | null = null;
    if (userId) {
      const { data: cfgRows } = await supabase
        .from('org_agent_configs')
        .select('config, created_at')
        .eq('user_id', userId)
        .eq('agent_id', 'content')
        .order('created_at', { ascending: false })
        .limit(1);
      const cfg = cfgRows?.[0]?.config;
      if (cfg) {
        clientAutoByNetwork = {
          instagram: cfg.auto_mode_instagram ?? cfg.auto_mode ?? false,
          tiktok: cfg.auto_mode_tiktok ?? cfg.auto_mode ?? false,
          linkedin: cfg.auto_mode_linkedin ?? cfg.auto_mode ?? false,
        };
      }
    }
    // Resolve the effective publish mode for a given post platform: admin
    // 'notify' always wins; otherwise the client's per-network toggle decides;
    // no client config → fall back to the existing default.
    const resolvePublishMode = (platform: string): string => {
      if (publishMode === 'notify') return 'notify';
      if (clientAutoByNetwork) {
        const on = clientAutoByNetwork[(platform || 'instagram').toLowerCase()] ?? false;
        return on ? 'auto' : 'notify';
      }
      return publishMode;
    };

    const unpublished = todayPosts.filter((p: any) => p.status === 'draft' || p.status === 'approved');
    const maxPublishPerSlot = slot === 'tiktok' ? 2 : 1; // TikTok slot can do 2 (video + photo)

    // Spacing guard — minimum gap between two publications on the SAME
    // platform for the SAME user. Founder spotted 2026-05-24 that two
    // Instagram posts went out at 07:03:15 and 07:03:19 (4 seconds
    // apart) because two publication paths (this slot loop +
    // execute_publication backlog) fired in the same cron tick. Pro
    // plan baseline is 1 Instagram post per day — and even when bumped,
    // never two within hours. We cap at 1 publication / 4h / platform.
    const MIN_GAP_HOURS_BETWEEN_PUBLISH = 4;
    // 2026-06-09 — Stories (IG) and Photo Mode (TT) bypass the 4h gap.
    // They are ephemeral content that lives alongside feed posts, not in
    // competition with them. Blocking a story because a feed post just
    // went live would kill the new library-recycle strategy.
    async function recentlyPublishedSamePlatform(platform: string, uid: string | null, currentFormat?: string): Promise<boolean> {
      if (!uid) return false;
      const fmt = (currentFormat || '').toLowerCase();
      if (fmt === 'story' || fmt === 'photo') return false;
      const since = new Date(Date.now() - MIN_GAP_HOURS_BETWEEN_PUBLISH * 3600 * 1000).toISOString();
      const { count } = await supabase
        .from('content_calendar')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('platform', platform)
        .eq('status', 'published')
        .not('format', 'in', '(story,photo)')
        .gte('published_at', since);
      return (count || 0) > 0;
    }

    if (unpublished.length > 0 && isCron) {
      console.log(`[Content] ${unpublished.length} unpublished posts for today — mode=${publishMode}, max ${maxPublishPerSlot} for slot: ${slot || 'default'}`);
      let published = 0;
      let notified = 0;
      for (const post of unpublished.slice(0, maxPublishPerSlot)) {
        try {
          // Spacing guard — skip if another post on the same platform
          // was published within the last 4h. Prevents the double-shot
          // scenario the founder reported (two IG posts 4 seconds apart).
          const postPlatform = (post as any).platform || 'instagram';
          const slotFormat = (post as any).format || '';
          if (await recentlyPublishedSamePlatform(postPlatform, userId, slotFormat)) {
            console.warn(`[Content] Spacing guard: skipping post ${post.id} on ${postPlatform} — already published within 4h.`);
            continue;
          }

          // 2026-06-09 — Plan cadence cap. Respecte PLAN_DAILY_PUBLISH
          // (avec plan_override per-agent si défini). Bloque le publish
          // si on dépasse la cadence quotidienne ou hebdo du plan.
          try {
            const { resolveEffectivePlan, PLAN_DAILY_PUBLISH, countPublishedToday, countPublishedThisWeek } = await import('@/lib/credits/plan-budget-guard');
            const effectivePlan = await resolveEffectivePlan(supabase, userId || '', 'content');
            const cadence = PLAN_DAILY_PUBLISH[effectivePlan] || PLAN_DAILY_PUBLISH.free;
            const fmt = slotFormat.toLowerCase();
            // Stories / Photo Mode: cap stories_X
            if (fmt === 'story' || fmt === 'photo') {
              const cap = postPlatform === 'instagram' ? cadence.stories_ig : cadence.stories_tt;
              const used = await countPublishedToday(supabase, userId || '', postPlatform, ['story','photo']);
              if (used >= cap) {
                console.warn(`[Content] Cadence cap: ${postPlatform} ${fmt} ${used}/${cap} (plan ${effectivePlan}) — skip post ${post.id}.`);
                await supabase.from('content_calendar').update({ status: 'skipped', qa_notes: `cadence_cap_reached:${effectivePlan}:${postPlatform}_${fmt}_${used}/${cap}` }).eq('id', post.id);
                continue;
              }
            } else {
              // Feed content: cap by platform quota + weekly video/reel cap
              const feedFormats = ['post','image','carrousel','reel','video','text'];
              const usedFeed = await countPublishedToday(supabase, userId || '', postPlatform, feedFormats);
              const feedCap = postPlatform === 'instagram' ? cadence.ig : postPlatform === 'tiktok' ? cadence.tt : cadence.li;
              if (usedFeed >= feedCap) {
                console.warn(`[Content] Cadence cap: ${postPlatform} feed ${usedFeed}/${feedCap} (plan ${effectivePlan}) — skip post ${post.id}.`);
                await supabase.from('content_calendar').update({ status: 'skipped', qa_notes: `cadence_cap_reached:${effectivePlan}:${postPlatform}_feed_${usedFeed}/${feedCap}` }).eq('id', post.id);
                continue;
              }
              // Weekly cap on expensive video/reel
              if (fmt === 'reel' || fmt === 'video') {
                const usedWeek = await countPublishedThisWeek(supabase, userId || '', postPlatform, ['reel','video']);
                const weekCap = postPlatform === 'instagram' ? cadence.ig_reels_per_week : cadence.tt_videos_per_week;
                if (usedWeek >= weekCap) {
                  console.warn(`[Content] Weekly video cap: ${postPlatform} ${fmt} ${usedWeek}/${weekCap}/sem (plan ${effectivePlan}) — downgrade to image post ${post.id}.`);
                  // Downgrade reel → image post au lieu de skip
                  await supabase.from('content_calendar').update({ format: postPlatform === 'tiktok' ? 'photo' : 'post', qa_notes: `weekly_video_cap_reached:${effectivePlan}:${usedWeek}/${weekCap}` }).eq('id', post.id);
                  // Continue with the updated format
                }
              }
            }
          } catch (cadenceErr: any) {
            console.warn('[Content] cadence cap check failed (non-blocking):', cadenceErr?.message);
          }
          // If notify mode and post is draft (not yet approved), send notification instead of publishing.
          // Mode is resolved per-platform from the client's auto-publish toggle.
          let postPublishMode = resolvePublishMode(postPlatform);
          // QA gate (brief v3 Section 3): brand-kit-grounded checks on the post
          // text BEFORE auto-publish (prix hors kit, promo invalide, sujet
          // interdit, orthographe). A failed gate routes the post to validation —
          // never bypassed by the auto toggle. Supersedes the interim price guard.
          if (postPublishMode === 'auto' && post.status === 'draft' && userId) {
            try {
              const { data: pcap } = await supabase.from('content_calendar').select('caption, hook').eq('id', post.id).single();
              const gateText = `${pcap?.caption || ''} ${pcap?.hook || ''}`.trim();
              const verdict = await runPublishGate(supabase, { orgId: userId, agent: 'content', channel: postPlatform as any, text: gateText, lang: 'fr' });
              await logGateVerdict(supabase, userId, { agent: 'content', channel: postPlatform as any }, verdict, post.id);
              if (!verdict.pass) {
                postPublishMode = 'notify';
                await supabase.from('content_calendar')
                  .update({ qa_notes: 'QA gate: ' + verdict.violations.map(v => v.rule).join(', ') })
                  .eq('id', post.id);
                console.log(`[Content] QA gate FAIL post ${post.id}: ${verdict.violations.map(v => v.rule).join(',')} → validation`);
              }
            } catch { /* non-blocking */ }
          }
          if (postPublishMode === 'notify' && post.status === 'draft') {
            const { data: fullPostForNotify } = await supabase.from('content_calendar').select('*').eq('id', post.id).single();
            if (fullPostForNotify) {
              // Generate visual if missing (so notification has the preview)
              if (!fullPostForNotify.visual_url) {
                const desc = fullPostForNotify.visual_description || fullPostForNotify.hook || fullPostForNotify.caption;
                if (desc) {
                  const url = await generateVisual(desc, fullPostForNotify.format || 'post');
                  if (url) {
                    const cached = await cacheImageToStorage(url, post.id);
                    fullPostForNotify.visual_url = cached || url;
                    await supabase.from('content_calendar').update({ visual_url: fullPostForNotify.visual_url, updated_at: new Date().toISOString() }).eq('id', post.id);
                  }
                }
              }
              const sent = await sendPublishNotification(fullPostForNotify, supabase);
              if (sent) {
                await supabase.from('content_calendar').update({ status: 'pending_approval', updated_at: new Date().toISOString() }).eq('id', post.id);
                notified++;
                console.log(`[Content] Notification sent for post ${post.id} — awaiting approval`);
              }
            }
            continue;
          }
          const { data: fullPost } = await supabase.from('content_calendar').select('*').eq('id', post.id).single();
          if (!fullPost) continue;

          let visualUrl = fullPost.visual_url;

          // Generate visual if missing
          if (!visualUrl) {
            const visualDesc = fullPost.visual_description || fullPost.hook || fullPost.caption;
            if (!visualDesc) {
              console.warn(`[Content] Post ${post.id} has no visual and no description — skipping`);
              continue;
            }
            visualUrl = await generateVisual(visualDesc, fullPost.format || 'post');
            if (!visualUrl) {
              console.warn(`[Content] Visual generation failed for post ${post.id} — skipping`);
              continue;
            }
            const cachedUrl = await cacheImageToStorage(visualUrl, post.id);
            if (cachedUrl) visualUrl = cachedUrl;
            await supabase.from('content_calendar').update({ visual_url: visualUrl, updated_at: new Date().toISOString() }).eq('id', post.id);
          }

          // For reel/video formats: generate video if not already done
          const postFormat = (fullPost.format || 'post').toLowerCase();
          let videoUrl = fullPost.video_url || null;
          if ((postFormat === 'reel' || postFormat === 'video') && !videoUrl) {
            // 2026-06-09 — Plan-budget guard. Avant de générer une vidéo
            // Seedance (~0.30 €), vérifier que le client n'est pas en zone
            // RED de sa marge. Si oui, downgrade en image post (0.04 €).
            // Garantit la marge 80% côté serveur, indépendamment de la
            // pression de la cadence.
            let budgetAllowsVideo = true;
            try {
              const ownerId = (fullPost as any).user_id || null;
              if (ownerId) {
                const { estimateClientCostMtd, evaluateBudget, resolveEffectivePlan } = await import('@/lib/credits/plan-budget-guard');
                // 2026-06-09 — Plan override per-agent: Léna peut tourner
                // sur quotas Créateur même si le compte est Pro globalement.
                const planPlan = await resolveEffectivePlan(supabase, ownerId, 'content');
                const mtd = await estimateClientCostMtd(supabase, ownerId);
                const budget = evaluateBudget(planPlan, mtd);
                if (!budget.allow_expensive) {
                  budgetAllowsVideo = false;
                  console.warn(`[Content] BUDGET RED for ${ownerId.substring(0, 8)} (${budget.pct}% of ${budget.ceiling}€) — downgrading reel → post`);
                  await supabase.from('content_calendar').update({
                    format: 'post',
                    qa_notes: `Auto-downgrade reel→post (budget plan ${planPlan} at ${budget.pct}%)`,
                  }).eq('id', post.id);
                }
              }
            } catch (budgetErr: any) {
              console.warn('[Content] budget guard threw, allowing video:', budgetErr?.message);
            }

            if (budgetAllowsVideo) {
              console.log(`[Content] Auto-publish: ${postFormat} needs video — generating...`);
              const desc = fullPost.visual_description || fullPost.hook || fullPost.caption;
              if (desc) {
                const vidResult = await generateVideoWithNarration(desc, fullPost.caption || desc, postFormat, 5);
                videoUrl = vidResult.videoUrl;
                if (vidResult.coverUrl && !visualUrl) visualUrl = vidResult.coverUrl;
              }
              if (!videoUrl && visualUrl) {
                console.log(`[Content] Video failed for post ${post.id} — downgrading to image post`);
                await supabase.from('content_calendar').update({ format: 'post' }).eq('id', post.id);
              }
            }
          }

          // ── REEL QA ──
          // Sonnet keyframe review to catch nonsense actions (scissors
          // cutting empty air, melted faces, identity swaps). One call
          // per reel before we ship it to Instagram. hard_fail means we
          // downgrade to a still post and skip publishing the broken
          // reel. soft_fail logs but proceeds.
          if (videoUrl && (postFormat === 'reel' || postFormat === 'video')) {
            try {
              const { reviewGeneratedReel } = await import('@/lib/visuals/reel-qa');
              const qa = await reviewGeneratedReel({
                videoUrl,
                postId: post.id,
                visualBrief: fullPost.visual_description || fullPost.hook || '',
                businessType: clientSettings?.business_type || undefined,
                clientLanguage: (clientSettings as any)?.language || (clientSettings as any)?.brand_language || 'fr',
              });
              if (qa.verdict === 'hard_fail') {
                console.warn(`[Content] Reel QA HARD FAIL for ${post.id}: ${qa.issue}. Downgrading to still post.`);
                videoUrl = null;
                await supabase.from('content_calendar').update({
                  format: 'post',
                  publish_diagnostic: `reel_qa_hard_fail:${(qa.issue || 'unknown').substring(0, 100)}`,
                  updated_at: new Date().toISOString(),
                }).eq('id', post.id);
              } else if (qa.verdict === 'soft_fail') {
                console.warn(`[Content] Reel QA soft fail for ${post.id}: ${qa.issue} (proceeding)`);
                await supabase.from('content_calendar').update({
                  publish_diagnostic: `reel_qa_soft_fail:${(qa.issue || 'unknown').substring(0, 100)}`,
                }).eq('id', post.id);
              } else {
                console.log(`[Content] Reel QA pass for ${post.id}`);
              }
            } catch (qaErr: any) {
              console.warn('[Content] Reel QA non-fatal:', qaErr?.message);
            }
          }

          // 2026-06-07 — Boost mode now publishes via TikTok inbox/DRAFT
          // endpoint (publishToTikTok reads post.boost_mode and routes
          // automatically). We just send the prep notification here so
          // the client knows to open TikTok app and pick a CML sound.
          // The actual draft upload happens through publishToTikTok below.
          if ((fullPost as any).boost_mode === true && fullPost.platform === 'tiktok') {
            (async () => {
              try {
                const { data: ownerProfile } = await supabase
                  .from('profiles').select('email, first_name').eq('id', (fullPost as any).user_id).maybeSingle();
                if (ownerProfile?.email) {
                  const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
                  await sendEmailWithFallback({
                    to: ownerProfile.email,
                    toName: ownerProfile.first_name || 'toi',
                    subject: '🚀 Reel boost — direct dans ton app TikTok',
                    html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;">
                      <h2 style="color:#0c1a3a;margin:0 0 12px;">Salut ${ownerProfile.first_name || 'toi'} 👋</h2>
                      <p>Lena vient de déposer un reel en <strong>brouillon dans ton app TikTok</strong>. Pour 5-10× plus de portée, ajoute un son trending depuis la Commercial Music Library :</p>
                      <ol style="line-height:1.6;">
                        <li>Ouvre l'app TikTok</li>
                        <li>Boîte de réception (Inbox) → tu vois le draft Lena</li>
                        <li>« Ajouter un son » → onglet Commercial → choisis le trending qui matche</li>
                        <li>Publie ✓ (30 secondes)</li>
                      </ol>
                      <p style="font-size:13px;color:#64748b;">C'est la stratégie qu'utilisent les agences pour viraliser : le visuel est généré par Lena, le son tendance vient de TikTok. Légal et optimal pour l'algo.</p>
                    </div>`,
                    textContent: `Salut ${ownerProfile.first_name || 'toi'}, Lena vient de déposer un reel brouillon dans ton app TikTok (Inbox). Ouvre TikTok > Inbox > Ajoute un son trending depuis la CML > Publie. 30 sec pour 5-10× plus de portée.`,
                    fromName: 'KeiroAI Lena',
                    fromEmail: 'contact@keiroai.com',
                    tags: ['tiktok_boost_ready'],
                  });
                }
              } catch { /* notif best-effort */ }
            })();
          }

          // 2026-06-06 — Founder ask: planning toggle "Valider les publications"
          // (= auto_publish off). When off, we generate + queue but DO NOT
          // publish. Post stays as pending_approval so it appears in the
          // planning UI and the client can publish manually if they want.
          if ((clientSettings as any)?.auto_publish === false) {
            const skipFields: Record<string, any> = {
              updated_at: new Date().toISOString(),
              status: 'pending_approval',
            };
            if (videoUrl) skipFields.video_url = videoUrl;
            if (visualUrl) skipFields.visual_url = visualUrl;
            await supabase.from('content_calendar').update(skipFields).eq('id', post.id);
            console.log(`[Content] ${fullPost.platform} post ${post.id} held for manual validation (auto_publish=false)`);
            continue;
          }

          // 2026-06-07 — Pre-publish QA gate (ALL platforms IG/TT/LI).
          // Founder ask: "le control qualite doit etre sur tout les posts
          // insta et tiktok et linkedin pour s'assurer de ce qui est posté".
          // For videos → reviewGeneratedReel (3-keyframe Sonnet check).
          // For images/carousels → scoreVisualQuality (Sonnet still review).
          // hard_fail → block publish + log; soft_fail → log + ship.
          // Cost per post: ~€0.003 (Sonnet vision call).
          try {
            if (videoUrl && (fullPost.format === 'reel' || fullPost.format === 'video')) {
              const { reviewGeneratedReel } = await import('@/lib/visuals/reel-qa');
              const rqa = await reviewGeneratedReel({
                videoUrl,
                postId: post.id,
                visualBrief: fullPost.visual_description || fullPost.hook || '',
                businessType: clientSettings?.business_type || undefined,
              });
              console.log(`[Content] pre-publish reel QA: ${rqa.verdict} — ${rqa.issue || 'ok'}`);
              if (rqa.verdict === 'hard_fail') {
                await supabase.from('content_calendar').update({
                  status: 'publish_failed',
                  publish_diagnostic: `reel_qa_hard_fail:${(rqa.issue || 'unknown').substring(0, 120)}`,
                  updated_at: new Date().toISOString(),
                }).eq('id', post.id);
                console.warn(`[Content] BLOCK publish ${post.id} on ${fullPost.platform}: reel QA hard fail`);
                continue;
              }
            } else if (visualUrl) {
              const { scoreVisualQuality } = await import('@/lib/visuals/qa-check');
              const qaDesc = fullPost.visual_description || fullPost.hook || '';
              const fatalFlags = ['blurry_subject', 'out_of_focus'];
              const isBad = (s: any) => ((s.amateur_flags || []).some((f: string) => fatalFlags.includes(f)) || s.score <= 2);
              let sqa = await scoreVisualQuality(visualUrl, qaDesc, 'the intended subject of this post');
              console.log(`[Content] pre-publish visual QA: score=${sqa.score}/10 — flags=${(sqa.amateur_flags || []).join(',')}`);
              // 2026-06-12 — Founder rule "on doit publier qqch sans tuer les
              // marges". The QA used to mark publish_failed and GIVE UP. New
              // ladder (cost-bounded, always ships something good):
              //   1. ONE regeneration (max — €0.05, never an infinite loop)
              //   2. still bad → REUSE a proven top library visual (0 gen cost,
              //      already passed QA + has real engagement, on-brand)
              //   3. no library candidate (brand new client) → hold for validation
              if (isBad(sqa) && qaDesc) {
                console.warn(`[Content] visual QA fail (score=${sqa.score}) post ${post.id} — 1 régénération`);
                const regen = await generateVisual(qaDesc, fullPost.format || 'post', userId || undefined, fullPost.platform);
                if (regen) {
                  const cachedRegen = await cacheImageToStorage(regen, post.id);
                  visualUrl = cachedRegen || regen;
                  await supabase.from('content_calendar').update({ visual_url: visualUrl, updated_at: new Date().toISOString() }).eq('id', post.id);
                  sqa = await scoreVisualQuality(visualUrl, qaDesc, 'the intended subject of this post');
                  console.log(`[Content] re-QA after regen: score=${sqa.score}/10`);
                }
              }
              if (isBad(sqa) && userId) {
                let reused = false;
                try {
                  const { getReusableTopVisuals, markVisualReused } = await import('@/lib/visuals/visual-reuse');
                  const top = await getReusableTopVisuals(supabase, userId, { platform: fullPost.platform, format: fullPost.format, limit: 3 });
                  const candidate = (top || []).find((t: any) => t.visual_url && t.visual_url !== visualUrl);
                  if (candidate?.visual_url) {
                    visualUrl = candidate.visual_url;
                    await supabase.from('content_calendar').update({ visual_url: visualUrl, qa_notes: `visual_qa_low_score${sqa.score}_reused_library`, updated_at: new Date().toISOString() }).eq('id', post.id);
                    await markVisualReused(supabase, candidate.post_id, post.id).catch(() => {});
                    console.log(`[Content] visual QA low → reused top library visual for post ${post.id} (publishing, 0 gen cost)`);
                    reused = true;
                  }
                } catch (reuseErr: any) {
                  console.warn(`[Content] library reuse fallback failed: ${reuseErr?.message?.substring(0, 100)}`);
                }
                if (!reused) {
                  await supabase.from('content_calendar').update({
                    status: 'pending_approval',
                    visual_url: visualUrl,
                    qa_notes: `visual_qa: score=${sqa.score} flags=${(sqa.amateur_flags || []).join('|').substring(0, 60)} — pas de visuel librairie, à valider`,
                    updated_at: new Date().toISOString(),
                  }).eq('id', post.id);
                  console.warn(`[Content] HOLD post ${post.id} for validation: QA score=${sqa.score}, no library fallback`);
                  continue;
                }
              }
            }
          } catch (qaErr: any) {
            // QA threw — log but don't block (better to ship a possibly-OK
            // post than to silently halt the pipeline on a Sonnet hiccup).
            console.warn(`[Content] pre-publish QA threw (non-blocking): ${qaErr?.message?.substring(0, 120)}`);
          }

          // Publish to platform
          const postWithMedia = { ...fullPost, visual_url: visualUrl, video_url: videoUrl };
          const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };
          if (videoUrl) updateFields.video_url = videoUrl;
          let platformSuccess = false;

          if (fullPost.platform === 'instagram') {
            const igResult = await publishToInstagram(postWithMedia, supabase, orgId, userId);
            if (igResult.success) {
              if (igResult.permalink) updateFields.instagram_permalink = igResult.permalink;
              platformSuccess = true;
              console.log(`[Content] Instagram published for post ${post.id}: ${igResult.permalink || '(story — no permalink)'}`);

              // 2026-06-09 — Founder ask: "très peu de story avec agent
              // lena alors qu on a pas mal de biblioteque d'image et
              // reel en plus on peut mettre nouveau post pour faire
              // cliquer les gens dans la story faut une stratgie story
              // insta et tiktok qui s'integre a la stratgeie des publi".
              //
              // When a feed post (image, carrousel, reel) publishes
              // successfully on Instagram and the format isn't already
              // 'story', schedule an Instagram Story teaser ~45-90 min
              // later that says "Nouveau post" and drives clicks. Same
              // visual_url, status='approved' so the cron picks it up.
              if (fullPost.format !== 'story' && igResult.permalink) {
                try {
                  const delayMin = 45 + Math.floor(Math.random() * 45); // 45-90 min
                  const storyAt = new Date(Date.now() + delayMin * 60 * 1000);
                  const teaserCaption = (() => {
                    const variants = [
                      '🔔 Nouveau post — swipe up',
                      '✨ On vient de publier — tape pour voir',
                      '👉 Petit nouveau sur le feed',
                      '📌 Ne le manquez pas — c\'est en ligne',
                      '🔗 Lien direct vers le nouveau post',
                    ];
                    return variants[Math.floor(Math.random() * variants.length)];
                  })();
                  // Dedup guard: only ONE teaser story per parent post
                  // and not more than 1 IG story scheduled within 3h.
                  const { count: nearbyStories } = await supabase
                    .from('content_calendar')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', fullPost.user_id)
                    .eq('platform', 'instagram')
                    .eq('format', 'story')
                    .gte('scheduled_date', new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0]);
                  if ((nearbyStories || 0) === 0) {
                    await supabase.from('content_calendar').insert({
                      user_id: fullPost.user_id,
                      org_id: fullPost.org_id || null,
                      platform: 'instagram',
                      format: 'story',
                      hook: 'Nouveau post — story teaser',
                      caption: teaserCaption,
                      hashtags: [],
                      visual_url: fullPost.visual_url,
                      scheduled_date: storyAt.toISOString().split('T')[0],
                      scheduled_time: storyAt.toISOString(),
                      status: 'approved',
                      auto_publish: true,
                      pillar: fullPost.pillar || null,
                      source: 'new_post_story_teaser',
                      parent_post_id: post.id,
                    });
                    console.log(`[Content] Story teaser scheduled for post ${post.id} @ +${delayMin}min`);
                  } else {
                    console.log(`[Content] Story teaser skipped for ${post.id} — recent story already in queue`);
                  }
                } catch (storyErr: any) {
                  console.warn(`[Content] Story teaser scheduling failed for ${post.id}:`, storyErr?.message);
                }
              }
            } else if (igResult.error?.includes('Duplicate')) {
              // Duplicate detected — skip this post, don't retry
              updateFields.status = 'skipped';
              updateFields.notes = `Auto-skip: ${igResult.error}`;
              console.warn(`[Content] Duplicate post ${post.id} — auto-skipped`);
              await supabase.from('content_calendar').update(updateFields).eq('id', post.id);
              continue;
            } else {
              console.error(`[Content] Instagram publish FAILED for post ${post.id}: ${igResult.error}`);
              escalateAgentError({ agent: 'content', action: 'publish_instagram', error: igResult.error || 'Unknown IG error', platform: 'instagram', postId: post.id, context: `Hook: ${fullPost.hook?.substring(0, 80)}` }).catch(() => {});
            }
          } else if (fullPost.platform === 'tiktok') {
            const ttResult = await publishToTikTok(postWithMedia, supabase);
            if (ttResult.success && ttResult.publish_id) {
              updateFields.tiktok_publish_id = ttResult.publish_id;
              platformSuccess = true;
              console.log(`[Content] TikTok published for post ${post.id}: ${ttResult.publish_id}`);

              // 2026-06-09 — TikTok Photo Mode teaser (alternative aux
              // Stories deprecated 2024). On schedule un post Photo
              // Mode 6-10h plus tard avec le visual + 1 sticker
              // "Nouveau post" en caption. Drive le trafic vers le
              // reel TikTok publié.
              if (fullPost.format === 'video' || fullPost.format === 'reel') {
                try {
                  const delayHours = 6 + Math.floor(Math.random() * 4); // 6-10h
                  const teaserAt = new Date(Date.now() + delayHours * 60 * 60 * 1000);
                  const variants = [
                    '📌 Nouveau reel — link in bio ↑',
                    '👀 Tu l\'as vu ? Notre dernier reel',
                    '🔥 Reel du jour — swipe pour découvrir',
                  ];
                  const tCaption = variants[Math.floor(Math.random() * variants.length)];
                  // Dedup : skip si une autre TT photo mode est en queue dans les 12h
                  const { count: nearbyTtPhoto } = await supabase
                    .from('content_calendar')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', fullPost.user_id)
                    .eq('platform', 'tiktok')
                    .eq('format', 'photo')
                    .gte('scheduled_date', new Date(Date.now() - 12 * 3600 * 1000).toISOString().split('T')[0]);
                  if ((nearbyTtPhoto || 0) === 0) {
                    await supabase.from('content_calendar').insert({
                      user_id: fullPost.user_id,
                      org_id: fullPost.org_id || null,
                      platform: 'tiktok',
                      format: 'photo',
                      hook: 'TT Photo Mode teaser — nouveau reel',
                      caption: tCaption,
                      hashtags: ['#fyp', '#pourtoi', '#nouveau'],
                      visual_url: fullPost.visual_url || postWithMedia.visual_url,
                      scheduled_date: teaserAt.toISOString().split('T')[0],
                      scheduled_time: teaserAt.toISOString(),
                      status: 'approved',
                      auto_publish: true,
                      pillar: fullPost.pillar || null,
                      source: 'tt_photo_mode_teaser',
                      parent_post_id: post.id,
                    });
                    console.log(`[Content] TT Photo Mode teaser scheduled for ${post.id} @ +${delayHours}h`);
                  }
                } catch (ttPhotoErr: any) {
                  console.warn(`[Content] TT Photo Mode teaser failed for ${post.id}:`, ttPhotoErr?.message);
                }
              }

              // 2026-06-08 — Founder rule (lib/credits/constants.ts:67-68):
              // "1 génération = 2 publications". A TikTok reel can be
              // republished on Instagram, BUT:
              //   (a) NEVER same day — same content same day reads as
              //       lazy/spammy to followers who watch both networks.
              //   (b) Space the clone 3–5 days out, randomized so we
              //       don't create a detectable repost pattern.
              //   (c) Skip if the same client already has an Insta post
              //       (Lena-native or another clone) within ±48h of the
              //       target slot — keep variety between platforms.
              //   (d) Rewrite the hook/caption with a different angle:
              //       same asset, different framing, different platform
              //       conventions (no TikTok-specific phrasing).
              if (fullPost.format === 'video' || fullPost.format === 'reel') {
                try {
                  // Pick a random delay in days [3, 5] so the clone lands
                  // mid-week away from the TikTok burst.
                  const delayDays = 3 + Math.floor(Math.random() * 3); // 3, 4 or 5
                  const cloneScheduled = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000);
                  // Anchor at 18:30 local (good IG engagement window)
                  cloneScheduled.setHours(18, 30, 0, 0);
                  const cloneDateStr = cloneScheduled.toISOString().split('T')[0];

                  // Anti-pattern guard: skip clone if an Insta post is
                  // already planned ±2 days around the target slot for
                  // this user. We don't want consecutive Insta repeats.
                  const windowStart = new Date(cloneScheduled.getTime() - 2 * 86400000).toISOString().split('T')[0];
                  const windowEnd = new Date(cloneScheduled.getTime() + 2 * 86400000).toISOString().split('T')[0];
                  const { count: nearbyCount } = await supabase
                    .from('content_calendar')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', fullPost.user_id)
                    .eq('platform', 'instagram')
                    .gte('scheduled_date', windowStart)
                    .lte('scheduled_date', windowEnd);

                  if ((nearbyCount || 0) > 0) {
                    console.log(`[Content] Cross-post skipped for ${post.id}: Insta already planned ±2d around ${cloneDateStr}`);
                  } else {
                    // Rewrite caption: drop TikTok-specific markers, swap
                    // the hook angle. We keep the asset but reframe so the
                    // Insta audience doesn't see an obvious carbon copy.
                    const baseCaption = (fullPost.caption || '').trim();
                    const cleanedCaption = baseCaption
                      .replace(/#tiktok/gi, '')
                      .replace(/\b(tiktok|TikTok)\b/g, 'Instagram')
                      .replace(/\s+/g, ' ')
                      .trim();
                    // Try to vary the opening line on Insta — prepend a
                    // soft re-hook so the post doesn't feel identical to
                    // a viewer who saw the TikTok.
                    const igHookPrefix = (() => {
                      const variants = [
                        'On vous remontre — différemment.',
                        'Petit retour sur ce moment.',
                        'À garder en tête cette semaine.',
                        'Cliché qu\'on aime particulièrement.',
                      ];
                      return variants[Math.floor(Math.random() * variants.length)];
                    })();
                    const cloneCaption = `${igHookPrefix}\n\n${cleanedCaption}`;

                    const { error: cloneErr } = await supabase.from('content_calendar').insert({
                      user_id: fullPost.user_id,
                      org_id: fullPost.org_id || null,
                      platform: 'instagram',
                      format: 'reel',
                      hook: fullPost.hook,
                      caption: cloneCaption,
                      hashtags: Array.isArray(fullPost.hashtags) ? fullPost.hashtags.filter((h: any) => !/tiktok/i.test(h)) : fullPost.hashtags,
                      visual_url: postWithMedia.visual_url || fullPost.visual_url,
                      scheduled_date: cloneDateStr,
                      scheduled_time: cloneScheduled.toISOString(),
                      status: 'approved',
                      auto_publish: true,
                      pillar: fullPost.pillar || null,
                      source: 'cross_post_from_tiktok',
                      parent_post_id: post.id,
                    });
                    if (!cloneErr) {
                      console.log(`[Content] Cross-posted TikTok ${post.id} → Instagram Reel @ ${cloneDateStr} 18:30 (+${delayDays}d)`);
                    } else {
                      console.warn(`[Content] Cross-post insert error for ${post.id}:`, cloneErr.message);
                    }
                  }
                } catch (cloneErr: any) {
                  console.warn(`[Content] Cross-post threw for ${post.id}:`, cloneErr?.message);
                }
              }
            } else {
              console.error(`[Content] TikTok publish FAILED for post ${post.id}: ${ttResult.error}`);
              escalateAgentError({ agent: 'content', action: 'publish_tiktok', error: ttResult.error || 'Unknown TT error', platform: 'tiktok', postId: post.id, context: `Hook: ${fullPost.hook?.substring(0, 80)}` }).catch(() => {});
            }
          } else if (fullPost.platform === 'linkedin') {
            // LinkedIn: publier via l'API LinkedIn
            try {
              const liCaption = (fullPost.caption || fullPost.hook || '') + (fullPost.hashtags ? '\n\n' + fullPost.hashtags : '');
              const liBody: any = {
                caption: liCaption,
                mediaType: visualUrl ? 'image' : 'text',
                mediaUrl: visualUrl || undefined,
                _scheduledPublish: true,
                _userId: '',
              };
              const cronSecret = process.env.CRON_SECRET;
              const liRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com'}/api/library/linkedin/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cronSecret}` },
                body: JSON.stringify(liBody),
              });
              if (liRes.ok) {
                const liData = await liRes.json();
                if (liData.postUrn || liData.id) {
                  updateFields.linkedin_post_id = liData.postUrn || liData.id;
                  platformSuccess = true;
                  console.log(`[Content] LinkedIn published for post ${post.id}: ${liData.postUrn || liData.id}`);
                } else {
                  console.error(`[Content] LinkedIn publish no URN for post ${post.id}`);
                }
              } else {
                const liErr = await liRes.text().catch(() => '');
                console.error(`[Content] LinkedIn publish FAILED ${liRes.status}: ${liErr.substring(0, 200)}`);
                escalateAgentError({ agent: 'content', action: 'publish_linkedin', error: `HTTP ${liRes.status}: ${liErr.substring(0, 200)}`, platform: 'linkedin', postId: post.id }).catch(() => {});
              }
            } catch (liErr: any) {
              console.error(`[Content] LinkedIn publish error for post ${post.id}: ${liErr.message}`);
            }
          } else {
            // Plateforme inconnue — ne PAS marquer comme published
            console.warn(`[Content] Unknown platform ${fullPost.platform} for post ${post.id}`);
            platformSuccess = false;
          }

          if (platformSuccess) {
            updateFields.status = 'published';
            updateFields.published_at = new Date().toISOString();
            published++;
            // Cap-60: count this as an AUTO publication only when it shipped
            // without manual validation (post was a draft + toggle was 'auto').
            // Manually-approved posts (status='approved') don't count.
            if (post.status === 'draft' && postPublishMode === 'auto') {
              recordAutoPublish(supabase, userId, postPlatform).catch(() => {});
            }
          } else if (!updateFields.status) {
            updateFields.status = 'approved'; // Remettre en approved si pas publie
          }

          await supabase.from('content_calendar').update(updateFields).eq('id', post.id);
        } catch (err) {
          console.error(`[Content] Auto-publish error for post ${post.id}:`, err);
        }
      }
      console.log(`[Content] Auto-published ${published}/${Math.min(unpublished.length, maxPublishPerSlot)} posts${notified > 0 ? `, notified ${notified}` : ''}`);
    }

    // If Sunday evening cron (or no posts planned this week), generate weekly plan
    // Moved AFTER auto-publish so Sunday posts still get published
    if (isCron && dayOfWeek === 0) {
      return generateWeeklyPlan(supabase, undefined, undefined, orgId, userId);
    }

    // AFTER auto-publish: generate new posts for midday/evening/tiktok slots
    // Re-query to get updated counts (some may have been published above)
    const { data: updatedPosts } = await supabase
      .from('content_calendar')
      .select('id, platform, format, status')
      .eq('scheduled_date', todayStr);
    const postCount = updatedPosts?.length || todayPosts.length;

    if (slot === 'morning' && postCount < 1) {
      console.log('[Content] Morning slot — generating 1st post for today');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__morning__', undefined, orgId, userId, clientSettings);
    }

    if (slot === 'midday' && postCount < 2) {
      console.log('[Content] Midday slot — generating 2nd post for today');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__midday__', undefined, orgId, userId, clientSettings);
    }

    if (slot === 'evening' && postCount < 3) {
      console.log('[Content] Evening slot — generating 3rd post for today');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__evening__', undefined, orgId, userId, clientSettings);
    }

    const hasTiktokToday = (updatedPosts || todayPosts).some((p: any) => p.platform === 'tiktok');
    if (slot === 'tiktok' && !hasTiktokToday) {
      console.log('[Content] TikTok slot — generating daily TikTok video');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__tiktok__', undefined, orgId, userId, clientSettings);
    }

    // LinkedIn: 2 posts per day
    const linkedinPostsToday = (updatedPosts || todayPosts).filter((p: any) => p.platform === 'linkedin').length;
    if (slot === 'linkedin_1' && linkedinPostsToday < 1) {
      console.log('[Content] LinkedIn slot 1 — generating 1st LinkedIn post');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__linkedin_1__', undefined, orgId, userId, clientSettings);
    }
    if (slot === 'linkedin_2' && linkedinPostsToday < 2) {
      console.log('[Content] LinkedIn slot 2 — generating 2nd LinkedIn post');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__linkedin_2__', undefined, orgId, userId, clientSettings);
    }

    // ─── Catch-up slot (2026-06-01) ──────────────────────────────────
    // Used by /api/cron/scheduler?slot=pre_recap_catchup and the Noah
    // evening catch-up gate. Generates ONE extra post regardless of
    // count guards above. Caller calls multiple times if more are
    // needed. Chooses the next missing slot type so we keep variety
    // (morning → midday → evening → linkedin if applicable).
    if (slot === 'catch_up') {
      const igPosts = (updatedPosts || todayPosts).filter((p: any) => p.platform === 'instagram' || !p.platform);
      const igCount = igPosts.length;
      // Pick the next missing IG slot
      const nextPillar = igCount === 0 ? '__morning__'
        : igCount === 1 ? '__midday__'
        : igCount === 2 ? '__evening__'
        : '__morning__'; // already at 3+ IG, force another morning-style post
      console.log(`[Content] Catch-up slot — igCount=${igCount} → generating ${nextPillar} post`);
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, nextPillar, undefined, orgId, userId, clientSettings);
    }

    // Return today's content — flag as warning if 0 posts
    return NextResponse.json({
      ok: true,
      today: updatedPosts || todayPosts,
      message: `${postCount} post(s) for today`,
      warning: postCount === 0 ? 'No posts planned or generated for today' : undefined,
    });
  } catch (error: any) {
    console.error('[Content] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ──────────────────────────────────────
// POST: Manual actions
// ──────────────────────────────────────
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY non configurée' }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  let userId = request.nextUrl.searchParams.get('user_id') || null;

  // If no user_id in URL, try to get from authenticated session
  if (!userId) {
    try {
      const { user } = await getAuthUser();
      if (user) userId = user.id;
    } catch {}
  }

  // Load client settings for POST handler too
  let clientSettings: Record<string, any> = {};
  if (userId) {
    try {
      const { data: cfg } = await supabase
        .from('org_agent_configs')
        .select('config')
        .eq('user_id', userId)
        .eq('agent_id', 'content')
        .maybeSingle();
      if (cfg?.config) clientSettings = cfg.config;
    } catch {}
  }

  try {
    const body = await request.json().catch(() => ({}));
    const orgId = body?.org_id || null;

    switch (body.action) {
      case 'set_publish_mode': {
        const mode = body.publish_mode === 'notify' ? 'notify' : 'auto';
        await supabase.from('agent_logs').insert({
          agent: 'content',
          action: 'publish_mode_config',
          status: 'success',
          data: { publish_mode: mode },
        });
        return NextResponse.json({ ok: true, publish_mode: mode });
      }

      case 'set_video_ratio': {
        // 2026-06-09 — Le client pose son curseur image/vidéo dans le
        // panel. On persiste dans org_agent_configs.config.video_ratio
        // ET on applique INSTANTANÉMENT :
        //   1. Cancel les approved posts dated > today (le planning
        //      doit refléter le nouveau mix dès le lendemain).
        //   2. Trigger async generate_weekly weeks=1 pour recréer.
        //      Le prochain publish_scheduled cron prendra les nouveaux.
        const ratioRaw = parseInt(String(body.video_ratio ?? body.ratio ?? '40'), 10);
        const ratio = Math.max(0, Math.min(100, isNaN(ratioRaw) ? 40 : ratioRaw));
        if (!userId) return NextResponse.json({ ok: false, error: 'no user' }, { status: 401 });

        // 1. Persist new ratio
        const { data: existing } = await supabase
          .from('org_agent_configs')
          .select('id, config')
          .eq('user_id', userId)
          .eq('agent_id', 'content')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          const newConfig = { ...((existing as any).config || {}), video_ratio: ratio };
          await supabase.from('org_agent_configs').update({ config: newConfig }).eq('id', (existing as any).id);
        } else {
          await supabase.from('org_agent_configs').insert({
            user_id: userId,
            agent_id: 'content',
            is_enabled: true,
            config: { video_ratio: ratio },
          });
        }

        // 2. "Cancel" future approved posts (date > today) → on les
        //    bascule en status='draft' et on les TAGUE comme banque
        //    visuelle réutilisable. Les visuels générés sont gardés :
        //    Léna peut les recycler plus tard pour CE client ou comme
        //    inspiration cross-client (visual_reuse pool).
        //    Founder rule 2026-06-09 : "garder pour utilisation
        //    ulterieure ou generation reel pour les autres clients".
        const todayStr = new Date().toISOString().split('T')[0];
        const { data: parked, error: cancelErr } = await supabase
          .from('content_calendar')
          .update({
            status: 'draft',
            qa_notes: `parked_for_video_ratio_change_to_${ratio}pct — visual asset reusable`,
            source: 'parked_by_mix_change',
          })
          .eq('user_id', userId)
          .eq('status', 'approved')
          .gt('scheduled_date', todayStr)
          .select('id, visual_url, format');
        const parkedCount = parked?.length || 0;
        if (cancelErr) {
          console.warn('[Content] set_video_ratio park error:', cancelErr.message);
        }

        // 3. Trigger async generate_weekly (fire-and-forget). On clone
        //    la request avec un cookie d'auth pour que l'endpoint
        //    voit le user.
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`;
          const cookieHeader = request.headers.get('cookie') || '';
          // Fire and forget — l'admin verra l'updated planning à l'ouverture
          fetch(`${baseUrl}/api/agents/content`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'cookie': cookieHeader,
            },
            body: JSON.stringify({ action: 'generate_weekly', weeks: 1 }),
          }).catch(() => { /* swallow — best effort */ });
        } catch { /* swallow */ }

        // 4. Pré-flight check crédits — vérifie que le client a assez
        //    pour la prochaine semaine de cadence. Si non, on inclut
        //    une alerte upsell dans la réponse.
        let creditsAlert: { kind: 'pack' | 'upgrade'; message: string } | null = null;
        try {
          const { getCreditsBalance } = await import('@/lib/credits/server');
          const { resolveEffectivePlan } = await import('@/lib/credits/plan-budget-guard');
          const balance = await getCreditsBalance(userId);
          const effectivePlan = await resolveEffectivePlan(supabase, userId, 'content');
          // Estimation rapide : appelle cadence-preview pour les crédits
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`;
          const previewRes = await fetch(`${baseUrl}/api/agents/content/cadence-preview?plan=${effectivePlan}&video_ratio=${ratio}`);
          const preview = await previewRes.json();
          if (preview.ok) {
            const weeklyConsumption = Math.round(preview.credits_consumed_per_month / 4.33);
            if (balance < weeklyConsumption) {
              creditsAlert = {
                kind: balance < weeklyConsumption / 2 ? 'upgrade' : 'pack',
                message: balance < weeklyConsumption / 2
                  ? `Crédits insuffisants (${balance} restants, besoin ~${weeklyConsumption}/sem). Le plan Pro (2× Créateur) couvrirait largement.`
                  : `Crédits faibles (${balance} restants pour ~${weeklyConsumption}/sem cadence). Un pack de boost te garantit la cadence du mois.`,
              };
            }
          }
        } catch (creditsErr: any) {
          console.warn('[Content] credits pre-check failed:', creditsErr?.message);
        }

        return NextResponse.json({
          ok: true,
          video_ratio: ratio,
          parked_future_posts: parkedCount,
          regeneration_triggered: true,
          credits_alert: creditsAlert,
          message: creditsAlert
            ? `Mix ${ratio}% appliqué ⚠️ ${creditsAlert.message}`
            : `Mix ${ratio}% vidéo appliqué — ${parkedCount} post(s) futurs basculés en draft, Léna régénère les 7 prochains jours en arrière-plan.`,
        });
      }

      case 'generate_weekly': {
        // 2026-06-04 — Founder ask : "on choisi 7 jours 14 et 21 et 30
        // engros 1 semaine 2 smeaines 3 semaines et le mois entier".
        // weeks param controls how many weekly batches we generate
        // back-to-back, each offset by 7 days from the previous one.
        const weeksRaw = parseInt(String(body.weeks || body.weeksAhead || '1'), 10);
        const weeks = Math.max(1, Math.min(4, isNaN(weeksRaw) ? 1 : weeksRaw));
        let totalInserted = 0;
        const results: any[] = [];
        for (let w = 0; w < weeks; w++) {
          const r = await generateWeeklyPlan(supabase, body.platform, body.draftOnly, orgId, userId, w * 7);
          // r is NextResponse — read its JSON to aggregate counts
          try {
            const j = await r.json();
            if (j.inserted) totalInserted += j.inserted;
            results.push({ week_offset_days: w * 7, ...j });
          } catch {}
        }
        return NextResponse.json({ ok: true, weeks, inserted: totalInserted, results });
      }

      case 'generate_post': {
        const todayStr = new Date().toISOString().split('T')[0];
        const dayOfWeek = new Date().getDay();
        // Allow caller to force the news-angle source ('news' | 'trend' | 'event')
        // via body.preferAngleSource — handy for A/B testing the 2 modes.
        const callSettings = (body.preferAngleSource || body.avoidTopics)
          ? {
              ...clientSettings,
              ...(body.preferAngleSource ? { _prefer_angle_source: body.preferAngleSource } : {}),
              ...(Array.isArray(body.avoidTopics) ? { _avoid_topics: body.avoidTopics } : {}),
            }
          : clientSettings;
        return generateDailyPost(supabase, todayStr, dayOfWeek, body.platform, body.pillar, body.draftOnly, orgId, userId, callSettings, body.format);
      }

      case 'generate_week': {
        return generateWeekWithVisuals(supabase, body.publishAll === true, orgId, userId);
      }

      case 'approve': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { error } = await supabase
          .from('content_calendar')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('id', body.postId);
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }

      case 'publish': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: pubPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!pubPost) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });

        // Allow targeting a specific platform (body.platform) or default to post's platform
        const targetPlatform = body.platform || pubPost.platform || 'instagram';

        const pubUpdate: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };

        // Prevent double-publish
        if (pubPost.status === 'published') {
          return NextResponse.json({ ok: true, already_published: true, message: 'Post deja publie' });
        }
        // 2026-06-03 — Removed outer atomic claim. publishToInstagram /
        // publishToTikTok each do their own claim and detect 'publishing'
        // as 'already_claimed'. If we pre-claim here, the inner call
        // sees 'publishing' set by US, bails as a dup-race, and the
        // post is left half-flagged with no actual API call. Founder
        // reported 'Post est marqué publié mais permalink null' after
        // a manual publish.
        if (!['approved', 'draft', 'publish_failed', 'retry_pending'].includes(pubPost.status)) {
          return NextResponse.json({
            ok: true,
            already_publishing: pubPost.status === 'publishing',
            current_status: pubPost.status,
            message: `Post déjà en état ${pubPost.status} — pas re-publié.`,
          });
        }
        pubUpdate.published_at = new Date().toISOString();

        let pubPermalink: string | undefined;
        let pubPublishId: string | undefined;
        const errors: string[] = [];

        // Publish to target platform
        if ((targetPlatform === 'instagram' || targetPlatform === 'all') && pubPost.visual_url) {
          const igResult = await publishToInstagram(pubPost, supabase, orgId, userId);
          if (igResult.success && igResult.permalink) {
            pubUpdate.instagram_permalink = igResult.permalink;
            pubPermalink = igResult.permalink;
          } else if (igResult.error) {
            errors.push(`Instagram: ${igResult.error}`);
            console.warn(`[Content] Instagram publish failed for post ${body.postId}: ${igResult.error}`);
          }
        }

        if ((targetPlatform === 'tiktok' || targetPlatform === 'all') && pubPost.visual_url) {
          const ttResult = await publishToTikTok(pubPost, supabase);
          if (ttResult.success && ttResult.publish_id) {
            pubUpdate.tiktok_publish_id = ttResult.publish_id;
            pubPublishId = ttResult.publish_id;
          } else if (ttResult.error) {
            errors.push(`TikTok: ${ttResult.error}`);
            console.warn(`[Content] TikTok publish failed for post ${body.postId}: ${ttResult.error}`);
          }
        }

        // If all platforms failed, mark as publish_failed; otherwise success.
        if (errors.length > 0 && !pubPermalink && !pubPublishId) {
          pubUpdate.status = 'publish_failed';
          pubUpdate.publish_diagnostic = errors.join(' | ').substring(0, 500);
          delete pubUpdate.published_at;
        } else {
          pubUpdate.status = 'published';
        }

        const { error } = await supabase.from('content_calendar').update(pubUpdate).eq('id', body.postId);
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        return NextResponse.json({
          ok: errors.length === 0,
          instagram_permalink: pubPermalink,
          tiktok_publish_id: pubPublishId,
          errors: errors.length > 0 ? errors : undefined,
        });
      }

      case 'regenerate_single':
      case 'republish_single': {
        // Re-publish a SINGLE post by ID — regenerate image if expired, then publish to Instagram
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: singlePost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!singlePost) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });

        let singleVisualUrl = singlePost.visual_url;

        // Check if image URL is still valid
        if (singleVisualUrl) {
          try {
            const headRes = await fetch(singleVisualUrl, { method: 'HEAD' });
            if (!headRes.ok) {
              console.log(`[Content] Image expired for post ${singlePost.id}, regenerating...`);
              singleVisualUrl = null;
            }
          } catch {
            singleVisualUrl = null;
          }
        }

        // Regenerate image if missing/expired
        if (!singleVisualUrl && singlePost.visual_description) {
          singleVisualUrl = await generateVisual(singlePost.visual_description, singlePost.format || 'post');
          if (singleVisualUrl) {
            // Cache to permanent Supabase Storage immediately
            const cachedUrl = await cacheImageToStorage(singleVisualUrl, singlePost.id);
            if (cachedUrl) singleVisualUrl = cachedUrl;
            await supabase.from('content_calendar').update({
              visual_url: singleVisualUrl, updated_at: new Date().toISOString(),
            }).eq('id', singlePost.id);
          }
        }

        if (!singleVisualUrl) {
          return NextResponse.json({ ok: false, error: 'Impossible de générer l\'image' }, { status: 500 });
        }

        // Publish to Instagram
        if (singlePost.platform === 'instagram') {
          const igResult = await publishToInstagram({ ...singlePost, visual_url: singleVisualUrl }, supabase, orgId, userId);
          if (igResult.success) {
            await supabase.from('content_calendar').update({
              instagram_permalink: igResult.permalink,
              visual_url: singleVisualUrl,
              status: 'published',
              published_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', singlePost.id);
            return NextResponse.json({ ok: true, permalink: igResult.permalink, visual_url: singleVisualUrl });
          } else {
            return NextResponse.json({ ok: false, error: igResult.error || 'Publication Instagram échouée' }, { status: 500 });
          }
        }

        // Publish to TikTok
        if (singlePost.platform === 'tiktok') {
          const ttResult = await publishToTikTok({ ...singlePost, visual_url: singleVisualUrl }, supabase);
          if (ttResult.success) {
            await supabase.from('content_calendar').update({
              tiktok_publish_id: ttResult.publish_id,
              visual_url: singleVisualUrl,
              status: 'published',
              published_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', singlePost.id);
            return NextResponse.json({ ok: true, tiktok_publish_id: ttResult.publish_id, visual_url: singleVisualUrl });
          } else {
            return NextResponse.json({ ok: false, error: ttResult.error || 'Publication TikTok échouée' }, { status: 500 });
          }
        }

        // For other platforms, just update status
        await supabase.from('content_calendar').update({
          visual_url: singleVisualUrl,
          status: 'published',
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', singlePost.id);
        return NextResponse.json({ ok: true, visual_url: singleVisualUrl });
      }

      case 'regenerate_image': {
        // Regenerate image only (no publishing) — used to fix broken images
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: regenPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!regenPost) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });
        if (!regenPost.visual_description) return NextResponse.json({ ok: false, error: 'Pas de description visuelle' }, { status: 400 });

        const newVisualUrl = await generateVisual(regenPost.visual_description, regenPost.format || 'post');
        if (!newVisualUrl) return NextResponse.json({ ok: false, error: 'Échec génération image' }, { status: 500 });

        await supabase.from('content_calendar').update({
          visual_url: newVisualUrl, updated_at: new Date().toISOString(),
        }).eq('id', regenPost.id);

        return NextResponse.json({ ok: true, visual_url: newVisualUrl });
      }

      case 'publish_single': {
        // Publish a single approved post immediately
        const publishPostId = body.postId || body.post_id;
        if (!publishPostId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: psPost } = await supabase.from('content_calendar').select('*').eq('id', publishPostId).single();
        if (!psPost) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });

        // Get the owner user_id from the post or from current auth
        const postUserId = psPost.user_id || userId || null;

        // Update status to approved if pending
        if (psPost.status === 'pending_approval' || psPost.status === 'draft') {
          await supabase.from('content_calendar').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', body.postId);
        }

        // Publish directly instead of delegating (avoids losing userId in CRON call)
        if (psPost.platform === 'instagram' || !psPost.platform) {
          const igResult = await publishToInstagram({ ...psPost, visual_url: psPost.visual_url }, supabase, orgId, postUserId);
          if (igResult.success) {
            await supabase.from('content_calendar').update({
              instagram_permalink: igResult.permalink,
              status: 'published',
              published_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', publishPostId);
            return NextResponse.json({ ok: true, instagram_permalink: igResult.permalink });
          }
          return NextResponse.json({ ok: false, error: igResult.error || 'Publication echouee' });
        }

        // For other platforms, delegate
        const psResult = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_URL}`}/api/agents/content?user_id=${postUserId || ''}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'republish_single', postId: publishPostId }),
        }).then(r => r.json()).catch(() => ({ ok: false }));

        return NextResponse.json(psResult);
      }

      case 'regenerate_visual': {
        // Regenerate visual with a NEW description + send new notification email
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: rvPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!rvPost) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });

        // Generate a new visual (different seed = different result)
        const rvDesc = rvPost.visual_description || rvPost.hook || rvPost.caption;
        if (!rvDesc) return NextResponse.json({ ok: false, error: 'No visual description' }, { status: 400 });

        const rvNewUrl = await generateVisual(rvDesc, rvPost.format || 'post');
        if (!rvNewUrl) return NextResponse.json({ ok: false, error: 'Visual generation failed' }, { status: 500 });

        const rvCached = await cacheImageToStorage(rvNewUrl, `regen-${body.postId}`);
        const rvFinalUrl = rvCached || rvNewUrl;

        await supabase.from('content_calendar').update({
          visual_url: rvFinalUrl,
          status: 'pending_approval',
          updated_at: new Date().toISOString(),
        }).eq('id', body.postId);

        // Send new notification email with the regenerated visual
        try {
          const { sendPublishNotification } = await import('@/lib/agents/publish-notification');
          const { data: updatedPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
          if (updatedPost) {
            await sendPublishNotification(updatedPost, supabase);
          }
        } catch (notifErr) {
          console.warn('[Content] Failed to send regenerate notification:', notifErr);
        }

        return NextResponse.json({ ok: true, visual_url: rvFinalUrl });
      }

      case 'fix_broken_images': {
        // Batch fix broken images — check all recent posts with visual_url containing bytepluses.com (temp URLs)
        // and regenerate/re-cache them to Supabase Storage
        const { data: allPosts } = await supabase
          .from('content_calendar')
          .select('id, visual_url, visual_description, format')
          .not('visual_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(50);

        let fixedCount = 0;
        let failedCount = 0;
        const fixResults: Array<{ id: string; status: string }> = [];

        for (const p of (allPosts || [])) {
          if (!p.visual_url) continue;

          // Check if URL is a Supabase Storage URL (already permanent) — skip
          if (p.visual_url.includes('supabase.co/storage')) continue;

          // Check if URL is accessible
          try {
            const headRes = await fetch(p.visual_url, { method: 'HEAD' });
            if (headRes.ok) {
              // URL works — try to cache to permanent storage
              const permanentUrl = await cacheImageToStorage(p.visual_url, `fix-${p.id}`);
              if (permanentUrl) {
                await supabase.from('content_calendar').update({ visual_url: permanentUrl, updated_at: new Date().toISOString() }).eq('id', p.id);
                fixResults.push({ id: p.id, status: 'cached' });
                fixedCount++;
                continue;
              }
            }
          } catch { /* URL broken */ }

          // URL expired — regenerate from description
          if (p.visual_description) {
            const newUrl = await generateVisual(p.visual_description, p.format || 'post');
            if (newUrl) {
              await supabase.from('content_calendar').update({ visual_url: newUrl, updated_at: new Date().toISOString() }).eq('id', p.id);
              fixResults.push({ id: p.id, status: 'regenerated' });
              fixedCount++;
            } else {
              fixResults.push({ id: p.id, status: 'failed' });
              failedCount++;
            }
          } else {
            fixResults.push({ id: p.id, status: 'no_description' });
            failedCount++;
          }
        }

        return NextResponse.json({ ok: true, fixed: fixedCount, failed: failedCount, results: fixResults });
      }

      case 'republish': {
        // Re-publish posts marked "published" but not actually on Instagram (no permalink)
        // Also regenerates image if the URL is expired/broken
        const { data: fakePubs } = await supabase
          .from('content_calendar')
          .select('*')
          .eq('status', 'published')
          .is('instagram_permalink', null)
          .eq('platform', 'instagram')
          .order('scheduled_date', { ascending: false })
          .limit(body.limit || 10);

        if (!fakePubs || fakePubs.length === 0) {
          return NextResponse.json({ ok: true, message: 'Aucun post à republier', republished: 0 });
        }

        let republished = 0;
        const republishResults: Array<{ id: string; hook: string; success: boolean; error?: string; permalink?: string }> = [];

        for (const post of fakePubs) {
          let visualUrl = post.visual_url;

          // Check if image URL is still valid (Seedream URLs expire)
          if (visualUrl) {
            try {
              const headRes = await fetch(visualUrl, { method: 'HEAD' });
              if (!headRes.ok) {
                console.log(`[Content] Image expired for post ${post.id}, regenerating...`);
                visualUrl = null;
              }
            } catch {
              visualUrl = null;
            }
          }

          // Regenerate image if missing/expired
          if (!visualUrl && post.visual_description) {
            visualUrl = await generateVisual(post.visual_description, post.format || 'post');
            if (visualUrl) {
              await supabase.from('content_calendar').update({
                visual_url: visualUrl, updated_at: new Date().toISOString(),
              }).eq('id', post.id);
            }
          }

          if (!visualUrl) {
            republishResults.push({ id: post.id, hook: post.hook || '?', success: false, error: 'No image available' });
            continue;
          }

          // Publish to Instagram
          const igResult = await publishToInstagram({ ...post, visual_url: visualUrl }, supabase, orgId, userId);
          if (igResult.success) {
            await supabase.from('content_calendar').update({
              instagram_permalink: igResult.permalink,
              visual_url: visualUrl,
              published_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', post.id);
            republished++;
            republishResults.push({ id: post.id, hook: post.hook || '?', success: true, permalink: igResult.permalink });
          } else {
            republishResults.push({ id: post.id, hook: post.hook || '?', success: false, error: igResult.error });
          }
        }

        return NextResponse.json({ ok: true, republished, total: fakePubs.length, results: republishResults });
      }

      case 'skip':
      case 'skip_single': {
        // 2026-06-04 — skip_single alias: PostPreviewModal already calls
        // this action when the client clicks 'Supprimer'. Founder ask:
        // "le client peut revoquer a tout moment et supprimer avant la
        // date de publication". Set status='skipped' (soft delete) so
        // we keep audit trail.
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { error } = await supabase
          .from('content_calendar')
          .update({
            status: 'skipped',
            updated_at: new Date().toISOString(),
            publish_diagnostic: 'client_skipped',
          })
          .eq('id', body.postId)
          .not('status', 'eq', 'published'); // can't skip an already-published post
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }

      case 'edit_single': {
        // 2026-06-04 — Edit a planned post BEFORE its publication date.
        // Founder ask: "lui laisse l'occasion de supprimer o uchanger
        // avant la date et heure de publication le post specifique".
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const editable = ['caption', 'hook', 'hashtags', 'scheduled_date', 'scheduled_time', 'visual_description'];
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        for (const field of editable) {
          if (body[field] !== undefined) updates[field] = body[field];
        }
        if (Object.keys(updates).length === 1) {
          return NextResponse.json({ ok: false, error: 'no editable field provided' }, { status: 400 });
        }
        const { error } = await supabase
          .from('content_calendar')
          .update(updates)
          .eq('id', body.postId)
          .in('status', ['draft', 'approved', 'retry_pending']); // can only edit pre-publish
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, updated_fields: Object.keys(updates).filter(k => k !== 'updated_at') });
      }

      case 'execute_publication': {
        // ── Pre-publication Instagram token diagnostic ──
        // Verify token validity before wasting API calls on publish attempts
        // Use client profile if userId is set, otherwise fallback to admin.
        // Also pulls the IGAA token — if FB page token is missing/expired we
        // can fall back to the permanent IGAA for publishing via graph.instagram.com.
        const profileQuery = userId
          ? supabase.from('profiles').select('instagram_business_account_id, facebook_page_access_token, instagram_igaa_token').eq('id', userId).single()
          : supabase.from('profiles').select('instagram_business_account_id, facebook_page_access_token, instagram_igaa_token').eq('is_admin', true).limit(1).single();
        const { data: publishProfile } = await profileQuery;

        // Prefer IGAA when present — it doesn't expire like FB page tokens
        const publishToken = publishProfile?.instagram_igaa_token || publishProfile?.facebook_page_access_token;
        let igTokenValid = false;
        if (!publishProfile?.instagram_business_account_id || !publishToken) {
          // Client never connected Instagram — this is normal state, not
          // an error. Log as 'success' with a skipped flag so it doesn't
          // pollute Noah's daily admin brief.
          console.log(`[Content] execute_publication: Instagram not configured for ${userId || 'admin'} — skipping IG publishes`);
          await supabase.from('agent_logs').insert({
            agent: 'diagnostic',
            action: 'instagram_health_check',
            status: 'success',
            user_id: userId || null,
            data: {
              check: 'pre_publish_token',
              skipped: true,
              reason: 'no_ig_configured',
              detail: 'Instagram not connected for this account. IG publishes skipped (expected behaviour, not an error).',
              triggered_by: 'execute_publication',
            },
            created_at: new Date().toISOString(),
          });
        } else {
          try {
            const { graphGET: graphGETCheck } = await import('@/lib/meta');
            await graphGETCheck<{ id: string }>(
              `/${publishProfile.instagram_business_account_id}`,
              publishToken,
              { fields: 'id' },
              { igUserId: publishProfile.instagram_business_account_id }
            );
            igTokenValid = true;
            console.log(`[Content] execute_publication: Instagram token verified OK (${publishProfile.instagram_igaa_token ? 'IGAA' : 'FB'})`);
          } catch (tokenErr: any) {
            const errDetail = (tokenErr.message || '').substring(0, 300);
            console.error('[Content] execute_publication: Instagram token INVALID:', errDetail);
            const tokenDiag = diagnosePublishFailure('Instagram', errDetail);
            await sendPublishAlert(
              tokenDiag,
              'Pre-publication token check failed — all Instagram posts will be skipped',
              supabase
            );
            await supabase.from('agent_logs').insert({
              agent: 'diagnostic',
              action: 'instagram_health_check',
              status: 'error',
              user_id: userId || null,
              data: {
                check: 'pre_publish_token',
                severity: 'critical',
                detail: `Token validation failed: ${errDetail}`,
                diagnostic_reason: tokenDiag.reason,
                triggered_by: 'execute_publication',
              },
              created_at: new Date().toISOString(),
            });
          }
        }

        // Publish ONLY 'approved' posts (NOT drafts — drafts need manual validation)
        // Limit to 1 per call to avoid publishing everything at once
        const todayDate = new Date().toISOString().split('T')[0];
        let readyQuery = supabase
          .from('content_calendar')
          .select('*')
          .eq('status', 'approved')
          .lte('scheduled_date', todayDate)
          .is('visual_url', null);
        if (userId) readyQuery = readyQuery.eq('user_id', userId);
        const { data: readyPosts } = await readyQuery;

        // Also get approved posts with visuals that aren't published yet (NOT drafts).
        // When the retry migration is applied, we also include posts that failed
        // with a transient error and are ready for retry (status='retry_pending'
        // AND next_retry_at <= now), so they get picked up without a dedicated
        // cron slot. Until the migration is applied, we skip the retry_pending
        // branch entirely (otherwise the .or() on next_retry_at would fail).
        // Limit to 1 per slot to spread publications throughout the day.
        const retryEnabled = await checkRetryColumns(supabase);
        const nowIso = new Date().toISOString();
        const statuses = retryEnabled
          ? ['approved', 'publish_failed', 'retry_pending']
          : ['approved', 'publish_failed'];

        // Compute the set of disabled platforms so we filter them OUT of
        // the query (rather than finding them and then skipping the post).
        // Previously the limit=1 query always returned the oldest approved
        // post; if that post was TikTok but TikTok was disabled, the loop
        // skipped and returned published=0 forever — the IG backlog
        // never got touched.
        const skipPlatforms = new Set<string>();
        if (clientSettings.tt_enabled === false || (clientSettings.posts_per_day_tt != null && parseInt(clientSettings.posts_per_day_tt) === 0)) skipPlatforms.add('tiktok');
        if (clientSettings.li_enabled === false || (clientSettings.posts_per_day_li != null && parseInt(clientSettings.posts_per_day_li) === 0)) skipPlatforms.add('linkedin');

        let visualQuery = supabase
          .from('content_calendar')
          .select('*')
          .in('status', statuses)
          .lte('scheduled_date', todayDate)
          .not('visual_url', 'is', null);
        if (skipPlatforms.size > 0) {
          visualQuery = visualQuery.not('platform', 'in', `(${Array.from(skipPlatforms).map(p => `"${p}"`).join(',')})`);
        }
        if (retryEnabled) {
          visualQuery = visualQuery.or(`status.neq.retry_pending,next_retry_at.lte.${nowIso}`);
        }
        visualQuery = visualQuery.limit(1);
        if (userId) visualQuery = visualQuery.eq('user_id', userId);
        const { data: approvedWithVisuals } = await visualQuery;

        let publishedCount = 0;
        const publishedPosts: Array<{ platform: string; format: string; hook: string; instagram_permalink?: string; publication_error?: string }> = [];

        // Spacing guard — same rule as the morning slot loop: min 4h
        // between publications on the same platform. Without this, the
        // execute_publication backlog path can fire alongside the
        // morning slot and produce two posts in the same minute.
        const EXEC_MIN_GAP_HOURS = 4;
        const recentSince = new Date(Date.now() - EXEC_MIN_GAP_HOURS * 3600 * 1000).toISOString();

        // Publish posts that already have visuals (skip disabled platforms)
        for (const post of (approvedWithVisuals || []).filter((p: any) => !skipPlatforms.has(p.platform || 'instagram'))) {
          // Per-platform spacing check
          if (userId) {
            const { count: recentCount } = await supabase
              .from('content_calendar')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId)
              .eq('platform', post.platform || 'instagram')
              .eq('status', 'published')
              .gte('published_at', recentSince);
            if ((recentCount || 0) > 0) {
              console.warn(`[Content] execute_pub spacing guard: skipping ${post.id} on ${post.platform} — already published within ${EXEC_MIN_GAP_HOURS}h.`);
              continue;
            }
          }
          const updateData: Record<string, any> = {
            status: 'published',
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // For reel/video formats: generate video with narration if not already done
          const pFormat = (post.format || 'post').toLowerCase();
          let videoUrl = post.video_url || null;
          if ((pFormat === 'reel' || pFormat === 'video') && !videoUrl && !post.video_job_id) {
            const desc = post.visual_description || post.hook || post.caption;
            if (desc) {
              // 2026-06-06 — Founder ask: "même stratégie d'utilisation des
              // images donne par le client que pour insta donc pas systématiquement".
              // When the client has uploaded a dish + venue pair AND the
              // dice roll lands under 0.35, route TikTok reels through the
              // dish-in-venue pipeline (i2i refinement + QA + i2v from the
              // refined still). Otherwise fall through to the standard t2v
              // generation. Selectivity = avoid overusing the same client
              // assets + control cost (~€0.18 per dvr reel vs €0.10 for
              // standard t2v).
              const ownerId = (post as any).user_id || null;
              const dvrRng = Math.random();
              if (post.platform === 'tiktok' && ownerId && dvrRng < 0.35) {
                try {
                  const { pickClientDishVenuePair, buildDishInVenueRefinedStill, qaRefinedStillWithVision } = await import('@/lib/visuals/dish-in-venue-i2i');
                  const pair = await pickClientDishVenuePair(supabase, ownerId);
                  if (pair) {
                    // 2026-06-06 — Rotate animation across no-human presets
                    // so the feed doesn't read as the same slow parallax
                    // every time. People-interaction presets stay opt-in
                    // (caller has to ask for them; cron stays on the safe
                    // 3 presets that don't require Seedream to invent humans).
                    const SAFE_MOTIONS = ['parallax', 'dolly_steam', 'window_light'] as const;
                    const pickedMotion = SAFE_MOTIONS[Math.floor(Math.random() * SAFE_MOTIONS.length)];
                    // 2026-06-07 — Global rules: zero text in video + single
                    // continuous shot (no cuts/transitions). Prepended to every
                    // motion prompt so they outrank any soft hint.
                    const GLOBAL = 'ABSOLUTE RULE 1: ZERO text in the video — no captions, titles, labels, overlays, signage with words, watermark. Not a single letter. RULE 2: cuts only if narratively justified. Default = single continuous shot. Allowed: a single matched-on-action cut wide→close-up of the SAME subject. BANNED: fade-to-black, dissolve, whip-pan transition, glitch, jump cut to a different scene, anything that screams motion graphics. ABSOLUTE RULE 3: photographer realism — Vogue/Cereal editorial look, no fancy effects. ';
                    const MOTION_PROMPTS: Record<string, string> = {
                      parallax: GLOBAL + 'LOCKED ELEMENTS: the plated dish, the venue background, the table, every object — all stay exactly as in frame 1. CAMERA: continuous slow horizontal parallax 8-10% lateral drift + 4% push-in by the last second. Smooth steadicam. ACTION: warm daylight noticeably shifts over the clip — warmth deepens, shadows lengthen, a single steam wisp may rise. NO human enters. CINEMATOGRAPHY: Hasselblad X2D 80mm f/2.8, Portra 400 grain. BANNED: zoom, rotation, halo, neon, plastic, midjourney, CGI, cartoon.',
                      dolly_steam: GLOBAL + 'LOCKED ELEMENTS: the plated dish, the venue, the table, every object — all as in frame 1. CAMERA: very slow dolly-in toward the plate, ~8% closer by the end. ACTION: 2-3 thin wisps of gentle white steam rise from the dish and dissipate; faint warm flicker from an off-frame candle. NO human enters. CINEMATOGRAPHY: Leica M11 50mm Summilux f/2, mixed tungsten + golden-hour, Portra 400 grain. BANNED: fast moves, zoom, rotation, halo, neon, plastic, midjourney, CGI, cartoon.',
                      window_light: GLOBAL + 'LOCKED ELEMENTS: dish, venue, table, every object. CAMERA: imperceptible push-in, ~3% closer by the end. ACTION: warm window light moves across the scene as if 20 real minutes passed in 5 seconds — golden warmth deepens, shadows lengthen, dust motes catch a beam. NO human enters, NO objects move. CINEMATOGRAPHY: Hasselblad X2D 80mm f/2.8, Portra 400 grain, single window-light source. BANNED: zoom, rotation, movement of objects, human appearance, lens flare, halo, hdr, midjourney, CGI, cartoon.',
                    };
                    console.log(`[Content] execute_pub: TikTok reel — trying dish-in-venue (rng=${dvrRng.toFixed(2)}, motion=${pickedMotion})`);
                    const build = await buildDishInVenueRefinedStill({
                      venueUrl: pair.venueUrl,
                      dishUrl: pair.dishUrl,
                      postId: post.id,
                      aspect: 'story',
                    });
                    if (build.url) {
                      const qa = await qaRefinedStillWithVision(build.url);
                      console.log(`[Content] dvr QA: score=${qa.score} pass=${qa.pass} — ${qa.verdict}`);
                      if (qa.pass) {
                        // Dispatch i2v on the refined still (5s — TikTok-feasible)
                        const i2vReq = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com'}/api/seedream/i2v`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            authorization: `Bearer ${process.env.CRON_SECRET}`,
                          },
                          body: JSON.stringify({
                            imageUrl: build.url,
                            prompt: MOTION_PROMPTS[pickedMotion],
                            duration: 5,
                            userId: ownerId,
                          }),
                          signal: AbortSignal.timeout(60_000),
                        });
                        const i2vData = await i2vReq.json().catch(() => null);
                        // 2026-06-07 — Always-audio rule: pipe the silent
                        // i2v output through audio mux (Jamendo music + optional
                        // ElevenLabs voice) before publish. Founder: "non il
                        // me semble plus pertinent d'avoir toujours qqch
                        // donc go" — applies to TikTok AND Instagram reels.
                        if (i2vData?.ok && i2vData?.taskId) {
                          // Poll up to 120s for completion
                          const deadline = Date.now() + 120_000;
                          while (Date.now() < deadline) {
                            await new Promise(r => setTimeout(r, 6_000));
                            try {
                              const pr = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com'}/api/seedream/i2v`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', authorization: `Bearer ${process.env.CRON_SECRET}` },
                                body: JSON.stringify({ taskId: i2vData.taskId, userId: ownerId }),
                                signal: AbortSignal.timeout(15_000),
                              });
                              const pdata = await pr.json().catch(() => null);
                              if (pdata?.status === 'completed' && pdata?.videoUrl) {
                                let rawVideoUrl: string = pdata.videoUrl;
                                // Always-audio mux: Jamendo bg + optional voice.
                                try {
                                  const { pickJamendoMusic, pickMoodFromContext } = await import('@/lib/audio/jamendo-music');
                                  const mood = pickMoodFromContext({
                                    motion: pickedMotion,
                                    pillar: (post as any).pillar || undefined,
                                    businessType: clientSettings?.business_type || undefined,
                                  });
                                  const musicPick = await pickJamendoMusic({ mood, minDurationSec: 5 });
                                  if (musicPick?.url) {
                                    const { muxReelAudio } = await import('@/lib/audio/reel-audio-mux');
                                    const mix = await muxReelAudio({
                                      videoUrl: rawVideoUrl,
                                      musicUrl: musicPick.url,
                                      postId: post.id,
                                      durationSec: 5,
                                    });
                                    if (mix.url && mix.url !== rawVideoUrl) {
                                      rawVideoUrl = mix.url;
                                      console.log(`[Content] dvr reel audio muxed (Jamendo) for ${post.id}`);
                                    }
                                  }
                                } catch (audioErr: any) {
                                  console.warn('[Content] dvr audio mux failed (ship silent):', audioErr?.message);
                                }
                                videoUrl = rawVideoUrl;
                                updateData.video_url = videoUrl;
                                updateData.visual_url = build.url;
                                updateData.publish_diagnostic = `dvr_reel:motion=${pickedMotion},rng=${dvrRng.toFixed(2)},score=${qa.score}`;
                                console.log(`[Content] ✅ dvr reel ready for ${post.id}`);
                                break;
                              }
                              if (pdata?.status === 'failed') break;
                            } catch {}
                          }
                        }
                      } else {
                        console.log(`[Content] dvr QA failed — falling back to standard reel`);
                      }
                    }
                  }
                } catch (dvrErr: any) {
                  console.warn('[Content] dvr pipeline threw, fallback to standard:', dvrErr?.message);
                }
              }

              // Fallback / default path: standard t2v reel
              if (!videoUrl) {
                if (post.platform === 'tiktok') {
                  // TikTok: async 30s pipeline — video-poll cron will publish
                  console.log(`[Content] execute_pub: TikTok needs 30s video — starting async pipeline`);
                  const asyncResult = await createAsyncLongVideo(desc, post.caption || desc, 30, '9:16', post.id);
                  if (asyncResult.jobId) {
                    console.log(`[Content] execute_pub: async job ${asyncResult.jobId} started for TikTok post ${post.id}`);
                    // Skip publishing — video-poll cron will handle it
                    publishedPosts.push({ platform: post.platform, format: post.format, hook: post.hook || '', publication_error: 'async_video_generating' });
                    continue;
                  }
                  // Fallback to sync 10s if async fails
                  console.warn('[Content] execute_pub: async failed, fallback to sync 10s');
                  const vr = await generateVideoWithNarration(desc, post.caption || desc, pFormat, 10);
                  videoUrl = vr.videoUrl;
                  if (videoUrl) updateData.video_url = videoUrl;
                } else {
                  // Instagram: sync 5s video
                  console.log(`[Content] execute_pub: Instagram reel needs 5s video — generating...`);
                  const vr = await generateVideoWithNarration(desc, post.caption || desc, pFormat, 5);
                  videoUrl = vr.videoUrl;
                  if (videoUrl) updateData.video_url = videoUrl;
                }
              }
            }
          }

          // ── REEL QA (cron-side) ──
          // Same Sonnet keyframe review as the manual publish path.
          // Catches scissors-cutting-empty-air style nonsense before
          // the cron ships the reel to IG / TikTok.
          if (videoUrl && (pFormat === 'reel' || pFormat === 'video')) {
            try {
              const { reviewGeneratedReel } = await import('@/lib/visuals/reel-qa');
              const qa = await reviewGeneratedReel({
                videoUrl,
                postId: post.id,
                visualBrief: post.visual_description || post.hook || '',
                businessType: clientSettings?.business_type || undefined,
              });
              if (qa.verdict === 'hard_fail') {
                console.warn(`[Content] cron Reel QA HARD FAIL for ${post.id}: ${qa.issue}. Downgrading to still post.`);
                videoUrl = null;
                updateData.video_url = null;
                updateData.format = 'post';
                updateData.publish_diagnostic = `reel_qa_hard_fail:${(qa.issue || 'unknown').substring(0, 100)}`;
              } else if (qa.verdict === 'soft_fail') {
                console.warn(`[Content] cron Reel QA soft fail for ${post.id}: ${qa.issue} (proceeding)`);
                updateData.publish_diagnostic = `reel_qa_soft_fail:${(qa.issue || 'unknown').substring(0, 100)}`;
              }
            } catch (qaErr: any) {
              console.warn('[Content] cron Reel QA non-fatal:', qaErr?.message);
            }
          }

          // Publish to platform
          let igPermalink: string | undefined;
          let ttPublishId: string | undefined;
          let pubError: string | undefined;
          const postWithVideo = { ...post, video_url: videoUrl };

          if (post.platform === 'instagram' && (post.visual_url || videoUrl)) {
            if (!igTokenValid) {
              // Skip Instagram publication — token is invalid
              pubError = 'Instagram token invalid (pre-publish check failed). Skipped.';
              console.warn(`[Content] Skipping Instagram post ${post.id}: token invalid`);
              updateData.status = 'publish_failed';
              updateData.publish_error = pubError;
              updateData.publish_diagnostic = { platform: 'Instagram', reason: 'token_invalid_pre_check', severity: 'critical', detail: pubError, timestamp: new Date().toISOString() };
              delete updateData.published_at;
            } else {
              const igResult = await publishToInstagram(postWithVideo, supabase, orgId, userId);
              if (igResult.success) {
                igPermalink = igResult.permalink;
                if (igResult.permalink) updateData.instagram_permalink = igResult.permalink;
              } else {
                pubError = igResult.error;
                const isDuplicate = igResult.error?.includes('Duplicate');
                if (isDuplicate) {
                  console.log(`[Content] Duplicate detected for post ${post.id} — skipping`);
                  updateData.status = 'skipped';
                  updateData.publish_error = igResult.error;
                  delete updateData.published_at;
                } else {
                  console.warn(`[Content] Instagram publish failed for post ${post.id}: ${igResult.error}`);
                  const scheduled = await applyPublishRetry(supabase, updateData, post.retry_count || 0, igResult.error || '', post.id, 'Instagram');
                  if (!scheduled) {
                    const diag = diagnosePublishFailure('Instagram', igResult.error || '');
                    updateData.status = 'publish_failed';
                    updateData.publish_error = igResult.error || 'Unknown Instagram error';
                    updateData.publish_diagnostic = { platform: 'Instagram', reason: diag.reason, severity: diag.severity, detail: diag.detail, timestamp: new Date().toISOString() };
                    delete updateData.published_at;
                    await sendPublishAlert(diag, `Post ${post.id} — ${post.hook || post.caption?.substring(0, 60) || 'N/A'}`, supabase);
                  }
                }
              }
            }
          } else if (post.platform === 'tiktok' && (post.visual_url || videoUrl)) {
            const ttResult = await publishToTikTok(postWithVideo, supabase);
            if (ttResult.success) {
              ttPublishId = ttResult.publish_id;
              if (ttResult.publish_id) updateData.tiktok_publish_id = ttResult.publish_id;
            } else {
              pubError = ttResult.error;
              console.warn(`[Content] TikTok publish failed for post ${post.id}: ${ttResult.error}`);
              const scheduled = await applyPublishRetry(supabase, updateData, post.retry_count || 0, ttResult.error || '', post.id, 'TikTok');
              if (!scheduled) {
                const diag = diagnosePublishFailure('TikTok', ttResult.error || '');
                updateData.status = 'publish_failed';
                updateData.publish_error = ttResult.error || 'Unknown TikTok error';
                updateData.publish_diagnostic = { platform: 'TikTok', reason: diag.reason, severity: diag.severity, detail: diag.detail, timestamp: new Date().toISOString() };
                delete updateData.published_at;
                await sendPublishAlert(diag, `Post ${post.id} — ${post.hook || post.caption?.substring(0, 60) || 'N/A'}`, supabase);
              }
            }
          }

          await supabase.from('content_calendar').update(updateData).eq('id', post.id);
          if (!pubError) publishedCount++;
          publishedPosts.push({
            platform: post.platform,
            format: post.format,
            hook: post.hook || '',
            instagram_permalink: igPermalink,
            publication_error: pubError,
          });
        }

        // Generate visuals and publish for posts without visuals
        for (const post of (readyPosts || []).filter((p: any) => !skipPlatforms.has(p.platform || 'instagram'))) {
          const visualDesc = post.visual_description || post.hook || post.caption;
          if (visualDesc) {
            const visualUrl = await generateVisual(visualDesc, post.format || 'post');
            if (visualUrl) {
              const updateData: Record<string, any> = {
                visual_url: visualUrl,
                status: 'published',
                published_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };

              // Publish to platform
              let igPermalink2: string | undefined;
              let pubError2: string | undefined;
              if (post.platform === 'instagram') {
                if (!igTokenValid) {
                  pubError2 = 'Instagram token invalid (pre-publish check failed). Skipped.';
                  console.warn(`[Content] Skipping Instagram post ${post.id}: token invalid`);
                  updateData.status = 'publish_failed';
                  updateData.publish_error = pubError2;
                  updateData.publish_diagnostic = { platform: 'Instagram', reason: 'token_invalid_pre_check', severity: 'critical', detail: pubError2, timestamp: new Date().toISOString() };
                  delete updateData.published_at;
                } else {
                  const igResult = await publishToInstagram({ ...post, visual_url: visualUrl }, supabase, orgId, userId);
                  if (igResult.success) {
                    igPermalink2 = igResult.permalink;
                    if (igResult.permalink) updateData.instagram_permalink = igResult.permalink;
                  } else {
                    pubError2 = igResult.error;
                    console.warn(`[Content] Instagram publish failed for post ${post.id}: ${igResult.error}`);
                    const scheduled = await applyPublishRetry(supabase, updateData, post.retry_count || 0, igResult.error || '', post.id, 'Instagram');
                    if (!scheduled) {
                      const diag = diagnosePublishFailure('Instagram', igResult.error || '');
                      updateData.status = 'publish_failed';
                      updateData.publish_error = igResult.error || 'Unknown Instagram error';
                      updateData.publish_diagnostic = { platform: 'Instagram', reason: diag.reason, severity: diag.severity, detail: diag.detail, timestamp: new Date().toISOString() };
                      delete updateData.published_at;
                      await sendPublishAlert(diag, `Post ${post.id} — ${post.hook || post.caption?.substring(0, 60) || 'N/A'}`, supabase);
                    }
                  }
                }
              } else if (post.platform === 'tiktok') {
                const ttResult = await publishToTikTok({ ...post, visual_url: visualUrl }, supabase);
                if (ttResult.success && ttResult.publish_id) {
                  updateData.tiktok_publish_id = ttResult.publish_id;
                } else {
                  pubError2 = ttResult.error;
                  console.warn(`[Content] TikTok publish failed for post ${post.id}: ${ttResult.error}`);
                  const scheduled = await applyPublishRetry(supabase, updateData, post.retry_count || 0, ttResult.error || '', post.id, 'TikTok');
                  if (!scheduled) {
                    const diag = diagnosePublishFailure('TikTok', ttResult.error || '');
                    updateData.status = 'publish_failed';
                    updateData.publish_error = ttResult.error || 'Unknown TikTok error';
                    updateData.publish_diagnostic = { platform: 'TikTok', reason: diag.reason, severity: diag.severity, detail: diag.detail, timestamp: new Date().toISOString() };
                    delete updateData.published_at;
                    await sendPublishAlert(diag, `Post ${post.id} — ${post.hook || post.caption?.substring(0, 60) || 'N/A'}`, supabase);
                  }
                }
              }

              await supabase.from('content_calendar').update(updateData).eq('id', post.id);
              if (!pubError2) publishedCount++;
              publishedPosts.push({
                platform: post.platform,
                format: post.format,
                hook: post.hook || '',
                instagram_permalink: igPermalink2,
                publication_error: pubError2,
              });
            }
          }
        }

        // If no posts existed at all, generate + publish one on the fly
        if (publishedCount === 0 && (!readyPosts || readyPosts.length === 0) && (!approvedWithVisuals || approvedWithVisuals.length === 0)) {
          console.log('[Content] No posts to publish — generating a fresh one now');
          const dayOfWeek = new Date().getDay();
          return generateDailyPost(supabase, todayDate, dayOfWeek, undefined, undefined, undefined, orgId, userId, clientSettings);
        }

        const nowISO = new Date().toISOString();
        await supabase.from('agent_logs').insert({
          agent: 'content',
          action: 'execute_publication',
          data: {
            total: publishedCount,
            success: publishedCount,
            failed: 0,
            published: publishedPosts,
          },
          created_at: nowISO,
          ...(orgId ? { org_id: orgId } : {}),
        });

        // Also report to CEO — 2026-06-03 dedup to 1/day/agent
        const { logReportToCeoOnce: logReportContent } = await import('@/lib/agents/report-to-ceo');
        await logReportContent(supabase, {
          agent: 'content',
          org_id: orgId || undefined,
          data: { phase: 'completed', message: `Contenu: ${publishedCount} publications exécutées` },
        });

        // Notify client of batch publication
        if (userId && publishedCount > 0) {
          try {
            const { notifyClient } = await import('@/lib/agents/notify-client');
            await notifyClient(supabase, {
              userId,
              agent: 'content',
              title: `${publishedCount} post${publishedCount > 1 ? 's' : ''} publie${publishedCount > 1 ? 's' : ''}`,
              message: publishedPosts.map((p: any) => `${p.platform}: ${(p.caption || p.hook || '').substring(0, 50)}`).join('\n'),
              data: { count: publishedCount, posts: publishedPosts },
            });
          } catch {}
        }

        // ── Save learnings from publication ──
        try {
          if (publishedCount > 0) {
            await saveLearning(supabase, {
              agent: 'content',
              category: 'content',
              learning: `Publication: ${publishedCount} posts publiés avec succès`,
              evidence: `Published ${publishedCount} posts`,
              confidence: 25,
            }, orgId);
          }
        } catch (learnErr: any) {
          console.warn('[ContentAgent] Learning save error:', learnErr.message);
        }

        // ── Feedback to CEO ──
        try {
          const failedCount = (publishedPosts || []).filter((p: any) => p.error).length;
          await saveAgentFeedback(supabase, {
            from_agent: 'content',
            to_agent: 'ceo',
            feedback: `Publication: ${publishedCount} posts publiés. ${failedCount > 0 ? `⚠️ ${failedCount} échecs.` : 'Zéro échec.'} Pipeline contenu opérationnel.`,
            category: 'content',
          }, orgId);
        } catch (fbErr: any) {
          console.warn('[ContentAgent] Feedback save error:', (fbErr as any).message);
        }

        return NextResponse.json({ ok: true, published: publishedCount, posts: publishedPosts });
      }

      case 'fix_captions': {
        // Reformate all draft/approved/published captions to new airy UX format
        const { data: postsToFix } = await supabase
          .from('content_calendar')
          .select('id, caption, platform, hook, visual_description, status, hashtags')
          .in('status', ['draft', 'approved', 'published'])
          .not('caption', 'is', null)
          .order('created_at', { ascending: false })
          .limit(body.limit || 50);

        let fixed = 0;
        let skipped = 0;
        const fixResults: Array<{ id: string; status: string; preview?: string }> = [];

        for (const post of postsToFix || []) {
          if (!post.caption || post.caption.trim().length < 20) {
            skipped++;
            continue;
          }

          // Check if already well-formatted (has multiple section breaks)
          const sectionBreaks = (post.caption.match(/\n\n/g) || []).length;
          if (sectionBreaks >= 2 && !body.force) {
            skipped++;
            fixResults.push({ id: post.id, status: 'already_formatted' });
            continue;
          }

          try {
            // Remove hashtags from caption if they're embedded
            let cleanCaption = post.caption;
            if (post.hashtags && Array.isArray(post.hashtags)) {
              cleanCaption = cleanCaption.replace(/\n*[・.]*\n*#[\w\u00C0-\u024F]+(\s+#[\w\u00C0-\u024F]+)*/g, '').trim();
            }

            const newCaption = await callClaude({
              system: `Tu reformates des captions de réseaux sociaux pour qu'elles soient VISUELLEMENT AGRÉABLES sur mobile.

RÈGLES :
1. Hook punch sur la première ligne (5-10 mots) avec 1 emoji
2. Ligne vide (\\n\\n) après le hook
3. Corps : 2-4 lignes courtes avec emoji en début de ligne comme bullet points
4. Ligne vide (\\n\\n)
5. CTA clair sur sa propre ligne
6. NE PAS inclure de hashtags
7. Max 3-5 emojis total
8. La caption DOIT rester cohérente avec le hook et le visuel
9. Garde le MÊME MESSAGE que l'original, reformate juste la mise en page
10. Max 800 chars Instagram, 500 chars TikTok
11. JAMAIS de pavé — chaque section séparée par \\n\\n

Output UNIQUEMENT la nouvelle caption.`,
              message: `Plateforme: ${post.platform || 'instagram'}
Hook: ${post.hook || 'N/A'}
Description visuelle: ${(post.visual_description || '').substring(0, 200)}
Caption originale à reformater:
${cleanCaption}`,
              maxTokens: 800,
            });

            if (newCaption && newCaption.trim().length > 20) {
              // Remove any hashtags Claude might have added
              const finalCaption = newCaption.replace(/\n*[・.]*\n*#[\w\u00C0-\u024F]+(\s+#[\w\u00C0-\u024F]+)*/g, '').trim();

              await supabase
                .from('content_calendar')
                .update({ caption: finalCaption, updated_at: new Date().toISOString() })
                .eq('id', post.id);

              fixed++;
              fixResults.push({ id: post.id, status: 'fixed', preview: finalCaption.substring(0, 80) });
            }
          } catch (err: any) {
            fixResults.push({ id: post.id, status: 'error', preview: err.message });
          }
        }

        return NextResponse.json({
          ok: true,
          total: postsToFix?.length || 0,
          fixed,
          skipped,
          results: fixResults,
        });
      }

      case 'stats': {
        const [
          { count: totalPosts },
          { count: published },
          { count: drafts },
          { count: approved },
          { count: failed },
        ] = await Promise.all([
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }),
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'published'),
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'publish_failed'),
        ]);

        const { data: byPlatform } = await supabase
          .from('content_calendar')
          .select('platform')
          .eq('status', 'published');

        const platforms = { instagram: 0, tiktok: 0, linkedin: 0 };
        for (const p of byPlatform || []) platforms[p.platform as keyof typeof platforms]++;

        return NextResponse.json({
          ok: true,
          stats: { total: totalPosts || 0, published: published || 0, drafts: drafts || 0, approved: approved || 0, failed: failed || 0, byPlatform: platforms },
        });
      }

      case 'update_post': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const updates: Record<string, any> = {};
        if (body.hook !== undefined) updates.hook = body.hook;
        if (body.caption !== undefined) updates.caption = body.caption;
        if (body.visual_description !== undefined) updates.visual_description = body.visual_description;
        if (body.platform !== undefined) updates.platform = body.platform;
        if (body.format !== undefined) updates.format = body.format;
        if (body.hashtags !== undefined) updates.hashtags = body.hashtags;
        if (Object.keys(updates).length === 0) return NextResponse.json({ ok: false, error: 'No fields to update' }, { status: 400 });
        updates.updated_at = new Date().toISOString();
        const { error } = await supabase.from('content_calendar').update(updates).eq('id', body.postId);
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        const { data: updated } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        return NextResponse.json({ ok: true, post: updated });
      }

      case 'revise_post': {
        if (!body.postId || !body.instructions) return NextResponse.json({ ok: false, error: 'postId and instructions required' }, { status: 400 });
        const { data: currentPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!currentPost) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });

        const reviseRaw = await callClaude({
          system: `Tu es un expert en contenu social media pour KeiroAI. L'utilisateur veut modifier un post existant.
Applique ses instructions et retourne le JSON complet mis à jour.
Champs obligatoires : platform, format, pillar, hook, caption, hashtags, visual_description
Retourne UNIQUEMENT du JSON valide, sans markdown.`,
          message: `Post actuel :
${JSON.stringify({ platform: currentPost.platform, format: currentPost.format, pillar: currentPost.pillar, hook: currentPost.hook, caption: currentPost.caption, hashtags: currentPost.hashtags, visual_description: currentPost.visual_description }, null, 2)}

Instructions de modification : ${body.instructions}`,
          maxTokens: 2000,
        });

        const cleanRevise = reviseRaw.replace(/```[\w]*\s*/g, '').trim();
        const reviseMatch = cleanRevise.match(/\{[\s\S]*\}/);
        if (!reviseMatch) return NextResponse.json({ ok: false, error: 'Failed to parse revision' }, { status: 500 });
        const revised = JSON.parse(reviseMatch[0]);

        const reviseUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (revised.hook) reviseUpdates.hook = revised.hook;
        if (revised.caption) reviseUpdates.caption = revised.caption;
        if (revised.visual_description) reviseUpdates.visual_description = revised.visual_description;
        if (revised.platform) reviseUpdates.platform = revised.platform;
        if (revised.format) reviseUpdates.format = revised.format;
        if (revised.hashtags) reviseUpdates.hashtags = revised.hashtags;

        await supabase.from('content_calendar').update(reviseUpdates).eq('id', body.postId);
        const { data: updatedPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        return NextResponse.json({ ok: true, post: updatedPost });
      }

      case 'generate_visual': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: postForVisual } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!postForVisual) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });
        const desc = postForVisual.visual_description || postForVisual.hook || postForVisual.caption;
        if (!desc) return NextResponse.json({ ok: false, error: 'No visual description' }, { status: 400 });
        const url = await generateVisual(desc, postForVisual.format || 'post');
        if (!url) return NextResponse.json({ ok: false, error: 'Visual generation failed' }, { status: 500 });
        await supabase.from('content_calendar').update({ visual_url: url, updated_at: new Date().toISOString() }).eq('id', body.postId);
        return NextResponse.json({ ok: true, visual_url: url });
      }

      case 'delete_post': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { error: delErr } = await supabase.from('content_calendar').delete().eq('id', body.postId);
        if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }

      case 'reset_to_draft': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        await supabase.from('content_calendar').update({
          status: 'draft',
          published_at: null,
          publish_error: null,
          publish_diagnostic: null,
          updated_at: new Date().toISOString(),
        }).eq('id', body.postId);
        return NextResponse.json({ ok: true });
      }

      case 'modify_post': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: postToModify } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!postToModify) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });

        const modifyInstruction = body.instruction || 'Améliore ce post pour le rendre plus engageant et percutant.';
        const currentCaption = postToModify.caption || '';
        const currentHook = postToModify.hook || '';

        const modifiedText = await callClaude({
          system: `Tu es un expert en contenu social media pour des commerces locaux. On te donne un post existant et une instruction de modification. Retourne un JSON avec { "hook": "...", "caption": "...", "visual_description": "..." }. Le hook doit être accrocheur (max 10 mots). La caption doit être aérée, engageante, avec des emojis stratégiques. La visual_description décrit le visuel idéal.`,
          message: `POST ACTUEL:
Hook: ${currentHook}
Caption: ${currentCaption}
Plateforme: ${postToModify.platform}
Format: ${postToModify.format}

INSTRUCTION: ${modifyInstruction}

Retourne UNIQUEMENT le JSON.`,
          maxTokens: 1500,
        });

        try {
          const cleaned = modifiedText.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          const updateFields: Record<string, any> = { updated_at: new Date().toISOString(), status: 'draft' };
          if (parsed.hook) updateFields.hook = parsed.hook;
          if (parsed.caption) updateFields.caption = parsed.caption;
          if (parsed.visual_description) updateFields.visual_description = parsed.visual_description;
          await supabase.from('content_calendar').update(updateFields).eq('id', body.postId);
          return NextResponse.json({ ok: true, modified: updateFields });
        } catch {
          return NextResponse.json({ ok: false, error: 'Failed to parse modified content' }, { status: 500 });
        }
      }

      case 'batch_plan': {
        // ── Plan N days of drafts in one shot ──
        // Body: {
        //   days: number,                 // 1..31
        //   platforms?: string[],          // default: client's connected list (or 'instagram')
        //   publishMode?: 'auto'|'notify', // sets publish_mode logged for downstream cron
        //   skipExistingDates?: boolean,   // default true — don't double-book a day
        // }
        // Drafts are status='draft' so the user reviews before publish, regardless
        // of publishMode. publishMode only kicks in when the post is later approved
        // and the cron picks it up (cf. publish-scheduled).
        const days = Math.max(1, Math.min(31, Number(body.days) || 7));
        const requestedPlatforms: string[] = Array.isArray(body.platforms) && body.platforms.length > 0
          ? body.platforms
          : ['instagram'];
        const publishMode = body.publishMode === 'notify' ? 'notify' : 'auto';
        const skipExisting = body.skipExistingDates !== false;

        // Persist publish_mode preference so cron honours it
        try {
          await supabase.from('agent_logs').insert({
            agent: 'content',
            action: 'publish_mode_config',
            status: 'success',
            data: { publish_mode: publishMode, set_via: 'batch_plan' },
            ...(orgId ? { org_id: orgId } : {}),
          });
        } catch {}

        // Find dates already covered so we don't double-book
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + days - 1);
        let existingDates = new Set<string>();
        if (skipExisting && userId) {
          const { data: existing } = await supabase
            .from('content_calendar')
            .select('scheduled_date, platform')
            .eq('user_id', userId)
            .gte('scheduled_date', startDate.toISOString().split('T')[0])
            .lte('scheduled_date', endDate.toISOString().split('T')[0])
            .in('status', ['draft', 'approved', 'published']);
          existingDates = new Set((existing || []).map((r: any) => `${r.scheduled_date}|${r.platform}`));
        }

        const created: any[] = [];
        const failed: any[] = [];
        for (let d = 0; d < days; d++) {
          const dateObj = new Date(startDate);
          dateObj.setDate(dateObj.getDate() + d);
          const dateStr = dateObj.toISOString().split('T')[0];
          const dow = dateObj.getDay();
          for (const plat of requestedPlatforms) {
            if (existingDates.has(`${dateStr}|${plat}`)) continue;
            try {
              const res = await generateDailyPost(supabase, dateStr, dow, plat, undefined, true, orgId, userId, clientSettings);
              const j: any = await (res as any).json?.();
              if (j?.ok) {
                created.push({ date: dateStr, platform: plat, id: j.post?.id || null });
              } else {
                failed.push({ date: dateStr, platform: plat, error: j?.error || 'unknown' });
              }
            } catch (e: any) {
              failed.push({ date: dateStr, platform: plat, error: e?.message || 'failed' });
            }
          }
        }

        return NextResponse.json({
          ok: true,
          created: created.length,
          failed: failed.length,
          publishMode,
          details: { created, failed: failed.slice(0, 10) },
        });
      }

      case 'calendar': {
        const startDate = body.startDate || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        const endDate = body.endDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

        let calQuery = supabase
          .from('content_calendar')
          .select('*')
          .gte('scheduled_date', startDate)
          .lte('scheduled_date', endDate)
          .order('scheduled_date', { ascending: true });
        // Filter by user_id for clients (not admin/cron)
        if (userId) calQuery = calQuery.eq('user_id', userId);
        const { data: posts } = await calQuery;

        return NextResponse.json({ ok: true, posts: posts || [] });
      }

      default:
        return NextResponse.json({ ok: false, error: `Action inconnue: ${body.action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Content] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ──────────────────────────────────────
// Generate weekly content plan
// ──────────────────────────────────────
async function generateWeeklyPlan(supabase: any, filterPlatform?: string, draftOnly?: boolean, orgId: string | null = null, userId: string | null = null, dayOffset: number = 0) {
  const now = new Date();
  const nowISO = now.toISOString();

  // Get last 10 published posts for context (avoid repetition)
  const { data: recentPosts } = await supabase
    .from('content_calendar')
    .select('platform, format, pillar, hook, caption, scheduled_date')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(10);

  const existingPlanned = recentPosts?.map((p: any) => `${p.scheduled_date} ${p.platform} ${p.pillar}: ${p.hook || p.caption?.substring(0, 50)}`).join('\n') || '';

  // 2026-06-04 — Get target week start, shifted by dayOffset so the
  // multi-week loop generates week N+1, N+2 etc. without colliding.
  const mondayDate = new Date(now);
  mondayDate.setDate(mondayDate.getDate() - mondayDate.getDay() + 1 + dayOffset);
  const sundayDate = new Date(mondayDate);
  sundayDate.setDate(sundayDate.getDate() + 6);

  const { data: thisWeek } = await supabase
    .from('content_calendar')
    .select('scheduled_date, platform')
    .gte('scheduled_date', mondayDate.toISOString().split('T')[0])
    .lte('scheduled_date', sundayDate.toISOString().split('T')[0]);

  // Founder rule 2026-06-11: publier TOUS LES JOURS sur les 2 réseaux (IG + TikTok).
  // The week is "already planned" ONLY when every one of the 7 days already has
  // BOTH an Instagram and a TikTok slot. The old `length >= 7` check stopped at
  // 7 posts total, which let the planner cover one network/day and skip the
  // other — Créateur ended up ~1 réseau/jour au lieu de 2.
  const planFilter = filterPlatform && filterPlatform !== 'all' ? filterPlatform : null;
  const coverageNeeded: string[] = planFilter ? [planFilter] : ['instagram', 'tiktok'];
  const byDayCoverage = new Map<string, Set<string>>();
  for (const r of (thisWeek || []) as any[]) {
    const set = byDayCoverage.get(r.scheduled_date) || new Set<string>();
    set.add(r.platform);
    byDayCoverage.set(r.scheduled_date, set);
  }
  let fullyCoveredDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    const set = byDayCoverage.get(ds);
    if (set && coverageNeeded.every(p => set.has(p))) fullyCoveredDays++;
  }
  if (fullyCoveredDays >= 7) {
    return NextResponse.json({ ok: true, message: `Week starting ${mondayDate.toISOString().split('T')[0]} already covered (${coverageNeeded.join('+')} daily)`, postsPlanned: (thisWeek || []).length, inserted: 0 });
  }

  const prompt = getWeeklyPlanPrompt({ existingPlanned });

  // The elite system prompt already contains all visual rules, timing, and brand guidelines
  const enhancedSystemPrompt = getContentSystemPrompt();

  let rawText: string;
  try {
    rawText = await callClaude({
      system: enhancedSystemPrompt,
      message: prompt,
      maxTokens: 8000,
    });
  } catch (claudeError: any) {
    console.error('[Content] Claude API error for weekly plan:', claudeError.message);
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'weekly_plan_failed',
      data: { error: claudeError.message, phase: 'claude_call' },
      status: 'error', error_message: claudeError.message, created_at: nowISO,
      ...(orgId ? { org_id: orgId } : {}),
    });
    return NextResponse.json({ ok: false, error: `Claude error: ${claudeError.message}` }, { status: 502 });
  }

  let weekPlan: any[];
  try {
    const { tolerantArrayParse } = await import('@/lib/agents/json-tolerant');
    const parseResult = tolerantArrayParse<any>(rawText);
    if (parseResult.ok && parseResult.data && parseResult.data.length > 0) {
      weekPlan = parseResult.data;
      if (parseResult.partial) {
        console.log(`[Content] Weekly plan: salvaged ${weekPlan.length} objects from partial JSON`);
      }
    } else {
      throw new Error(parseResult.reason || 'tolerant parse failed');
    }
  } catch (parseError) {
    console.error('[Content] Weekly plan parse error — falling back to daily post. Raw:', rawText.substring(0, 300));
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'weekly_plan_failed',
      data: { raw: rawText.substring(0, 500), error: String(parseError) },
      status: 'error', error_message: String(parseError), created_at: nowISO,
      ...(orgId ? { org_id: orgId } : {}),
    });
    // Don't crash — fall through to daily post generation instead
    console.log('[Content] Generating daily post as fallback...');
    const today = new Date();
    return generateDailyPost(supabase, today.toISOString().split('T')[0], today.getUTCDay(), undefined, undefined, undefined, orgId, userId, {});
  }

  // Map day names to dates
  const dayMap: Record<string, number> = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };

  // Use passed userId for content ownership (not admin!)
  const contentUserId = userId || null;

  let inserted = 0;
  for (const post of weekPlan) {
    const dayNum = dayMap[(post.day || '').toLowerCase()] ?? null;
    let scheduledDate = mondayDate.toISOString().split('T')[0];

    if (dayNum !== null) {
      const postDate = new Date(mondayDate);
      const offset = dayNum === 0 ? 6 : dayNum - 1;
      postDate.setDate(postDate.getDate() + offset);
      scheduledDate = postDate.toISOString().split('T')[0];
    }

    // Parse optimal time
    let scheduledTime = '12:00';
    if (post.best_time) {
      const timeMatch = post.best_time.match(/(\d{1,2})[h:](\d{2})?/);
      if (timeMatch) {
        scheduledTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`;
      }
    }

    // Sanitize values to match DB check constraints
    const VALID_PLATFORMS = ['instagram', 'tiktok', 'linkedin'];
    const VALID_FORMATS = ['carrousel', 'reel', 'story', 'post', 'video', 'text'];
    const VALID_PILLARS = ['tips', 'demo', 'social_proof', 'trends'];
    const PILLAR_MAP: Record<string, string> = { giving_value: 'tips', educational: 'tips', cta: 'demo', behind_the_scenes: 'demo', pain_point: 'tips' };
    const rawPlatform = ((filterPlatform && filterPlatform !== 'all' ? filterPlatform : null) || post.platform || 'instagram').toLowerCase();
    const rawFormat = (post.format || 'post').toLowerCase().replace('carousel', 'carrousel');
    const postPlatform = VALID_PLATFORMS.includes(rawPlatform) ? rawPlatform : 'instagram';
    const postFormat = VALID_FORMATS.includes(rawFormat) ? rawFormat : 'post';
    const rawPillar = (post.pillar || 'tips').toLowerCase();
    const postPillar = VALID_PILLARS.includes(rawPillar) ? rawPillar : (PILLAR_MAP[rawPillar] || 'tips');

    const { error: insertError } = await supabase.from('content_calendar').insert({
      platform: postPlatform,
      format: postFormat,
      pillar: postPillar,
      hook: post.hook || null,
      caption: post.caption || '',
      hashtags: post.hashtags || [],
      visual_description: post.visual_description || post.thumbnail_description || null,
      slides: post.slides || null,
      script: post.script || null,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      status: draftOnly ? 'draft' : 'approved',
      ai_generated: true,
      ...(contentUserId ? { user_id: contentUserId } : {}),
    });

    if (insertError) {
      console.error(`[Content] DB insert error for post ${post.day}/${postPlatform}:`, insertError.message);
    } else {
      inserted++;
      // Generate visual using KeiroAI Seedream (proof of product) + auto-publish if not draft
      if (!draftOnly) {
        const postVisualDesc = post.thumbnail_description || post.visual_description || post.hook;
        if (postVisualDesc) {
          const postVisualUrl = await generateVisual(postVisualDesc, post.format || 'post');
          if (postVisualUrl) {
            await supabase.from('content_calendar')
              .update({ visual_url: postVisualUrl, status: 'approved', updated_at: new Date().toISOString() })
              .eq('scheduled_date', scheduledDate)
              .eq('platform', postPlatform)
              .eq('status', 'approved')
              .is('visual_url', null);
          }
        }
      }
    }
  }

  const planStatus = inserted > 0 ? 'success' : 'error';
  await supabase.from('agent_logs').insert({
    agent: 'content', action: 'weekly_plan_generated',
    data: { postsPlanned: inserted, totalAttempted: weekPlan.length, weekStart: mondayDate.toISOString().split('T')[0] },
    status: planStatus, error_message: inserted === 0 ? `0/${weekPlan.length} posts inserted — all DB inserts failed` : undefined,
    created_at: nowISO,
    ...(orgId ? { org_id: orgId } : {}),
  });

  // ── Save learnings from weekly plan ──
  try {
    if (inserted > 0) {
      await saveLearning(supabase, {
        agent: 'content',
        category: 'content',
        learning: `Plan hebdo généré: ${inserted}/${weekPlan.length} posts planifiés (semaine du ${mondayDate.toISOString().split('T')[0]})`,
        evidence: `weekly_plan: ${inserted} inserted out of ${weekPlan.length} attempted`,
        confidence: 20,
      }, orgId);
    }
  } catch (learnErr: any) {
    console.warn('[ContentAgent] Learning save error:', learnErr.message);
  }

  // Report strategy to marketing agent for alignment
  const platformBreakdown: Record<string, number> = {};
  const pillarBreakdown: Record<string, number> = {};
  for (const post of weekPlan) {
    const p = post.platform || 'instagram';
    const pi = post.pillar || 'tips';
    platformBreakdown[p] = (platformBreakdown[p] || 0) + 1;
    pillarBreakdown[pi] = (pillarBreakdown[pi] || 0) + 1;
  }

  const { logReportToCeoOnce: logReportWeekly } = await import('@/lib/agents/report-to-ceo');
  await logReportWeekly(supabase, {
    agent: 'content',
    org_id: orgId || undefined,
    data: {
      phase: 'weekly_plan',
      message: `Contenu: ${inserted} posts planifies cette semaine`,
      strategy: {
        platforms: platformBreakdown,
        pillars: pillarBreakdown,
        grid_colors: weekPlan.map((p: any) => p.grid_color).filter(Boolean),
        week_start: mondayDate.toISOString().split('T')[0],
      },
    },
  });

  console.log(`[Content] Weekly plan: ${inserted}/${weekPlan.length} posts planned`);

  if (inserted === 0) {
    return NextResponse.json({ ok: false, error: `Weekly plan generated ${weekPlan.length} posts from AI but all DB inserts failed`, postsPlanned: 0 }, { status: 500 });
  }

  return NextResponse.json({ ok: true, postsPlanned: inserted });
}

// ──────────────────────────────────────
// Generate week with visuals + optional Instagram publishing
// ──────────────────────────────────────
async function generateWeekWithVisuals(supabase: any, publishAll: boolean, orgId: string | null = null, userId: string | null = null) {
  const now = new Date();
  const nowISO = now.toISOString();

  console.log(`[Content] generate_week: starting (publishAll=${publishAll})`);

  // 2026-06-09 — Étend à 30 jours pour anti-réutilisation news.
  // Founder rule: une news utilisée dans les 30 derniers jours
  // = INTERDIT de la reprendre (sauf événements calendrier marketing).
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const { data: recentPosts } = await supabase
    .from('content_calendar')
    .select('platform, format, pillar, hook, caption, visual_description, scheduled_date')
    .eq('user_id', userId || '')
    .in('status', ['draft', 'approved', 'published'])
    .gte('scheduled_date', thirtyDaysAgo)
    .order('scheduled_date', { ascending: false })
    .limit(60);

  const existingPlanned = recentPosts?.slice(0, 10).map((p: any) => `${p.scheduled_date} ${p.platform} ${p.pillar}: ${p.hook || p.caption?.substring(0, 50)}`).join('\n') || '';

  // Extract recent visuals for anti-duplication
  const recentVisualDescs = recentPosts?.slice(0, 15).map((p: any) => (p.visual_description || '').substring(0, 100)).filter((v: string) => v.length > 10) || [];
  const visualDedupContext = recentVisualDescs.length > 0
    ? `\nVISUELS RÉCENTS (INTERDIT de réutiliser ces concepts/scènes/couleurs) :\n${recentVisualDescs.map((v: string, i: number) => `${i + 1}. ${v}`).join('\n')}\n→ Chaque visual_description de la semaine doit être UNIQUE et DIFFÉRENT de tous ces visuels ET différent des autres posts de la semaine.\n→ VARIE les couleurs dominantes : max 1 post violet sur 5, alterne ambre/bleu/vert/corail/noir/blanc.\n→ VARIE les cibles prospects : restaurant, coiffeur, boutique, coach, fleuriste, freelance... pas le même 2 fois de suite.\n`
    : '';

  // 2026-06-09 — Anti-réutilisation news/trends sur 30 derniers jours.
  // Extrait les hooks + captions des 30 derniers jours pour fournir
  // l'historique à Léna. Elle doit éviter toute redite (sauf événements
  // calendrier marketing comme Black Friday).
  const recentHooksFull = recentPosts?.map((p: any) => p.hook).filter(Boolean) as string[];
  const newsHistoryContext = recentHooksFull.length > 0
    ? `\nHISTORIQUE NEWS/HOOKS UTILISÉS (30 DERNIERS JOURS — NE PAS RÉUTILISER) :\n${recentHooksFull.slice(0, 30).map((h: string, i: number) => `${i + 1}. ${h}`).join('\n')}\n→ Aucun de ces angles/news ne doit revenir cette semaine, SAUF si c'est un évènement du calendrier marketing (soldes, Black Friday, fêtes, rentrée).\n→ Si tu manques d'idées fraîches, préfère un post evergreen (tips/social_proof/demo) plutôt que de recycler.\n`
    : '';

  // Calculate next Monday
  const mondayDate = new Date(now);
  const currentDay = mondayDate.getDay();
  const daysUntilMonday = currentDay === 0 ? 1 : (8 - currentDay);
  mondayDate.setDate(mondayDate.getDate() + daysUntilMonday);

  // 2026-06-09 — Inject mutualised supervision learnings.
  // Patterns/résolutions venues d'audits sur d'autres clients du
  // même business_type sont rendues disponibles dans le prompt
  // pour que Léna les respecte automatiquement.
  let knowledgeBlock = '';
  if (userId) {
    try {
      const { applicableKnowledge, knowledgeAsPromptBlock, recordKnowledgeUsage } = await import('@/lib/admin/knowledge-applier');
      const rows = await applicableKnowledge(supabase, 'content', userId, { minConfidence: 0.5, limit: 12 });
      knowledgeBlock = knowledgeAsPromptBlock(rows);
      recordKnowledgeUsage(supabase, rows.map(r => r.id)).catch(() => {});
    } catch (e: any) {
      console.warn('[Content] knowledge-applier failed:', e?.message);
    }
  }

  // 2026-06-09 — Cadence mix : on lit le curseur image/vidéo du client
  // et on instruit Léna directement dans le prompt.
  let cadenceBlock = '';
  if (userId) {
    try {
      const { data: cfgRow } = await supabase
        .from('org_agent_configs')
        .select('config')
        .eq('user_id', userId)
        .eq('agent_id', 'content')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const videoRatio = ((cfgRow as any)?.config?.video_ratio ?? 40) as number;
      const { resolveEffectivePlan } = await import('@/lib/credits/plan-budget-guard');
      const effectivePlan = await resolveEffectivePlan(supabase, userId, 'content');
      // Récupère le preview de cadence pour l'injecter en chiffres concrets
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      try {
        const previewRes = await fetch(`${baseUrl}/api/agents/content/cadence-preview?plan=${effectivePlan}&video_ratio=${videoRatio}`);
        const preview = await previewRes.json();
        if (preview.ok) {
          const c = preview.cadence;
          cadenceBlock = `\n## CADENCE OBLIGATOIRE (plan ${effectivePlan}, mix ${videoRatio}% vidéo)\n\nRespecte STRICTEMENT cette répartition sur la semaine :\n- Instagram : ${c.ig_posts_per_week} posts feed + ${c.ig_reels_per_week} reel(s) + 1 story/jour (recycle)\n- TikTok : ${c.tt_videos_per_week} vidéo(s) + 1 photo mode/jour (recycle)\n- LinkedIn : ${c.linkedin_per_week} post(s)/semaine ${c.linkedin_per_week === 0 ? '(LinkedIn DÉSACTIVÉ pour ce plan)' : ''}\n\nNE GÉNÈRE PAS plus que ces quantités. Si LinkedIn = 0, NE crée AUCUN post LinkedIn.\n`;
        }
      } catch { /* fallback: no cadence block */ }
    } catch (e: any) {
      console.warn('[Content] cadence injection failed:', e?.message);
    }
  }

  const prompt = getWeeklyPlanPrompt({ existingPlanned }) + visualDedupContext + newsHistoryContext + cadenceBlock + knowledgeBlock;
  const systemPrompt = getContentSystemPrompt();

  let rawText: string;
  try {
    rawText = await callClaude({
      system: systemPrompt,
      message: prompt,
      maxTokens: 8000,
    });
  } catch (claudeError: any) {
    console.error('[Content] generate_week Claude error:', claudeError.message);
    return NextResponse.json({ ok: false, error: `Claude error: ${claudeError.message}` }, { status: 502 });
  }

  let weekPlan: any[];
  try {
    const { tolerantArrayParse } = await import('@/lib/agents/json-tolerant');
    const parseResult = tolerantArrayParse<any>(rawText);
    if (parseResult.ok && parseResult.data && parseResult.data.length > 0) {
      weekPlan = parseResult.data;
      if (parseResult.partial) {
        console.log(`[Content] generate_week: salvaged ${weekPlan.length} objects from partial JSON`);
      }
    } else {
      throw new Error(parseResult.reason || 'tolerant parse failed');
    }
  } catch (parseError) {
    console.error('[Content] generate_week parse error:', parseError, 'Raw:', rawText.substring(0, 300));
    return NextResponse.json({ ok: false, error: 'Failed to parse weekly plan' }, { status: 500 });
  }

  const dayMap: Record<string, number> = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };

  const results: Array<{
    day: string;
    platform: string;
    format: string;
    hook: string;
    visual_url: string | null;
    status: string;
    instagram_permalink?: string;
    publication_error?: string;
    qa_severity?: string;
    qa_findings?: number;
  }> = [];

  // 2026-06-09 — Quality validators (Phase 1).
  // Run batch validation on the entire week plan BEFORE insert.
  // Catches AI-tells, forbidden claims, duplicate hooks/captions,
  // intra-batch replication. Posts flagged `block` are inserted as
  // status='draft_qa_failed' (not auto-publishable, admin reviews
  // via /admin/agents/control). `warn` lets the post through but
  // logs in agent_logs so the supervisor audit picks it up.
  let qaResults: any[] = [];
  if (userId && weekPlan.length > 0) {
    try {
      const { validatePostBatch } = await import('@/lib/validators');
      const { data: qaProfile } = await supabase.from('profiles').select('business_type').eq('id', userId).maybeSingle();
      const businessType = (qaProfile as any)?.business_type || null;
      const batchOut = await validatePostBatch(
        supabase,
        weekPlan.map((p: any) => ({
          caption: p.caption,
          hook: p.hook,
          hashtags: p.hashtags,
          visual_description: p.thumbnail_description || p.visual_description,
          format: p.format,
          platform: p.platform,
        })),
        { user_id: userId, business_type: businessType, platform: 'instagram', format: 'post' },
      );
      qaResults = batchOut.results;
      console.log(`[Content] QA batch: ${batchOut.summary.block} block / ${batchOut.summary.warn} warn / ${batchOut.summary.ok} clean · avg_quality=${batchOut.summary.avg_quality}`);
      // Log to agent_logs so the supervisor audit picks it up
      await supabase.from('agent_logs').insert({
        agent: 'content',
        action: 'qa_validation_batch',
        status: batchOut.summary.block > 0 ? 'error' : 'success',
        user_id: userId,
        data: {
          batch_size: weekPlan.length,
          block: batchOut.summary.block,
          warn: batchOut.summary.warn,
          ok: batchOut.summary.ok,
          avg_quality: batchOut.summary.avg_quality,
          findings_sample: qaResults.slice(0, 3).map((r: any) => r.findings),
        },
      }).then(() => {}, () => {});
    } catch (qaErr: any) {
      console.warn('[Content] QA batch failed (non-blocking):', qaErr?.message);
    }
  }

  // Process posts sequentially (Seedream rate limits)
  for (const post of weekPlan) {
    const qa = qaResults[weekPlan.indexOf(post)] || null;
    const dayNum = dayMap[(post.day || '').toLowerCase()] ?? null;
    let scheduledDate = mondayDate.toISOString().split('T')[0];

    if (dayNum !== null) {
      const postDate = new Date(mondayDate);
      const offset = dayNum === 0 ? 6 : dayNum - 1;
      postDate.setDate(postDate.getDate() + offset);
      scheduledDate = postDate.toISOString().split('T')[0];
    }

    let scheduledTime = '12:00';
    if (post.best_time) {
      const timeMatch = post.best_time.match(/(\d{1,2})[h:](\d{2})?/);
      if (timeMatch) scheduledTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`;
    }

    const platform = post.platform || 'instagram';
    const format = post.format || 'post';

    // QA gate: a `block`-severity finding routes to draft_qa_failed
    // instead of draft. Admin will review via supervision cockpit.
    // `warn` and below pass through normally.
    const qaSeverity = (qa as any)?.severity || 'clean';
    const initialStatus = qaSeverity === 'block' ? 'draft_qa_failed' : 'draft';
    const qaFindings = (qa as any)?.findings || [];
    const qaNotes = qaFindings.length > 0
      ? qaFindings.map((f: any) => `[${f.severity}] ${f.code}: ${f.message}`).join(' · ')
      : null;
    const qaScore = (qa as any)?.quality_score ?? null;

    // Insert into content_calendar
    const { data: inserted, error: insertError } = await supabase.from('content_calendar').insert({
      platform,
      format,
      pillar: post.pillar || 'tips',
      hook: post.hook || null,
      caption: post.caption || '',
      hashtags: post.hashtags || [],
      visual_description: post.visual_description || post.thumbnail_description || null,
      slides: post.slides || null,
      script: post.script || null,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      status: initialStatus,
      qa_severity: qaSeverity,
      qa_quality_score: qaScore,
      qa_notes: qaNotes,
      qa_findings: qaFindings.length ? qaFindings : null,
      ai_generated: true,
      user_id: userId || null,
    }).select().single();

    if (insertError) {
      console.error(`[Content] generate_week insert error for ${post.day}:`, insertError.message);
      results.push({
        day: post.day || '?',
        platform,
        format,
        hook: post.hook || '',
        visual_url: null,
        status: 'insert_failed',
        publication_error: insertError.message,
      });
      continue;
    }

    // Generate visual with Seedream (with dedup check on visual_description)
    const visualDesc = post.thumbnail_description || post.visual_description || post.hook || post.caption;
    let visualUrl: string | null = null;
    // QA block → skip Seedream entirely (économie ~0.04€ + temps).
    // L'admin re-générera après revue.
    if (qaSeverity === 'block') {
      console.warn(`[Content] QA blocked post ${inserted?.id} — skipping visual generation. Findings: ${qaNotes}`);
      results.push({
        day: post.day || '?',
        platform,
        format,
        hook: post.hook || '',
        visual_url: null,
        status: 'draft_qa_failed',
        qa_severity: qaSeverity,
        qa_findings: qaFindings.length,
      });
      continue;
    }
    if (visualDesc) {
      // Check if a very similar visual_description was already used recently
      const { data: similarPosts } = await supabase
        .from('content_calendar')
        .select('id, visual_description')
        .eq('platform', platform)
        .in('status', ['draft', 'approved', 'published'])
        .not('visual_url', 'is', null)
        .gte('scheduled_date', new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0])
        .neq('id', inserted?.id || '');

      const isDuplicateDesc = (similarPosts || []).some((p: any) => {
        if (!p.visual_description) return false;
        const existing = p.visual_description.toLowerCase().trim();
        const current = visualDesc.toLowerCase().trim();
        // Exact match or >80% overlap (first 100 chars)
        return existing === current || existing.substring(0, 100) === current.substring(0, 100);
      });

      if (isDuplicateDesc) {
        console.warn(`[Content] Skipping visual generation — duplicate visual_description detected for ${post.day}`);
        results.push({
          day: post.day || '?', platform, format,
          hook: post.hook || '', visual_url: null,
          status: 'skipped_duplicate_visual',
        });
        continue;
      }

      visualUrl = await generateVisual(visualDesc, format);
    }

    const postResult: typeof results[number] = {
      day: post.day || '?',
      platform,
      format,
      hook: post.hook || '',
      visual_url: visualUrl,
      status: visualUrl ? 'visual_ready' : 'no_visual',
    };

    if (visualUrl && inserted?.id) {
      const updateData: Record<string, any> = {
        visual_url: visualUrl,
        updated_at: new Date().toISOString(),
      };

      // Publish to Instagram if requested and platform is instagram
      if (publishAll && platform === 'instagram') {
        const igResult = await publishToInstagram(
          { format, caption: post.caption, hashtags: post.hashtags, visual_url: visualUrl },
          supabase, orgId, userId
        );

        if (igResult.success) {
          updateData.status = 'published';
          updateData.published_at = new Date().toISOString();
          if (igResult.permalink) {
            updateData.instagram_permalink = igResult.permalink;
            postResult.instagram_permalink = igResult.permalink;
          }
          postResult.status = 'published';
          console.log(`[Content] generate_week: published ${post.day} to Instagram`);
        } else {
          updateData.status = 'approved';
          postResult.status = 'publish_failed';
          postResult.publication_error = igResult.error;
          console.warn(`[Content] generate_week: Instagram publish failed for ${post.day}: ${igResult.error}`);
        }
      } else {
        updateData.status = 'approved';
        postResult.status = 'approved';
      }

      await supabase.from('content_calendar').update(updateData).eq('id', inserted.id);
    }

    results.push(postResult);
  }

  const publishedCount = results.filter(r => r.status === 'published').length;
  const totalGenerated = results.filter(r => r.visual_url).length;

  // Log
  await supabase.from('agent_logs').insert({
    agent: 'content',
    action: 'generate_week',
    data: {
      total: results.length,
      visuals_generated: totalGenerated,
      published_to_instagram: publishedCount,
      publishAll,
      posts: results,
    },
    status: 'success',
    created_at: nowISO,
    ...(orgId ? { org_id: orgId } : {}),
  });

  // ── Save learnings from content generation ──
  try {
    if (results.length > 0) {
      await saveLearning(supabase, {
        agent: 'content',
        category: 'content',
        learning: `Contenu généré: ${results.length} posts (${totalGenerated} visuels). ${publishedCount} publiés sur Instagram`,
        evidence: `generate_week: ${results.length} total, ${totalGenerated} visuals, ${publishedCount} published`,
        confidence: 20,
      }, orgId);
    }
  } catch (learnErr: any) {
    console.warn('[ContentAgent] Learning save error:', learnErr.message);
  }

  console.log(`[Content] generate_week complete: ${results.length} posts, ${totalGenerated} visuals, ${publishedCount} published to Instagram`);

  return NextResponse.json({
    ok: true,
    total: results.length,
    visuals_generated: totalGenerated,
    published_to_instagram: publishedCount,
    posts: results,
  });
}

// ──────────────────────────────────────
// Generate a single daily post
// ──────────────────────────────────────
async function generateDailyPost(supabase: any, todayStr: string, dayOfWeek: number, forcePlatform?: string, forcePillar?: string, draftOnly?: boolean, orgId: string | null = null, userId: string | null = null, clientSettings: Record<string, any> = {}, forceFormat?: string) {
  const nowISO = new Date().toISOString();

  // ── PER-PLAN QUOTA ENFORCEMENT ──
  // Block image/video generation when the client's monthly quota is
  // exhausted. The block is graceful — we fall back to no-visual draft
  // mode and surface the upsell banner client-side. Without this gate,
  // a client could generate 200 images/month on a 30-image Créateur
  // plan and burn through margin.
  let imageQuotaExhausted = false;
  let videoQuotaExhausted = false;
  if (userId) {
    try {
      const { checkImageQuota, checkVideoQuota } = await import('@/lib/credits/quotas');
      const imgCheck = await checkImageQuota(userId);
      if (!imgCheck.allowed) {
        imageQuotaExhausted = true;
        console.warn(`[Content] Image quota exhausted for user ${userId.substring(0, 8)} (plan ${imgCheck.plan}, ${imgCheck.limit} max). Skipping i2i, will reuse client uploads or fall back to draft-only.`);
      }
      // Video quota requires duration — pre-check at 15s as a baseline.
      const vidCheck = await checkVideoQuota(userId, 15);
      if (!vidCheck.allowed && vidCheck.reason === 'video_quota_exceeded') {
        videoQuotaExhausted = true;
        console.warn(`[Content] Video quota exhausted for user ${userId.substring(0, 8)}. Skipping video generation.`);
      }
    } catch (qerr: any) {
      console.warn('[Content] Quota check failed (non-fatal, allowing generation):', qerr?.message);
    }
  }

  // ── PER-BUSINESS NATURALISM PROFILE ──
  // Different businesses need different "natural" — a fleuriste post
  // shouldn't look like a restaurant post. We pull the dossier's
  // business_type, look up the matching naturalism profile, and inject
  // explicit rules (people / lighting / skin / palette / avoid) into
  // Léna's prompt for THIS generation.
  let naturalismBlock = '';
  let detectedBusinessType: string | null = null;
  if (userId) {
    try {
      const { data: dossier } = await supabase
        .from('business_dossiers')
        .select('business_type')
        .eq('user_id', userId)
        .maybeSingle();
      if (dossier?.business_type) {
        detectedBusinessType = dossier.business_type;
        const { naturalismProfileFor, naturalismToPromptBlock } = await import('@/lib/agents/business-naturalism');
        const profile = naturalismProfileFor(dossier.business_type);
        naturalismBlock = naturalismToPromptBlock(profile);
        console.log(`[Content] Naturalism profile applied: ${profile.id} for business "${dossier.business_type}"`);
      }
    } catch (e: any) {
      console.warn('[Content] naturalism block load failed:', e?.message);
    }
  }

  // ── INSPIRATION (optional IG account brief) ──
  // When the client saved an Instagram account as inspiration via
  // /api/agents/content/inspiration, we inject the style brief into
  // Léna's prompt so the visual + hook adopt that aesthetic. Soft
  // layer — never a copy/paste, just stylistic cues.
  let inspirationBlock = '';
  try {
    const inspiration = (clientSettings as any)?.inspiration;
    if (inspiration && inspiration.handle) {
      const { formatInspirationForPrompt } = await import('@/lib/visuals/ig-inspiration');
      inspirationBlock = formatInspirationForPrompt(inspiration);
    }
  } catch (e: any) {
    console.warn('[Content] inspiration block load failed:', e?.message);
  }

  // Load shared intelligence pool (all agents' data + active directives)
  let sharedIntelligence = '';
  try {
    const { prompt: ctxPrompt } = await loadContextWithAvatar(supabase, 'content', orgId || undefined);
    sharedIntelligence = ctxPrompt;
  } catch (e: any) {
    console.warn('[Content] Failed to load shared context:', e.message);
  }

  // Load all agent uploads (images + docs analysed) for Jade and format
  // them as a combined visual + document reference block. This makes
  // every generated post stay grounded in the client's REAL decor,
  // products, brand guidelines, menu etc. — massive lift over generic
  // stock-photo-style prompts.
  let visualReferences = '';
  if (userId) {
    try {
      const { loadAgentUploadsContext } = await import('@/lib/agents/visual-analyzer');
      visualReferences = await loadAgentUploadsContext(supabase, userId, 'content');
    } catch (e: any) {
      console.warn('[Content] Failed to load visual references:', e.message);
    }
  }

  // CONTENT STRATEGY v4 — percentage-based, works for ANY posting frequency
  // DB pillar constraint: tips, demo, social_proof, trends
  //
  // PILLAR DISTRIBUTION (% based):
  //   50% trends (actualité/tendances liées au business du client)
  //   20% tips (conseils pratiques)
  //   15% demo (démonstration produit/service)
  //   15% social_proof (témoignages, résultats, avant/après)
  //
  // FORMAT DISTRIBUTION (% based):
  //   30% post (image)
  //   25% reel (vidéo courte)
  //   25% carrousel (multi-image)
  //   20% story (éphémère)
  //
  // The schedule below uses dayOfWeek + slot to pick pillar/format
  // via rotation that respects these percentages over a 7-day cycle.

  const PILLAR_ROTATION = ['trends', 'tips', 'trends', 'demo', 'trends', 'social_proof', 'trends'];
  // New rotation strategy (2026-04):
  //   - Morning = visibility/reach (posts + carousels, rarely a story)
  //   - Midday = engagement peak (reels for algorithmic lift)
  //   - Evening = community + lift (posts + 2 stories/week, occasional reel)
  // Stories still exist (2-3/week) but concentrated in evening when
  // audience is more relaxed and a 24h-ephemeral piece fits naturally.
  // Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  const FORMAT_ROTATION_MORNING = ['post', 'carrousel', 'post', 'carrousel', 'post', 'carrousel', 'carrousel'];
  const FORMAT_ROTATION_MIDDAY  = ['reel', 'reel', 'carrousel', 'reel', 'reel', 'reel', 'carrousel'];
  const FORMAT_ROTATION_EVENING = ['post', 'story', 'reel', 'story', 'post', 'post', 'reel'];

  // Pick pillar: 50% trends via rotation + offset per slot
  const pickPillar = (day: number, slotOffset: number) => {
    return PILLAR_ROTATION[(day + slotOffset) % PILLAR_ROTATION.length];
  };

  const morningSchedule: Record<number, { platform: string; format: string; pillar: string }> = {};
  const middaySchedule: Record<number, { platform: string; format: string; pillar: string }> = {};
  const eveningSchedule: Record<number, { platform: string; format: string; pillar: string }> = {};

  for (let d = 0; d < 7; d++) {
    morningSchedule[d] = { platform: 'instagram', format: FORMAT_ROTATION_MORNING[d], pillar: pickPillar(d, 0) };
    middaySchedule[d] = { platform: 'instagram', format: FORMAT_ROTATION_MIDDAY[d], pillar: pickPillar(d, 2) };
    eveningSchedule[d] = { platform: 'instagram', format: FORMAT_ROTATION_EVENING[d], pillar: pickPillar(d, 4) };
  }
  // TikTok slot: 1 video per day (published at 21h30 Paris via tiktok_publish cron)
  const tiktokSchedule: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'tiktok', format: 'video', pillar: 'tips' },
    2: { platform: 'tiktok', format: 'video', pillar: 'demo' },
    3: { platform: 'tiktok', format: 'video', pillar: 'social_proof' },
    4: { platform: 'tiktok', format: 'video', pillar: 'trends' },
    5: { platform: 'tiktok', format: 'video', pillar: 'tips' },
    6: { platform: 'tiktok', format: 'video', pillar: 'demo' },
    0: { platform: 'tiktok', format: 'video', pillar: 'social_proof' },
  };
  // LinkedIn slot: 2 posts per day (linkedin_1 and linkedin_2) — professional content
  const linkedinSchedule1: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'linkedin', format: 'text', pillar: 'tips' },
    2: { platform: 'linkedin', format: 'post', pillar: 'demo' },
    3: { platform: 'linkedin', format: 'text', pillar: 'social_proof' },
    4: { platform: 'linkedin', format: 'post', pillar: 'trends' },
    5: { platform: 'linkedin', format: 'text', pillar: 'tips' },
    6: { platform: 'linkedin', format: 'post', pillar: 'demo' },
    0: { platform: 'linkedin', format: 'text', pillar: 'social_proof' },
  };
  const linkedinSchedule2: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'linkedin', format: 'post', pillar: 'social_proof' },
    2: { platform: 'linkedin', format: 'text', pillar: 'trends' },
    3: { platform: 'linkedin', format: 'post', pillar: 'demo' },
    4: { platform: 'linkedin', format: 'text', pillar: 'tips' },
    5: { platform: 'linkedin', format: 'post', pillar: 'social_proof' },
    6: { platform: 'linkedin', format: 'text', pillar: 'trends' },
    0: { platform: 'linkedin', format: 'post', pillar: 'tips' },
  };

  // Determine which slot we're in
  const slotType = forcePillar === '__midday__' ? 'midday' : forcePillar === '__evening__' ? 'evening' : forcePillar === '__tiktok__' ? 'tiktok' : forcePillar === '__linkedin_1__' ? 'linkedin_1' : forcePillar === '__linkedin_2__' ? 'linkedin_2' : 'morning';

  // ── CLIENT SETTINGS: adaptive frequency based on plan + credits ──
  //
  // Two modes:
  //   - 'manual': client (or we) sets posts_per_day_ig explicitly. Legacy.
  //   - 'auto' (default): we compute the daily cap from the plan's weekly
  //     target adjusted by credit burn rate — Créateur ≈ 5/week, Pro ≈ 10,
  //     Business ≈ 18, Elite ≈ 25. Shrinks when credits run low, expands
  //     when the client is under-using.
  let postsPerDayIG: number;
  let adaptiveReason = 'manual';

  const freqMode = clientSettings.content_frequency_mode || 'auto';
  if (freqMode === 'manual' && clientSettings.posts_per_day_ig != null) {
    postsPerDayIG = parseInt(clientSettings.posts_per_day_ig);
  } else if (userId) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_plan, credits_balance, credits_monthly_allowance')
        .eq('id', userId)
        .single();
      const { getWeeklyContentTarget } = await import('@/lib/content/adaptive-frequency');
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const allowance = profile?.credits_monthly_allowance || 400;
      const balance = profile?.credits_balance || 0;
      const { count: opsThisMonth } = await supabase
        .from('credit_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
      const creditsUsed = Math.max(0, allowance - balance);
      const adaptive = getWeeklyContentTarget({
        plan: profile?.subscription_plan || 'free',
        creditsBalance: balance,
        creditsAllowance: allowance,
        creditsUsedThisMonth: creditsUsed,
        dayOfMonth: now.getDate(),
        daysInMonth,
      });
      postsPerDayIG = adaptive.dailyCap;
      adaptiveReason = `auto:${adaptive.reason}:weekly=${adaptive.weeklyTarget}`;
    } catch (e: any) {
      console.warn('[Content] adaptive frequency fallback:', e?.message);
      postsPerDayIG = 1; // safe default
    }
  } else {
    // Admin / no user context → 3 slots by default
    postsPerDayIG = 3;
  }

  const postsPerDayTT = clientSettings.posts_per_day_tt != null ? parseInt(clientSettings.posts_per_day_tt) : 0;
  const postsPerDayLI = clientSettings.posts_per_day_li != null ? parseInt(clientSettings.posts_per_day_li) : 0;
  const preferredFormats = clientSettings.formats_ig || clientSettings.formats || 'all';
  const igEnabled = clientSettings.ig_enabled !== false;
  const ttEnabled = clientSettings.tt_enabled === true && postsPerDayTT > 0;
  const liEnabled = clientSettings.li_enabled === true && postsPerDayLI > 0;

  // Skip slots based on adaptive or manual cap
  if (slotType === 'midday' && postsPerDayIG < 2) {
    return NextResponse.json({ ok: true, skipped: true, reason: `IG cap=${postsPerDayIG} (${adaptiveReason})` });
  }
  if (slotType === 'evening' && postsPerDayIG < 3) {
    return NextResponse.json({ ok: true, skipped: true, reason: `IG cap=${postsPerDayIG} (${adaptiveReason})` });
  }
  if (slotType.startsWith('linkedin') && !liEnabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Client disabled LinkedIn' });
  }
  if ((slotType === 'linkedin_2') && postsPerDayLI < 2) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Client frequency < 2 posts/day LinkedIn' });
  }
  if (slotType === 'tiktok' && !ttEnabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Client disabled TikTok' });
  }
  // Skip TikTok / LinkedIn generation when no OAuth token. Generating
  // unpublishable content burns credits + clutters the planning UI
  // with stuck drafts on networks the client never connected.
  if (slotType === 'tiktok' && userId) {
    const { data: ttProfile } = await supabase.from('profiles').select('tiktok_access_token').eq('id', userId).maybeSingle();
    if (!ttProfile?.tiktok_access_token) {
      console.log(`[Content] Skipping TikTok generation — no token for ${userId.substring(0, 8)}`);
      return NextResponse.json({ ok: true, skipped: true, reason: 'TikTok not connected' });
    }
  }
  if (slotType.startsWith('linkedin') && userId) {
    const { data: liProfile } = await supabase.from('profiles').select('linkedin_access_token, linkedin_refresh_token').eq('id', userId).maybeSingle();
    const hasLi = liProfile?.linkedin_access_token || liProfile?.linkedin_refresh_token;
    if (!hasLi) {
      console.log(`[Content] Skipping LinkedIn generation — no token for ${userId.substring(0, 8)}`);
      return NextResponse.json({ ok: true, skipped: true, reason: 'LinkedIn not connected' });
    }
  }

  const activeSchedule = slotType === 'tiktok' ? tiktokSchedule : slotType === 'evening' ? eveningSchedule : slotType === 'midday' ? middaySchedule : slotType === 'linkedin_1' ? linkedinSchedule1 : slotType === 'linkedin_2' ? linkedinSchedule2 : morningSchedule;
  const schedule = activeSchedule[dayOfWeek] || morningSchedule[1];
  const platform = (forcePlatform && forcePlatform !== 'all') ? forcePlatform : schedule.platform;
  const rawForcePillar = (slotType !== 'morning' ? undefined : forcePillar);
  let pillar = (rawForcePillar && !rawForcePillar.startsWith('__')) ? rawForcePillar : schedule.pillar;

  // Override format based on client preference (if they prefer reels/stories/carousel)
  let format = schedule.format;
  if (preferredFormats === 'reels' && platform === 'instagram') format = 'reel';
  else if (preferredFormats === 'stories' && platform === 'instagram') format = 'story';
  else if (preferredFormats === 'carousel' && platform === 'instagram') format = 'carousel';
  if (forceFormat) format = forceFormat;

  // ── Adaptive bias from performance ranking ──
  // If the client has a recent performance_ranking (computed nightly
  // by /api/cron/content-performance), use it to steer format and pillar
  // choice toward what's been getting engagement for THIS client. Low
  // confidence (< 10 samples) leaves the schedule untouched.
  const ranking = clientSettings.performance_ranking;
  if (ranking && platform === 'instagram' && preferredFormats === 'all') {
    try {
      const { pickFormatWithRanking, pickPillarWithRanking } = await import('@/lib/content/performance-analyzer');
      const allowedForSlot = slotType === 'morning'
        ? ['post', 'carrousel']
        : slotType === 'midday'
          ? ['reel', 'carrousel']
          : ['post', 'story', 'reel'];
      format = pickFormatWithRanking(format, ranking, allowedForSlot);
      pillar = pickPillarWithRanking(pillar, ranking);
    } catch (e: any) {
      // Non-fatal: fall back to static schedule
      console.warn('[Content] performance-ranking bias failed:', e?.message);
    }
  }

  // Get recent posts for visual coherence + strategy context
  const { data: recentGrid } = await supabase
    .from('content_calendar')
    .select('platform, format, visual_description, hook, pillar, caption')
    .eq('platform', platform)
    .in('status', ['draft', 'approved', 'published'])
    .order('scheduled_date', { ascending: false })
    .limit(9);

  // ── Smart format rotation: diversify if too many of the same format ──
  if (preferredFormats === 'all' && platform === 'instagram' && recentGrid && recentGrid.length >= 3) {
    const lastFormats = recentGrid.slice(0, 4).map((p: any) => p.format);
    const formatCounts: Record<string, number> = {};
    lastFormats.forEach((f: string) => { formatCounts[f] = (formatCounts[f] || 0) + 1; });
    // If last 3+ posts are same format, rotate to something different
    if (formatCounts[format] && formatCounts[format] >= 3) {
      const alternatives = ['post', 'reel', 'carrousel'].filter(f => f !== format && (!formatCounts[f] || formatCounts[f] < 2));
      if (alternatives.length > 0) {
        const rotated = alternatives[Math.floor(Math.random() * alternatives.length)];
        console.log(`[Content] Format rotation: ${format} → ${rotated} (${formatCounts[format]}x in last ${lastFormats.length} posts)`);
        format = rotated;
      }
    }
  }

  const gridContext = recentGrid?.map((p: any, i: number) =>
    `Position ${i + 1}: ${p.format} | Pilier: ${p.pillar} | Hook: ${p.hook || '?'} | Visuel: ${(p.visual_description || '').substring(0, 80)}`
  ).join('\n') || 'Grille vide';

  // Detect recently used pillars to enforce rotation
  const recentPillars = recentGrid?.map((p: any) => p.pillar).filter(Boolean) || [];
  const pillarCounts: Record<string, number> = {};
  for (const rp of recentPillars) pillarCounts[rp] = (pillarCounts[rp] || 0) + 1;
  const avoidPillar = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Detect recent CTA types to rotate them
  const recentCTAs = recentGrid?.map((p: any) => {
    const cap = (p.caption || '').toLowerCase();
    if (cap.includes('enregistre')) return 'save';
    if (cap.includes('tag')) return 'tag';
    if (cap.includes('lien en bio')) return 'link';
    if (cap.includes('commente')) return 'comment';
    return 'other';
  }).filter(Boolean) || [];

  // ── ANTI-DUPLICATE: Extract recent visual descriptions to prevent repetition ──
  const recentVisuals = recentGrid?.map((p: any) => (p.visual_description || '').substring(0, 120)).filter((v: string) => v.length > 10) || [];

  // ── SUBJECT-CATEGORY ROTATION ──
  // Léna kept falling back to "le plat et le lieu" (dish + venue) for
  // restos, "le bouquet" for fleuristes, etc. Map each recent visual
  // to a category bucket so the prompt can explicitly tell her which
  // categories have been overused and which are due.
  // Categories are intentionally generic — they apply across business types.
  const SUBJECT_CATEGORIES = [
    'product_hero',     // the thing you sell (plat, bouquet, soin, vêtement)
    'venue_atmosphere', // the place itself (intérieur, devanture, salle)
    'people_team',      // the team / craftsperson at work
    'people_customer',  // a customer enjoying / using
    'process_craft',    // close-up on the making (mains, geste, ingrédient)
    'detail_texture',   // a detail / texture (matière, bois, fleur, peau)
    'behind_scenes',    // off-hours / backstage feel (preparation, cleanup)
    'news_tie',         // explicit tie to a current news / cultural moment
    'lifestyle',        // adjacent lifestyle (coffee, music, mood)
    'social_proof',     // testimonial card / before-after / numbers
  ];

  function categorizeVisual(visual: string): string {
    const v = (visual || '').toLowerCase();
    if (/(plat|dish|bouquet|soin|product|produit|item|pièce|montre|robe|sac)/.test(v)) return 'product_hero';
    if (/(intérieur|interior|salle|devanture|façade|room|venue|terrasse|comptoir|atelier)/.test(v)) return 'venue_atmosphere';
    if (/(équipe|team|chef|artisan|barbier|coiffeur|fleuriste|esthéticien|barista)/.test(v)) return 'people_team';
    if (/(client|customer|consumer|cliente|guest|visiteur)/.test(v)) return 'people_customer';
    if (/(main|hand|geste|gesture|making|fabrication|cooking|knead|cut|découpe)/.test(v)) return 'process_craft';
    if (/(détail|detail|texture|gros plan|close-up|macro)/.test(v)) return 'detail_texture';
    if (/(coulisse|backstage|behind|prepa|setup|installation)/.test(v)) return 'behind_scenes';
    if (/(actu|news|trend|breaking|today|aujourd|tendance)/.test(v)) return 'news_tie';
    if (/(testimonial|témoignage|avant.après|before.after|résultat)/.test(v)) return 'social_proof';
    return 'lifestyle';
  }
  const recentSubjects = recentVisuals.map(categorizeVisual);
  const subjectCounts: Record<string, number> = {};
  for (const s of recentSubjects) subjectCounts[s] = (subjectCounts[s] || 0) + 1;
  // FORBIDDEN list — combined hard rules:
  //   (a) Anything used in last 2 posts back-to-back
  //   (b) Anything that's already ≥30% of the visible feed (3+ in last 10)
  //   The user wants the IG GRID to feel varied, not just the 2 most recent.
  const last2Subjects = recentSubjects.slice(0, 2);
  const dominantThreshold = Math.max(3, Math.ceil(Math.max(recentSubjects.length, 10) * 0.30));
  const dominantSubjects = Object.entries(subjectCounts).filter(([_, n]) => n >= dominantThreshold).map(([k]) => k);
  const forbiddenSubjects = Array.from(new Set([...last2Subjects, ...dominantSubjects]));
  const overusedSubjects = Object.entries(subjectCounts).filter(([_, n]) => n >= 2).map(([k]) => k);
  const dueSubjects = SUBJECT_CATEGORIES.filter(c => !subjectCounts[c]);
  const subjectGuidance = `\n━━━ ROTATION DES SUJETS — VUE FEED GLOBALE ━━━\n`
    + `Les ${recentSubjects.length} derniers posts ont concerné : ${recentSubjects.length > 0 ? recentSubjects.join(', ') : '(aucun)'}.\n`
    + (dominantSubjects.length > 0 ? `⚠️ SATURÉS DANS LE FEED (≥30% des posts récents — à éviter sauf si vraiment pertinent) : ${dominantSubjects.join(', ')}\n` : '')
    + (last2Subjects.length > 0 ? `⚠️ À éviter (utilisé dans les 2 derniers — préfère un autre sujet pour casser la répétition) : ${Array.from(new Set(last2Subjects)).join(', ')}\n` : '')
    + (overusedSubjects.length > 0 ? `→ SUR-UTILISÉS : ${overusedSubjects.join(', ')}\n` : '')
    + (dueSubjects.length > 0 ? `→ JAMAIS UTILISÉS RÉCEMMENT (à privilégier en PRIORITÉ) : ${dueSubjects.slice(0, 4).join(', ')}\n` : '')
    + `\nObjectif : un feed Instagram VARIÉ. Si le client regarde son profil, il doit voir des SUJETS DIFFÉRENTS, pas la même scène déclinée. Choisis de préférence un sujet hors des catégories saturées.\n`
    + `Catégories disponibles : ${SUBJECT_CATEGORIES.join(' / ')}.\n`
    + `\nPour la RESTAURATION en particulier :\n`
    + `- Si product_hero (plat) saturé → montre le LIEU SEUL (venue_atmosphere) sans assiette, ou les MAINS du chef (process_craft), ou un CLIENT qui mange (people_customer).\n`
    + `- Si venue_atmosphere saturé → montre le PLAT seul, ou un DÉTAIL (texture, matière, ingrédient brut).\n`
    + `- Le LIEU SANS PLAT est une option valide — une vue de la salle, de la terrasse, du comptoir, un coin de marbre, une lumière du matin. Pas besoin de food sur chaque post.\n`
    + `Pour les AUTRES MÉTIERS : applique la même logique — varier hero/process/customer/detail/behind_scenes/news_tie/lifestyle/social_proof.\n`
    + `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  // ── COLOR ROTATION: Detect dominant colors to force variety ──
  const recentColors: string[] = [];
  for (const p of (recentGrid || []).slice(0, 5)) {
    const desc = ((p as any).visual_description || '').toLowerCase();
    if (desc.includes('violet') || desc.includes('purple')) recentColors.push('violet');
    else if (desc.includes('amber') || desc.includes('gold') || desc.includes('warm')) recentColors.push('ambre');
    else if (desc.includes('blue') || desc.includes('navy') || desc.includes('bleu')) recentColors.push('bleu');
    else if (desc.includes('green') || desc.includes('emerald') || desc.includes('sage')) recentColors.push('vert');
    else if (desc.includes('coral') || desc.includes('terracotta') || desc.includes('pink') || desc.includes('rose')) recentColors.push('corail');
    else if (desc.includes('black') || desc.includes('dark') || desc.includes('noir')) recentColors.push('noir');
    else if (desc.includes('white') || desc.includes('cream') || desc.includes('light')) recentColors.push('blanc');
    else recentColors.push('autre');
  }
  const lastColor = recentColors[0] || 'aucun';
  const violetCount = recentColors.filter(c => c === 'violet').length;
  const colorWarning = violetCount >= 2
    ? `⚠️ TROP DE VIOLET (${violetCount}/5 derniers posts) ! Utilise une AUTRE couleur dominante : ambre, bleu nuit, vert sauge, corail, noir profond, blanc crème.`
    : lastColor !== 'aucun' ? `La dernière couleur dominante était "${lastColor}". Choisis une couleur DIFFÉRENTE.` : '';

  // ── TARGET ROTATION: Detect recent prospect targets ──
  const TARGET_TYPES = ['restaurant', 'coiffeur', 'boutique', 'coach', 'fleuriste', 'caviste', 'boulanger', 'freelance', 'artisan', 'commerçant'];
  const recentTargets: string[] = [];
  for (const p of (recentGrid || []).slice(0, 5)) {
    const text = `${(p as any).caption || ''} ${(p as any).hook || ''}`.toLowerCase();
    for (const t of TARGET_TYPES) {
      if (text.includes(t)) { recentTargets.push(t); break; }
    }
  }
  const avoidTarget = recentTargets[0] || '';
  const targetWarning = avoidTarget ? `Le dernier post ciblait "${avoidTarget}". Cible un AUTRE type de commerce cette fois (${TARGET_TYPES.filter(t => t !== avoidTarget).slice(0, 4).join(', ')}...).` : '';

  // ── LOAD TRENDS & NEWS for content inspiration ──
  let trendsContext = '';
  let trendsTrendItems: string[] = [];
  let trendsNewsItems: string[] = [];
  let trendsUpcomingEvents: string[] = [];
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.keiroai.com';
    const [trendsRes, newsRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/trends`, { signal: AbortSignal.timeout(5000) }),
      // Pull the FULL news list so we can stratify by category (same
      // source the /generate page uses for diversity). Without this
      // we always got the top 8 = mostly politics → Sonnet keeps
      // picking sondages / élections.
      fetch(`${baseUrl}/api/news?all=true`, { signal: AbortSignal.timeout(6000) }),
    ]);
    const trends = trendsRes.status === 'fulfilled' && trendsRes.value.ok ? await trendsRes.value.json() : null;
    const news = newsRes.status === 'fulfilled' && newsRes.value.ok ? await newsRes.value.json() : null;

    // Get Google Trends (nested structure)
    const googleTrends = trends?.data?.googleTrends || trends?.trends || [];
    const trendItems = googleTrends.slice(0, 10).map((t: any) => t.title || t.query || t.name).filter(Boolean);

    // Get news articles — STRATIFIED by category for diversity. Pick
    // up to 2 per distinct category, cap total at 12. This way Sonnet
    // sees Tech, Sport, Culture, Sciences, International — not 8x
    // 'Politique' headlines.
    const allNews = (news?.articles || news?.items || news?.data || []) as Array<{ title?: string; headline?: string; category?: string }>;
    const byCategory = new Map<string, string[]>();
    for (const n of allNews) {
      const title = (n.title || n.headline || '').trim();
      if (!title) continue;
      const cat = (n.category || 'Autre').trim();
      const arr = byCategory.get(cat) || [];
      if (arr.length < 2) arr.push(title);
      byCategory.set(cat, arr);
    }
    // Round-robin merge so Sonnet sees a varied list, not category-ordered
    const stratified: string[] = [];
    const cats = Array.from(byCategory.keys());
    for (let i = 0; i < 2; i++) {
      for (const c of cats) {
        const a = byCategory.get(c) || [];
        if (a[i]) stratified.push(`[${c}] ${a[i]}`);
      }
    }
    // Cap reuse of any single news headline to MAX 2 times in the last 14
    // days for this client. The previous logic happily reshuffled the same
    // 12 news to Sonnet every day, so the same "Euro 2024" / "Soldes d'été"
    // could anchor 4 posts in a row. Match by 12-char rolling subsequence
    // against recent post hooks/captions/visual descriptions to catch
    // paraphrases too.
    const fortnightAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    let recentTextBlob = '';
    try {
      const { data: priorPosts } = await supabase
        .from('content_calendar')
        .select('hook, caption, visual_description')
        .eq('user_id', userId)
        .gte('created_at', fortnightAgo)
        .limit(60);
      recentTextBlob = (priorPosts || [])
        .map((p: any) => `${p.hook || ''} ${p.caption || ''} ${p.visual_description || ''}`.toLowerCase())
        .join(' ');
    } catch {}
    const countOccurrences = (haystack: string, needle: string) => {
      if (!needle || needle.length < 8) return 0;
      let count = 0;
      let idx = 0;
      const n = needle.toLowerCase();
      while ((idx = haystack.indexOf(n, idx)) !== -1) { count++; idx += n.length; }
      return count;
    };
    const NEWS_REUSE_CAP = 2;
    const filteredNews = stratified.filter(headline => {
      // headline format: "[Catégorie] Titre…" — keep the title slice
      const title = headline.replace(/^\[[^\]]+\]\s*/, '').slice(0, 60);
      return countOccurrences(recentTextBlob, title) < NEWS_REUSE_CAP;
    });
    const filteredTrends = trendItems.filter((t: string) => countOccurrences(recentTextBlob, String(t).toLowerCase().slice(0, 40)) < NEWS_REUSE_CAP);
    const newsItems = filteredNews.slice(0, 12);
    trendsTrendItems = filteredTrends;
    trendsNewsItems = newsItems;

    // Event calendar — key dates to leverage in content
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();
    const EVENT_CALENDAR: Record<string, string[]> = {
      '1-1': ['Nouvel An — resolutions, nouveau depart'],
      '1-6': ['Epiphanie — galette des rois'],
      '2-14': ['Saint-Valentin — offres couples, cadeaux'],
      '3-8': ['Journee internationale des droits des femmes'],
      '3-20': ['Printemps — renouveau, nettoyage, fraicheur'],
      '4-1': ['Poisson d\'avril — humour, engagement'],
      '4-22': ['Jour de la Terre — eco-responsable'],
      '5-1': ['Fete du travail'],
      '5-25': ['Fete des meres — cadeaux, attention'],
      '6-15': ['Fete des peres'],
      '6-21': ['Ete — soldes, vacances, terrasses'],
      '7-14': ['Fete nationale — bleu blanc rouge'],
      '8-15': ['Assomption — vacances, fin d\'ete'],
      '9-1': ['Rentree — nouveau depart, objectifs'],
      '10-31': ['Halloween — deco, ambiance'],
      '11-25': ['Black Friday — promos, urgence'],
      '12-25': ['Noel — cadeaux, fetes, convivialite'],
      '12-31': ['Reveillon — bilan, celebration'],
    };
    // Check ±3 days for upcoming events
    const upcomingEvents: string[] = [];
    for (let offset = -1; offset <= 3; offset++) {
      const d = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
      const key = `${d.getMonth() + 1}-${d.getDate()}`;
      if (EVENT_CALENDAR[key]) {
        const prefix = offset === 0 ? 'AUJOURD\'HUI' : offset < 0 ? 'HIER' : `Dans ${offset}j`;
        upcomingEvents.push(`${prefix}: ${EVENT_CALENDAR[key].join(', ')}`);
      }
    }
    let eventContext = '';
    if (upcomingEvents.length > 0) {
      eventContext = `\nCALENDRIER EVENEMENTS : ${upcomingEvents.join(' | ')}\nSi pertinent, integre cet evenement dans le post pour surfer sur le moment.\n`;
    }
    trendsUpcomingEvents = upcomingEvents;

    if (trendItems.length > 0 || newsItems.length > 0 || upcomingEvents.length > 0) {
      trendsContext = '\n━━━ TENDANCES & ACTUALITES DU JOUR — 50% DU CONTENU ━━━\n';
      if (eventContext) trendsContext += eventContext;
      if (trendItems.length > 0) trendsContext += `Trends Google/TikTok : ${trendItems.join(' | ')}\n`;
      if (newsItems.length > 0) trendsContext += `Actualites France : ${newsItems.join(' | ')}\n`;
      trendsContext += `
REGLE ABSOLUE : 50% de tes posts DOIVENT faire un lien FORT entre une tendance/actualite et le business du client.
Ce n'est PAS optionnel — 1 post sur 2 doit surfer sur l'actu du jour.

COMMENT CREER LE LIEN :
1. Prends une tendance ou actualite CONCRETE du jour (pas generique)
2. Fais le PONT avec le metier du client (comment ca l'impacte, comment il peut en profiter)
3. Donne une ACTION concrete que le client peut faire AUJOURD'HUI

Exemples de liens FORTS :
- Trend "IA generative" + agence contenu → "GPT-5 vient de sortir. Voila pourquoi tes visuels sont deja obsoletes — et comment passer devant"
- Actu "inflation en hausse" + restaurant → "Les prix montent. 3 restos qui ont AUGMENTE leur CA en automatisant leur marketing (gratuit)"
- Trend "TikTok ban" + boutique → "TikTok menace de fermer. Les boutiques malins diversifient MAINTENANT. Voici les 3 alternatives"
- Actu "Euro de foot" + coiffeur → "Finale de l'Euro ce soir. Le coiffeur qui a publie un post a mi-temps a eu 200 likes en 1h"

Le lien doit etre NATUREL et PERCUTANT — pas force. Si aucune actu ne colle au business du client, fais un post tips/demo classique.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    }
  } catch (e: any) {
    console.warn('[Content] Trends/news load failed (non-fatal):', e.message?.substring(0, 80));
  }

  // ── CALENDAR EVENTS (seasonal content) ──
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  // 2026-06-03 — Calendar enrichi: marketing dates + sport + culture pop.
  // Founder ask: "plus d'actualité comme le sport ou le cinéma qui sont
  // connus et plus communs qui vont plus attirer dans les mots clés".
  const EVENTS: Record<string, string> = {
    // ─── Marketing classiques ─────────────────────────
    '1-1': 'Nouvel An',
    '1-15': 'Soldes d\'hiver début',
    '2-14': 'Saint-Valentin',
    '3-8': 'Journée internationale des droits des femmes',
    '3-20': 'Printemps + Journée mondiale du bonheur',
    '4-1': 'Poisson d\'avril',
    '4-22': 'Journée de la Terre',
    '5-1': 'Fête du travail',
    '5-9': 'Journée de l\'Europe',
    '5-25': 'Fête des mères (France)',
    '6-15': 'Fête des pères (France)',
    '6-21': 'Fête de la musique + début été',
    '7-1': 'Soldes d\'été début',
    '7-14': 'Fête nationale',
    '9-1': 'Rentrée scolaire',
    '9-22': 'Automne',
    '10-1': 'Octobre rose (cancer du sein)',
    '10-31': 'Halloween',
    '11-11': 'Armistice',
    '11-25': 'Black Friday week',
    '11-30': 'Cyber Monday',
    '12-21': 'Hiver',
    '12-24': 'Veille de Noël',
    '12-25': 'Noël',
    '12-31': 'Réveillon Nouvel An',
    // ─── Sport (très engagement) ──────────────────────
    '5-23': 'Roland-Garros (tennis) début',
    '6-7': 'Roland-Garros finale',
    '6-28': 'Tour de France début',
    '7-21': 'Tour de France finale',
    '7-26': 'Anniversaire Jeux Olympiques Paris',
    '6-14': 'Euro/Coupe du Monde football (année paire)',
    '9-7': 'Coupe du Monde Rugby',
    // ─── Culture / cinéma ─────────────────────────────
    '2-25': 'César du Cinéma',
    '5-14': 'Festival de Cannes début',
    '5-24': 'Festival de Cannes Palme d\'Or',
    '3-2': 'Cérémonie des Oscars',
    '9-6': 'Festival de Deauville (cinéma américain)',
    // ─── Tech / Pop culture ───────────────────────────
    '6-10': 'Apple WWDC',
    '9-9': 'Apple Keynote iPhone',
    '11-3': 'Diwali / Black Week tech',
  };

  // Check events within 5 days (was 3 — élargi pour mieux anticiper)
  let eventContext = '';
  const upcomingEvents: string[] = [];
  for (const [dateStr, event] of Object.entries(EVENTS)) {
    const [em, ed] = dateStr.split('-').map(Number);
    if (em === month && Math.abs(ed - day) <= 5) {
      upcomingEvents.push(`${event} (${dateStr})`);
    }
  }
  if (upcomingEvents.length > 0) {
    eventContext = `\n📅 ÉVÉNEMENTS MARKETING / SPORT / CULTURE DANS LES 5 JOURS :
${upcomingEvents.map(e => `  • ${e}`).join('\n')}

➡️ Anticipe ces moments dans tes posts. Les événements sport (Roland-Garros, Tour de France, Euro foot) + culture pop (Cannes, Oscars, César) génèrent +40% d'engagement quand on surfe dessus. Si pertinent pour le client, intègre-les dans 1 post sur 2 (pillar=trends).\n`;
  }

  // ── CLIENT DIRECTIVES: persistent instructions from chat ──
  // Per-client directives (extracted from chat conversations)
  // The legacy key was 'content_directives'; the new extractor writes
  // to '<agent>_directives' = 'content_directives' (same name for
  // content agent), so they merge naturally.
  const clientDirectives: string[] = (clientSettings as any).content_directives || [];

  // Cross-client directives — patterns extracted from OTHER clients of
  // the same business_type that translated to durable rules. Applied
  // by anticipation (similar businesses benefit from each other's
  // refinements). Only loaded when we have a known business_type.
  let globalDirectives: string[] = [];
  if (detectedBusinessType) {
    try {
      const { data: globalRows } = await supabase
        .from('global_agent_directives')
        .select('directive')
        .eq('agent_id', 'content')
        .eq('business_type', detectedBusinessType)
        .gte('confidence', 40)
        .order('usage_count', { ascending: false })
        .limit(8);
      globalDirectives = (globalRows || []).map((r: any) => r.directive).filter(Boolean);
    } catch (e: any) {
      console.warn('[Content] global directives load failed:', e?.message);
    }
  }

  const allDirectives = [
    ...clientDirectives.map((d) => ({ text: d, source: 'client' })),
    ...globalDirectives
      .filter((d) => !clientDirectives.includes(d))
      .map((d) => ({ text: d, source: 'business_type' })),
  ];

  const directivesBlock = allDirectives.length > 0
    ? `\n━━━ DIRECTIVES STRATÉGIQUES (à RESPECTER en priorité) ━━━\n${allDirectives.map((d, i) => `${i + 1}. ${d.text}${d.source === 'business_type' ? '  (commun aux ' + detectedBusinessType + 's)' : ''}`).join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    : '';

  // 2026-06-08 — Typed directives layer (canonical intents from
  // chat/wizard). These are richer than free-text: each comes with a
  // type the prompt builder can render specifically (e.g. posting_hours
  // → schedule block, inspire_account → study-this-account block,
  // focus_topic → bias-next-posts block). Falls back gracefully if the
  // table doesn't exist or the user has no typed orders.
  let typedDirectivesBlock = '';
  if (userId) {
    try {
      const { loadTypedDirectives, directivesPromptBlock } = await import('@/lib/agents/typed-directives');
      const typed = await loadTypedDirectives(supabase, userId, 'content');
      typedDirectivesBlock = directivesPromptBlock(typed);
    } catch (e: any) {
      console.warn('[Content] typed directives load failed:', e?.message);
    }
  }

  // Channel-aware voice — without this Léna leaks LinkedIn-isms onto IG
  // captions ("algo LinkedIn", "B2B", "decision-makers") or talks
  // about FYP on a LinkedIn post. Each platform has its own voice.
  let channelVoice = '';
  try {
    const { channelVoiceBlock } = await import('@/lib/agents/channel-voice');
    channelVoice = channelVoiceBlock(platform);
  } catch (e: any) {
    console.warn('[Content] channel-voice load failed:', e?.message);
  }

  // ── DISSATISFACTION SIGNALS (per-client) ──
  // The client clicking "skip" or "delete" on Léna's drafts is a
  // strong opinion signal. Aggregate the patterns and warn Léna
  // before she generates the next post so she stops repeating
  // whatever the client has been killing.
  let dissatisfactionBlock = '';
  if (userId) {
    try {
      const { loadDissatisfactionSummary, dissatisfactionPromptBlock } = await import('@/lib/agents/dissatisfaction-signals');
      const sum = await loadDissatisfactionSummary(supabase, userId, 30);
      dissatisfactionBlock = dissatisfactionPromptBlock(sum);
      if (dissatisfactionBlock) {
        console.log(`[Content] Dissatisfaction signal active: ${sum?.totalSkipped}/${sum?.totalGenerated} skipped (${Math.round((sum?.skipRate || 0) * 100)}%)`);
      }
    } catch (e: any) {
      console.warn('[Content] dissatisfaction signal load failed:', e?.message?.substring(0, 80));
    }
  }

  // ── GLOBAL LEARNING (cross-client) ──
  // Aggregate patterns across ALL KeiroAI clients. When 50+ users skip
  // the same hook template, every future client benefits from Léna
  // avoiding it. Cached in-memory for 1 hour so it's free per call.
  let globalLearningBlock = '';
  try {
    const { computeGlobalLearning, globalLearningPromptBlock } = await import('@/lib/agents/global-content-learning');
    const g = await computeGlobalLearning(supabase, { windowDays: 30 });
    globalLearningBlock = globalLearningPromptBlock(g);
    if (globalLearningBlock && g) {
      console.log(`[Content] Global learning active: ${g.totalKilled}/${g.totalGenerated} kills across all clients (${Math.round(g.killRate * 100)}%)`);
    }
  } catch (e: any) {
    console.warn('[Content] global learning load failed:', e?.message?.substring(0, 80));
  }

  // ── BUSINESS ↔ NEWS ANGLE (Sonnet) ──
  // Only fire when the post is meant to surf actuality (pillar=trends
  // OR there's a real upcoming event in the calendar). Sonnet analyzes
  // the dossier vs flat news/trend list and returns ONE sharp angle
  // that Léna executes. Without this, Léna picks a random headline and
  // writes "happy [holiday] from [business]".
  let newsAngleBlock = '';
  try {
    const shouldPickAngle = pillar === 'trends' || trendsUpcomingEvents.length > 0;
    if (shouldPickAngle && (trendsTrendItems.length > 0 || trendsNewsItems.length > 0 || trendsUpcomingEvents.length > 0)) {
      let dossierForAngle: any = null;
      if (userId) {
        const { data: d } = await supabase
          .from('business_dossiers')
          .select('business_type, ai_summary, company_description, value_proposition, unique_selling_points, address')
          .eq('user_id', userId)
          .maybeSingle();
        dossierForAngle = d;
      }
      // Pull recent angles used so Sonnet doesn't repeat itself
      const recentAnglesUsed: string[] = (recentGrid || [])
        .map((p: any) => p.content_angle || '')
        .filter((a: string) => a && a.length > 0)
        .slice(0, 5);
      const { pickBusinessNewsAngle, angleToPromptBlock } = await import('@/lib/agents/news-business-angle');
      const dossierSummary = dossierForAngle?.ai_summary || dossierForAngle?.company_description;
      const dossierOffer = dossierForAngle?.value_proposition || dossierForAngle?.unique_selling_points;
      const dossierCity = dossierForAngle?.address ? String(dossierForAngle.address).split(',').pop()?.trim() : undefined;
      // Optional override from caller — useful for A/B testing news vs
      // trend angles, or when the client explicitly asks for one mode.
      const preferRaw = (clientSettings as any)?._prefer_angle_source as string | undefined;
      const prefer = preferRaw === 'news' || preferRaw === 'trend' || preferRaw === 'event'
        ? preferRaw
        : undefined;
      // Hard avoid list — passed via body / clientSettings to force
      // variety when content_angle history isn't reliable.
      const avoidTopicsRaw = (clientSettings as any)?._avoid_topics;
      const avoidTopics = Array.isArray(avoidTopicsRaw)
        ? avoidTopicsRaw.map((t: any) => String(t).slice(0, 80)).slice(0, 10)
        : undefined;
      const angle = await pickBusinessNewsAngle({
        businessType: dossierForAngle?.business_type || detectedBusinessType || (clientSettings as any)?.business_type,
        businessSummary: dossierSummary,
        signatureOffer: dossierOffer,
        city: dossierCity,
        language: 'fr',
        newsHeadlines: trendsNewsItems,
        trendQueries: trendsTrendItems,
        upcomingEvents: trendsUpcomingEvents,
        recentAnglesUsed,
        avoidTopics,
        prefer,
      });
      if (angle) {
        newsAngleBlock = angleToPromptBlock(angle);
        console.log(`[Content] News angle picked (Sonnet): "${angle.picked.substring(0, 60)}..." → ${angle.angle.substring(0, 60)}`);
      }
    }
  } catch (e: any) {
    console.warn('[Content] News angle step failed (non-fatal):', e?.message?.substring(0, 100));
  }

  // 2026-06-03 — Trend Winners by sector (TikTok / Insta / LinkedIn).
  // Anchor Lena's generation on hooks/patterns that surperforment NOW
  // for the client's sector. Refreshed daily by /api/cron/refresh-trend-winners.
  let trendWinnersBlock = '';
  try {
    const sectorForWinners = (clientSettings as any)?.business_type
      || detectedBusinessType
      || 'restaurant';
    const { getWinnersForSector, formatWinnersForPrompt } = await import('@/lib/trends/winners-extractor');
    const winners = await getWinnersForSector(supabase, sectorForWinners, platform, 4);
    if (winners.length > 0) {
      trendWinnersBlock = formatWinnersForPrompt(winners);
      console.log(`[Content] Loaded ${winners.length} trend winners for sector=${sectorForWinners}, platform=${platform}`);
    }
  } catch (e: any) {
    console.warn('[Content] Trend winners load failed (non-fatal):', e?.message?.substring(0, 100));
  }

  const enhancedPrompt = `Génère 1 post ÉLITE pour aujourd'hui (${todayStr}).
${trendsContext}${eventContext}${typedDirectivesBlock}${directivesBlock}${trendWinnersBlock}
${sharedIntelligence ? `━━━ INTELLIGENCE PARTAGÉE (données de TOUS les agents) ━━━\n${sharedIntelligence}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` : ''}${visualReferences ? `\n${visualReferences}\n` : ''}${naturalismBlock}${inspirationBlock}${channelVoice}${newsAngleBlock}${globalLearningBlock}${dissatisfactionBlock}
Plateforme : ${platform}
Format suggéré : ${format}
Pilier suggéré : ${pillar}${avoidPillar ? `\nATTENTION : Le pilier "${avoidPillar}" a été trop utilisé récemment. CHANGE de pilier si possible.` : ''}${preferredFormats !== 'all' ? `\nPRÉFÉRENCE CLIENT : Le client préfère les ${preferredFormats}. Adapte le format en conséquence.` : ''}

CONTEXTE FEED (les derniers posts, du plus récent) :
${gridContext}

━━━ ANTI-DUPLICATION VISUELLE (CRITIQUE) ━━━
Les visual_description des derniers posts sont :
${recentVisuals.map((v: string, i: number) => `${i + 1}. ${v}`).join('\n') || '(aucun post récent)'}
→ Ton visual_description DOIT être COMPLÈTEMENT DIFFÉRENT de TOUS ces visuels.
→ Change le SUJET, le STYLE, la COULEUR DOMINANTE et la COMPOSITION.
→ INTERDIT de réutiliser la même scène ou le même concept même avec des mots différents.
${colorWarning ? `\n${colorWarning}` : ''}
${targetWarning ? `\n${targetWarning}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${subjectGuidance}

CTA RÉCENTS UTILISÉS : ${[...new Set(recentCTAs)].join(', ') || 'aucun'}
→ VARIE le CTA ! Si "save" a été fait, utilise "tag un ami" ou "commente" ou "lien en bio".

PILIER "${pillar}" — GUIDE :
${pillar === 'giving_value' ? '- Donne un vrai conseil applicable IMMÉDIATEMENT. Pas de fluff. Le lecteur doit se dire "ah je vais tester ça tout de suite". Ex: "3 erreurs qui tuent ton engagement Instagram" avec les solutions.' : ''}
${pillar === 'cta' ? '- CTA DIRECT mais pas agressif. Montre la transformation : avant/après. "Teste gratuitement", "Lien en bio", "15 crédits offerts". Le CTA est le point central du post.' : ''}
${pillar === 'social_proof' ? '- Montre des RÉSULTATS concrets. Chiffres, avant/après, témoignages (même simulés de manière crédible pour des types de commerces). Ex: "Ce restaurant a multiplié x3 ses réservations via Instagram".' : ''}
${pillar === 'educational' ? '- Enseigne quelque chose de NOUVEAU. Format tutoriel. "Comment...", "Pourquoi...", "Le guide pour...". Le lecteur apprend ET découvre que KeiroAI peut l\'aider.' : ''}
${pillar === 'trends' ? '- Commente une TENDANCE actuelle (IA, réseaux sociaux, marketing digital). Positionne KeiroAI comme expert qui suit l\'actu. Donne ton avis pro.' : ''}
${pillar === 'behind_the_scenes' ? '- Montre les COULISSES : comment KeiroAI fonctionne, le process de création, les updates. Humanise la marque. Crée de la proximité.' : ''}
${pillar === 'pain_point' ? '- Identifie un PROBLÈME que la cible vit au quotidien, puis montre la solution. Ex: "Tu passes 3h/jour sur tes posts ? Voici comment passer à 10min".' : ''}
${pillar === 'demo' ? '- DÉMONTRE le produit en action. Avant/après visuel. Montre la puissance de Seedream/KeiroAI. Le post EST la preuve.' : ''}

STRATÉGIE GLOBALE :
- Chaque post fait partie d'un ENSEMBLE cohérent. Pense au feed GLOBAL, pas juste ce post isolé.
- Le visuel doit être HARMONIEUX avec les posts précédents (alternance couleurs, pas de répétition).
- Le CTA doit être NATUREL, intégré au contenu, pas forcé. Il guide vers KeiroAI sans être publicitaire.
- Pense conversion INDIRECTE : le prospect voit le post → comprend la valeur → visite le profil → essaie KeiroAI.
- UTILISE les données du pool partagé : si l'email marche bien sur une catégorie, fais un post ciblé pour cette catégorie. Si les DMs ont du succès, renforce la visibilité Instagram.
- Ce post est le ${ slotType === 'linkedin_1' ? 'POST LINKEDIN MATIN (1er du jour)' : slotType === 'linkedin_2' ? 'POST LINKEDIN APRES-MIDI (2e du jour)' : slotType === 'evening' ? 'POST SOIR (3e du jour)' : slotType === 'midday' ? 'POST MIDI (2e du jour)' : 'POST MATIN (1er du jour)' } — assure-toi qu'il soit DIFFÉRENT des posts des autres créneaux de la journée.

RÈGLES :
- Plateformes autorisées : instagram, tiktok, linkedin
- Tu DOIS fournir un champ "visual_description" ULTRA DÉTAILLÉ — c'est un PROMPT SEEDREAM complet EN ANGLAIS pour générer un visuel professionnel
- INTERDIT : téléphone, smartphone, écran, mockup, device dans le visuel (sauf 1 post sur 10 max)
- À ÉVITER (qualité) : visuels abstraits 3D / cubes glowing / cyberpunk / sci-fi visualisations / waveforms / hologrammes / split-screen abstrait — ce sont des visuels AMATEURS de stock photo. Acceptable seulement si le business est genuinely tech/3D/IA. Pour un resto, un coiffeur, un fleuriste, un coach, etc. → préfère ÉDITORIAL photo réelle, lifestyle, monde tangible.
- À ÉVITER (qualité) : split-screen "concept A vs concept B" avec une moitié abstraite et l'autre réelle. C'est un cliché de designer paresseux. Si tu veux contraster deux idées, fais-le plutôt avec UNE scène réelle qui contient le contraste (ex : une assiette à moitié vide, deux coiffures côte-à-côte, une boutique avant/après).
- Exemples de BONS visual_description :
  * "Isometric 3D scene of a cozy French bakery with fresh croissants on display, warm golden lighting, deep violet accents, miniature people walking by, clean render, no text no letters"
  * "Cinematic photo of a florist arranging a vibrant bouquet in a sunlit workshop, shallow depth of field, warm amber tones with violet shadows, editorial style, no text"
  * "Bold flat design composition with abstract geometric shapes in violet and amber, a stylized chef hat as central element, asymmetric layout, studio lighting, no text no letters no words"
  * "3D clay render of a small boutique storefront with pastel colors, soft rounded objects, warm lighting, miniature scene, premium feel, no text"
- AUCUN texte/lettre/mot dans les visuels (Seedream ne gère pas le texte)
- Le champ "hashtags" DOIT contenir 5-10 hashtags pertinents dont #keiroai en premier (NE PAS les mettre dans caption)
- Pense à la MINIATURE dans la grille (carrée, lisible en petit)
- Alterne les couleurs de fond par rapport aux posts précédents

CAPTION — FORMAT UX VISUEL (ULTRA IMPORTANT) :
- La caption DOIT être AÉRÉE avec des sauts de ligne (\\n)
- Structure obligatoire :
  Ligne 1 : Hook punch (5-10 mots max) 🔥
  \\n
  Ligne 2-4 : Valeur (1 idée par ligne, emoji en début de ligne)
  \\n
  Ligne finale : CTA clair
- NE PAS inclure les hashtags dans le caption (ils sont dans le champ "hashtags")
- Max 800 chars Instagram, 500 chars TikTok
- JAMAIS de pavé de texte — chaque section séparée par une ligne vide

COHÉRENCE VISUEL ↔ CAPTION (CRITIQUE) :
- Le visual_description et le caption doivent parler du MÊME SUJET
- Si le hook parle d'un "restaurant qui a doublé ses réservations", le visuel DOIT montrer un restaurant
- Le prospect doit voir l'image ET lire la caption comme une seule histoire cohérente
- Le visuel ILLUSTRE le message, le message DÉCRIT ce que le visuel évoque

Retourne UN SEUL objet JSON valide (PAS de markdown, PAS de \`\`\`).
Champs obligatoires : platform, format, pillar, hook, caption, hashtags, visual_description, best_time, grid_color, content_angle`;

  let rawText: string;
  try {
    rawText = await callClaude({
      system: getContentSystemPrompt(),
      message: enhancedPrompt,
      maxTokens: 2000,
    });
  } catch (claudeError: any) {
    console.error('[Content] Claude API error for daily post:', claudeError.message);
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'daily_post_failed',
      data: { error: claudeError.message, phase: 'claude_call' },
      status: 'error', error_message: claudeError.message, created_at: nowISO,
      ...(orgId ? { org_id: orgId } : {}),
    });
    return NextResponse.json({ ok: false, error: `Claude error: ${claudeError.message}` }, { status: 502 });
  }

  if (!rawText || rawText.trim().length === 0) {
    console.error('[Content] Claude returned empty response');
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'daily_post_failed',
      data: { error: 'Empty Claude response', phase: 'claude_empty' },
      status: 'error', error_message: 'Empty Claude response', created_at: nowISO,
      ...(orgId ? { org_id: orgId } : {}),
    });
    return NextResponse.json({ ok: false, error: 'Claude returned empty response' }, { status: 502 });
  }

  // Robust JSON parser — Claude occasionally returns JSON with unescaped
  // newlines inside string values (mostly when the caption contains a
  // line break). The plain JSON.parse rejects this. We try in order:
  //   1. As-is parse on raw match
  //   2. Strip markdown fences + try
  //   3. Salvage truncated JSON (close object)
  //   4. Aggressive cleanup: escape literal newlines inside string vals
  function tryParseClaudePostJson(text: string): any | null {
    const cleanText = text.replace(/```[\w]*\s*/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { /* try salvage */ }
      // Aggressive cleanup: escape unescaped newlines/tabs inside string
      // values. We can't simply replace ALL \n because they're valid
      // between tokens — only inside double-quoted strings.
      try {
        let inStr = false;
        let esc = false;
        const chars = jsonMatch[0].split('');
        for (let i = 0; i < chars.length; i++) {
          const ch = chars[i];
          if (esc) { esc = false; continue; }
          if (ch === '\\') { esc = true; continue; }
          if (ch === '"') { inStr = !inStr; continue; }
          if (inStr) {
            if (ch === '\n') chars[i] = '\\n';
            else if (ch === '\r') chars[i] = '\\r';
            else if (ch === '\t') chars[i] = '\\t';
          }
        }
        return JSON.parse(chars.join(''));
      } catch { /* try salvage */ }
    }
    // Salvage truncated JSON
    const partialMatch = cleanText.match(/\{[\s\S]*/);
    if (partialMatch) {
      try {
        let salvaged = partialMatch[0]
          .replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '')
          .replace(/,\s*$/, '');
        if (!salvaged.endsWith('}')) salvaged += '}';
        return JSON.parse(salvaged);
      } catch { /* give up */ }
    }
    return null;
  }

  let post: any = tryParseClaudePostJson(rawText);
  if (!post) {
    // Retry once with Claude using a strict-JSON system prompt.
    // Two repeated parse failures usually mean Claude truncated AND
    // mangled the output — a fresh call with shorter context fixes it.
    console.warn('[Content] First parse failed, retrying Claude with strict JSON mode');
    try {
      const retryRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: 'Output ONLY a single valid JSON object. No markdown fences, no commentary, no newlines outside string values. Escape every literal newline inside strings as \\n.',
          messages: [
            { role: 'user', content: `Reformulate this Claude response as a STRICT JSON object (escape all internal newlines as \\n inside string values). If a field is missing, set it to null. The JSON keys to keep are: caption, hashtags, format, best_time, visual_description.\n\nOriginal output:\n${rawText.slice(0, 6000)}` },
          ],
        }),
      });
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        const retryText = retryData.content?.[0]?.text || '';
        post = tryParseClaudePostJson(retryText);
        if (post) console.log('[Content] Strict-JSON retry succeeded');
      }
    } catch (e: any) {
      console.error('[Content] Strict-JSON retry failed:', e?.message?.slice(0, 200));
    }
  }
  if (!post) {
    console.error('[Content] Parse error final, Raw:', rawText.substring(0, 300));
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'daily_post_failed',
      data: { raw: rawText.substring(0, 800), error: 'JSON parse failed even after retry' },
      status: 'error', error_message: 'Failed to parse post after retry', created_at: nowISO,
      ...(orgId ? { org_id: orgId } : {}),
    });
    return NextResponse.json({ ok: false, error: 'Failed to parse post' }, { status: 500 });
  }

  // Parse time — default starts with post.best_time (Claude's guess)
  let scheduledTime = '12:00';
  if (post.best_time) {
    const timeMatch = post.best_time.match(/(\d{1,2})[h:](\d{2})?/);
    if (timeMatch) scheduledTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`;
  }

  // ── Override with the client's data-driven optimal hour for this slot ──
  // Three-tier fallback:
  //   1. performance_ranking.optimal_hours (≥ medium confidence) — data-driven
  //   2. expert-recommended hour per business type (day 0, no data yet)
  //   3. Claude's best_time guess or 12:00 default
  const optimalHours: string[] = clientSettings?.performance_ranking?.optimal_hours || [];
  const rankingConfidence = clientSettings?.performance_ranking?.confidence;
  const slotTypeLC = slotType as 'morning' | 'midday' | 'evening' | 'tiktok' | 'linkedin_1' | 'linkedin_2';

  if (optimalHours.length > 0 && rankingConfidence !== 'low') {
    const slotRange = slotTypeLC === 'morning' ? [5, 11] : slotTypeLC === 'midday' ? [11, 16] : slotTypeLC === 'evening' ? [16, 23] : null;
    if (slotRange) {
      const match = optimalHours.find(hh => {
        const h = parseInt(hh.split(':')[0] || '0');
        return h >= slotRange[0] && h < slotRange[1];
      });
      if (match) scheduledTime = match;
    }
  } else if (slotTypeLC === 'morning' || slotTypeLC === 'midday' || slotTypeLC === 'evening') {
    // No reliable data yet — use expert default for this business type
    try {
      const { getDefaultOptimalHour } = await import('@/lib/content/default-timing');
      // Read business_type off the profile if we have it
      let businessType: string | null = null;
      if (userId) {
        const { data: dossier } = await supabase
          .from('business_dossiers')
          .select('business_type')
          .eq('user_id', userId)
          .maybeSingle();
        businessType = dossier?.business_type || null;
      }
      scheduledTime = getDefaultOptimalHour(businessType, slotTypeLC);
    } catch (e: any) {
      // Fall back to whatever best_time gave us or 12:00
      console.warn('[Content] default-timing fallback failed:', e?.message);
    }
  }

  // Sanitize values to match DB check constraints
  const VALID_PLATFORMS_D = ['instagram', 'tiktok', 'linkedin'];
  const VALID_FORMATS_D = ['carrousel', 'reel', 'story', 'post', 'video', 'text'];
  const VALID_PILLARS_D = ['tips', 'demo', 'social_proof', 'trends'];
  const PILLAR_MAP_D: Record<string, string> = { giving_value: 'tips', educational: 'tips', cta: 'demo', behind_the_scenes: 'demo', pain_point: 'tips' };
  const rawPlatformD = (post.platform || platform).toLowerCase();
  const rawFormatD = (post.format || schedule.format).toLowerCase().replace('carousel', 'carrousel');
  const safePlatform = VALID_PLATFORMS_D.includes(rawPlatformD) ? rawPlatformD : platform;
  const safeFormat = VALID_FORMATS_D.includes(rawFormatD) ? rawFormatD : schedule.format;
  const rawPillarD = (post.pillar || pillar || 'tips').toLowerCase();
  const safePillar = VALID_PILLARS_D.includes(rawPillarD) ? rawPillarD : (PILLAR_MAP_D[rawPillarD] || 'tips');

  // 2026-06-04 — Cross-platform reuse BIDIRECTIONNEL (IG ↔ TikTok).
  // Avant de générer un visuel frais (qui coûte ~€0.03 Bytedance), on
  // regarde si un post performant existe DÉJÀ sur l'autre plateforme
  // dans la fenêtre 7-30 jours. Si oui on lift le visuel et Lena
  // ré-écrit la caption en mode plateforme-native.
  let reusedFromIgPostId: string | null = null;
  let reusedVisualUrl: string | null = null;
  if (userId && !forceFormat) {
    try {
      if (safePlatform === 'tiktok') {
        // IG → TikTok
        const { findIgPostToRepurposeForTiktok } = await import('@/lib/content/cross-platform-reuse');
        const candidate = await findIgPostToRepurposeForTiktok(supabase, userId);
        if (candidate) {
          reusedFromIgPostId = candidate.ig_post_id;
          reusedVisualUrl = candidate.visual_url;
          console.log(`[Content] TikTok cross-repurpose ← IG post ${candidate.ig_post_id} (score ${candidate.performance_score})`);
        }
      } else if (safePlatform === 'instagram') {
        // TikTok → IG (sens inverse, ajouté 2026-06-04)
        const { findTiktokPostToRepurposeForIg } = await import('@/lib/content/cross-platform-reuse');
        const candidate = await findTiktokPostToRepurposeForIg(supabase, userId);
        if (candidate) {
          reusedFromIgPostId = candidate.ig_post_id; // ici c'est en réalité un TT post id
          reusedVisualUrl = candidate.visual_url;
          console.log(`[Content] IG cross-repurpose ← TikTok post ${candidate.ig_post_id} (score ${candidate.performance_score})`);
        }
      }
    } catch (e: any) {
      console.warn('[Content] cross-platform reuse check failed (non-fatal):', e?.message);
    }
  }

  const { data: inserted, error: insertError } = await supabase.from('content_calendar').insert({
    platform: safePlatform,
    format: safeFormat,
    pillar: safePillar,
    hook: post.hook || null,
    caption: post.caption || '',
    hashtags: post.hashtags || [],
    visual_description: post.thumbnail_description || post.visual_description || null,
    visual_url: reusedVisualUrl, // pre-fill when we lifted from IG (skip Seedance call)
    reused_from_post_id: reusedFromIgPostId,
    slides: post.slides || null,
    script: post.script || null,
    scheduled_date: todayStr,
    scheduled_time: scheduledTime,
    status: draftOnly ? 'draft' : 'approved',
    ai_generated: true,
    user_id: userId || null,
  }).select().single();

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  // Generate visual or video using KeiroAI's own tech (proof of product!)
  const visualDesc = post.thumbnail_description || post.visual_description || post.hook || post.caption;
  const postPlatform = post.platform || platform;
  const postFormat = post.format || schedule.format;
  // Any reel/video format (TikTok or Instagram) gets the full video+narration pipeline
  const needsVideo = postFormat === 'video' || postFormat === 'reel';

  let visualUrl: string | null = null;
  let videoUrl: string | null = null;
  let igPermalink: string | undefined;
  let tiktokPublishId: string | undefined;
  let publicationError: string | undefined;

  // If we already lifted a visual from IG (cross-platform reuse) we
  // skip the whole gen pipeline — just keep the pre-filled visual_url
  // and move on. Saves ~€0.03 / TikTok post for established clients.
  if (reusedVisualUrl) {
    visualUrl = reusedVisualUrl;
    console.log(`[Content] Skipping Seedance gen — using reused IG visual for post ${inserted?.id}`);
  } else if (visualDesc && inserted?.id) {
    if (needsVideo && postPlatform === 'tiktok') {
      // TikTok: async long video pipeline (30s) — video-poll cron will advance & publish
      console.log(`[Content] TikTok video — starting async 30s pipeline for post ${inserted.id}`);
      const asyncResult = await createAsyncLongVideo(
        visualDesc,
        post.caption || visualDesc,
        30, // 30s TikTok video
        '9:16',
        inserted.id,
      );
      if (asyncResult.jobId) {
        console.log(`[Content] TikTok async job started: ${asyncResult.jobId} — video-poll cron will handle the rest`);
        visualUrl = asyncResult.coverUrl;

        // Log and return — don't publish now, video-poll cron will do it
        await supabase.from('agent_logs').insert({
          agent: 'content', action: 'tiktok_long_video_started',
          data: {
            postId: inserted.id,
            jobId: asyncResult.jobId,
            duration: 30,
            platform: 'tiktok',
            hook: post.hook,
          },
          status: 'success', created_at: nowISO,
          ...(orgId ? { org_id: orgId } : {}),
        });

        // Admin email notification DISABLED — admin no longer publishes content
        // Content notifications go through Noah+AMI daily brief to each client
        if (false && process.env.RESEND_API_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'KeiroAI Content <contact@keiroai.com>',
              to: ['contact@keiroai.com'],
              subject: `🎬 Vidéo TikTok 30s en cours — ${post.hook || 'Nouveau contenu'}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;">
                <h2 style="color:#0c1a3a;">🎬 Vidéo TikTok 30s en génération</h2>
                <p>Job ID: <code>${asyncResult.jobId}</code></p>
                <p><strong>Hook :</strong> ${post.hook || 'N/A'}</p>
                <p>La vidéo sera publiée automatiquement quand elle sera prête (via le cron video-poll).</p>
                ${asyncResult.coverUrl ? `<img src="${asyncResult.coverUrl}" style="max-width:100%;border-radius:8px;margin:12px 0;" alt="Cover"/>` : ''}
                <p><a href="https://keiroai.com/admin/agents" style="color:#0c1a3a;">→ Voir dans l'admin</a></p>
              </div>`,
            }),
          });
        }

        return NextResponse.json({
          ok: true,
          post: inserted,
          async_video: true,
          video_job_id: asyncResult.jobId,
        });
      } else {
        // Async failed — fallback to synchronous 10s video
        console.warn('[Content] Async long video failed — falling back to sync 10s');
        const videoResult = await generateVideoWithNarration(visualDesc, post.caption || visualDesc, postFormat, 10);
        videoUrl = videoResult.videoUrl;
        visualUrl = videoResult.coverUrl || asyncResult.coverUrl;
      }
    } else if (needsVideo) {
      // Instagram Reels: synchronous 5s video (fast generation)
      console.log(`[Content] ${postPlatform} reel — generating 5s video via Kling/Seedance T2V`);
      const videoResult = await generateVideoWithNarration(
        visualDesc,
        post.caption || visualDesc,
        postFormat,
        5
      );
      videoUrl = videoResult.videoUrl;
      visualUrl = videoResult.coverUrl;

      // If video failed but we have a cover image, downgrade to image post
      if (!videoUrl && visualUrl) {
        console.log('[Content] Video generation failed — publishing as image post instead of reel');
        // Update format in DB so auto-publish won't try reel again
        await supabase.from('content_calendar').update({ format: 'post', updated_at: new Date().toISOString() }).eq('id', inserted.id);
      }
    } else {
      // Image-based post — three-way choice when the client has
      // uploaded their own photos:
      //   - 10% raw reuse   → publish the real photo untouched (rare —
      //                        most client photos benefit from a lift)
      //   - 55% i2i pimp    → Seedream image-to-image re-renders the
      //                        photo with editorial lighting, on-brand
      //                        palette AND elements tied to the current
      //                        trend / news angle (subject recognisable)
      //   - 35% pure gen    → Seedream text-to-image builds a net-new
      //                        scene from the visual_description
      // No uploads → always pure generation.
      //
      // Ratios updated 2026-04-22 per user: "change le ratio pour 10%
      // seulement de photo brut" — heavier Jade-lift emphasis.
      //
      // Anti-duplicate guard: we exclude any upload that appeared as
      // visual_url in the last 15 posts so a restaurant with only 3
      // photos doesn't spam the same shot twice this week.
      let pickedUpload: { id: string; file_url: string; analysis?: any } | null = null;
      if (userId) {
        try {
          const { data: recentPosts } = await supabase
            .from('content_calendar')
            .select('visual_url')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(15);
          const recentUrls = new Set((recentPosts || []).map((r: any) => r.visual_url).filter(Boolean));

          // Cross-agent sharing: pull images from EVERY agent workspace
          // of this user (onboarding/Clara, content/Léna, dm_instagram/Jade,
          // marketing/Ami, etc.). All information flows between agents —
          // Clara collecting the restaurant's dish photos benefits Jade
          // and Léna directly, no duplicate upload needed.
          const { data: uploads } = await supabase
            .from('agent_uploads')
            .select('id, file_url, file_type, agent_id, ai_analysis, caption, created_at, archived_at')
            .eq('user_id', userId)
            .or('file_type.ilike.image/%,file_url.ilike.%.jpg,file_url.ilike.%.jpeg,file_url.ilike.%.png,file_url.ilike.%.webp')
            .is('archived_at', null)
            .not('ai_analysis', 'is', null)
            .order('created_at', { ascending: false })
            .limit(60);

          // STRICT image filter — a post visual must be a real raster
          // photograph (jpg/jpeg/png). Excludes logos-by-ext, svg/gif/video,
          // and crucially: any document file (docx/pdf/xlsx/pptx etc.)
          // which would crash Seedream i2i and Instagram's media upload.
          const isRaster = (u: any) => {
            const ft = (u.file_type || '').toLowerCase();
            const url = (u.file_url || '').toLowerCase();
            // Accept only these extensions
            const okExt = /\.(jpg|jpeg|png)(\?|$)/.test(url)
              || ft === 'image/jpeg'
              || ft === 'image/jpg'
              || ft === 'image/png'
              || ft === 'jpg'
              || ft === 'jpeg'
              || ft === 'png';
            if (!okExt) return false;
            if (ft.includes('svg') || ft.includes('gif') || url.endsWith('.svg') || url.endsWith('.gif')) return false;
            return true;
          };

          // Skip logos / brand marks / business cards / documents — those
          // are brand reference material (palette/typo extraction), NOT
          // post hero images. Also skip content_type='document'/'data'/
          // 'deck'/'video'/'audio' explicitly so only photo-like uploads
          // land as heroes.
          const isPostWorthy = (u: any) => {
            const a = u.ai_analysis || {};
            if (a.is_logo === true) return false;
            const heroTypes = ['product', 'dish', 'space', 'ambiance', 'team', 'behind_scenes', 'customer', 'other'];
            if (a.content_type && !heroTypes.includes(a.content_type)) return false;
            const elements = Array.isArray(a.visible_elements) ? a.visible_elements.join(' ').toLowerCase() : '';
            if (/business card|logo only|text only/.test(elements)) return false;
            return true;
          };

          // Topic-aware relevance: boost photos whose visible_elements or
          // ambiance match the current post's pillar. A "trends" post about
          // a dish gets a food photo first; a "tips" post gets a behind-
          // the-scenes / team photo first. Falls back gracefully when no
          // strong match exists — any authentic client photo beats a
          // generic generation.
          const pillarHints: Record<string, string[]> = {
            trends:       ['dish', 'plate', 'menu', 'product', 'storefront', 'drink', 'counter'],
            tips:         ['team', 'behind', 'process', 'hands', 'ingredient', 'tool', 'workshop'],
            demo:         ['dish', 'product', 'detail', 'close-up', 'packaging', 'signature'],
            social_proof: ['customer', 'happy', 'smile', 'group', 'celebration', 'full table'],
          };
          const hintsForThisPost = pillarHints[pillar as string] || [];

          // Preferred content_type per pillar — the HERO of the post.
          // Dish/product for trends+demo, team/behind_scenes for tips,
          // customer for social_proof. Venue photos are secondary context
          // (they compose WITH the hero via venueContext), never the
          // primary subject — otherwise a restaurant's whole feed becomes
          // dining-room wallpaper with no food in sight.
          const preferredTypes: Record<string, string[]> = {
            trends:       ['dish', 'product'],
            demo:         ['dish', 'product'],
            tips:         ['team', 'behind_scenes', 'process'],
            social_proof: ['customer', 'dish', 'product'],
          };
          const preferredForPillar = preferredTypes[pillar as string] || [];

          // Detect dish-saturation: how many of the last 5 posts used a
          // dish/product as PRIMARY hero? When it's ≥3, we flip the bias
          // and let space/ambiance photos surface as the hero so the feed
          // gets a venue-only post instead of yet another plate.
          const recentHeroes: string[] = (recentGrid || []).slice(0, 5).map((p: any): string => {
            const v = (p.visual_description || '').toLowerCase();
            if (/(plat|dish|bouquet|soin|product|produit|pi.ce|montre|robe|sac)/.test(v)) return 'product';
            if (/(int.rieur|interior|salle|devanture|fa.ade|room|venue|terrasse|comptoir|atelier)/.test(v)) return 'space';
            return 'other';
          });
          const dishSaturated = recentHeroes.filter((h: string) => h === 'product').length >= 3;

          const scoreRelevance = (u: any): number => {
            const a = u.ai_analysis || {};
            const blob = `${a.ambiance || ''} ${(Array.isArray(a.visible_elements) ? a.visible_elements.join(' ') : '')} ${(Array.isArray(a.style_descriptors) ? a.style_descriptors.join(' ') : '')} ${u.caption || ''}`.toLowerCase();
            let score = 0;

            if (dishSaturated) {
              // Feed has been dish-heavy — promote space/ambiance to hero
              // so the next post is the room, the terrasse, the marble
              // counter, the morning light — not another plate.
              if (a.content_type === 'space' || a.content_type === 'ambiance') score += 18;
              if (['dish', 'product'].includes(a.content_type)) score -= 10;
            } else {
              // Normal regime — dish/product is the natural hero, space
              // belongs in venueContext, not as primary.
              if (a.content_type && preferredForPillar.includes(a.content_type)) score += 20;
              if (['dish', 'product'].includes(a.content_type)) score += 5;
              if (a.content_type === 'space' || a.content_type === 'ambiance') score -= 3;
            }

            for (const hint of hintsForThisPost) if (blob.includes(hint)) score += 2;
            if (u.agent_id === 'content' || u.agent_id === 'onboarding') score += 1;
            // Strong penalty for recently-used. Used to be -4 (soft) which
            // didn't stop the same octopus dish landing twice in a row.
            // -25 makes it almost impossible to pick again unless no
            // alternative exists at all.
            if (recentUrls.has(u.file_url)) score -= 25;
            return score;
          };

          const candidates = (uploads || [])
            .filter(isRaster)
            .filter(isPostWorthy)
            .map((u: any) => ({ u, score: scoreRelevance(u) }))
            .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

          const pick = candidates[0]?.u || (uploads || []).filter(isRaster).filter(isPostWorthy)[0];
          if (pick?.file_url) {
            pickedUpload = { id: pick.id, file_url: pick.file_url, analysis: pick.ai_analysis };
            console.log(`[Content] Picked upload ${pick.id} from agent=${pick.agent_id} score=${candidates.find((c: { u: any; score: number }) => c.u.id === pick.id)?.score || 0}`);

            // ── Secondary context pick: the venue ──
            // If the primary pick is a PRODUCT/DISH and the client also
            // uploaded a SPACE/VENUE/AMBIANCE photo, use the venue as a
            // context reference so the generated visual shows the real
            // product INSIDE the real space — not a generic studio
            // plate isolated from the restaurant. Same logic for a
            // boutique: product photo + shop interior = product shown
            // in the actual boutique. Authenticity over stock.
            const pickType = pick.ai_analysis?.content_type;
            const needsVenueContext = ['product', 'dish'].includes(pickType);
            if (needsVenueContext) {
              // Rotate across ALL venue photos the client uploaded. A
              // client with 3 café shots shouldn't see the same room in
              // every post — variety signals an active, living place.
              // Order: venues NOT used in the last 15 posts first, then
              // pick randomly among that pool. If every venue was recently
              // used (small client with 1 photo), fall back to any of them.
              const allVenues = (uploads || [])
                .filter(isRaster)
                .filter(isPostWorthy)
                .filter((u: any) => {
                  const ct = u.ai_analysis?.content_type;
                  return u.file_url !== pick.file_url && ['space', 'ambiance'].includes(ct);
                });
              const freshVenues = allVenues.filter((v: any) => !recentUrls.has(v.file_url));
              const pool = freshVenues.length > 0 ? freshVenues : allVenues;
              const venueCandidate = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
              if (venueCandidate) {
                (pickedUpload as any).venueContext = {
                  file_url: venueCandidate.file_url,
                  analysis: venueCandidate.ai_analysis,
                };
                console.log(`[Content] Paired ${pickType} ${pick.id} with venue ${venueCandidate.id} (${pool.length} venue(s) in rotation, ${freshVenues.length} fresh) — real product-in-venue composition`);
              }
            }
          }
        } catch (e: any) {
          console.warn('[Content] Upload pick failed:', String(e?.message || e).substring(0, 200));
        }
      }

      const rng = Math.random();
      const hasVenuePair = !!(pickedUpload as any)?.venueContext;
      // When we have a product+venue pair available, SKIP the raw reuse
      // branch entirely — the whole point of the pairing is that we need
      // i2i to compose the dish into the real dining room. Raw reuse of
      // just the dish would miss the client's brand signature (their
      // actual space). Same for boutique product × shop interior.
      if (pickedUpload && !hasVenuePair && rng < 0.10) {
        // 10% — raw reuse only when NO venue pair exists (no composition
        // opportunity). If venuePair exists, we always route through i2i
        // below so the dish lands in the real space.
        visualUrl = pickedUpload.file_url;
        console.log(`[Content] Reusing client photo ${pickedUpload.id} (raw reuse, no venue pair)`);
        await supabase.from('content_calendar').update({
          publish_diagnostic: `client_photo_raw:${pickedUpload.id}`,
        }).eq('id', inserted.id).throwOnError?.();
      } else if (pickedUpload && (hasVenuePair || rng < 0.65)) {
        const venueCtx = (pickedUpload as any).venueContext;

        // ASSET-GROUNDED visual description: when Léna has concrete
        // client photos (a specific dish + venue), the post visual
        // description MUST describe those specific assets, not whatever
        // random vertical the pillar ended up on. If Léna is writing
        // about a "fleuriste" but the client uploaded a dish photo,
        // we'd get nonsense at QA — the dish regenerates into flowers.
        // By overriding the brief with what's actually in the uploads,
        // we keep the visual pipeline grounded in the client's reality.
        let effectiveVisualDesc = visualDesc;
        if (hasVenuePair) {
          const dishSummary = pickedUpload.analysis?.summary || 'a signature dish';
          const venueSummary = venueCtx.analysis?.summary || 'the restaurant interior';
          const venuePalette = (venueCtx.analysis?.color_palette || []).slice(0, 5).join(', ') || 'as in reference';
          const venueElements = (venueCtx.analysis?.visible_elements || []).slice(0, 8).join(', ') || 'as in reference';
          const venueSpaceType = venueCtx.analysis?.space_type || 'urban indoor space';

          // Camera-angle variation — rotate across 4 editorial shot
          // types so the feed doesn't read as one repeated composition.
          // Each shot type fixes the dish-to-frame ratio so the QA can
          // catch outliers (e.g. dish at 50% on a "wide" shot = wrong).
          const SHOT_TYPES = [
            {
              id: 'wide',
              prompt: 'WIDE editorial restaurant shot — camera back, room dominant. Dish on a mid-ground or distant table, ~10-15% of frame. Viewer takes in the whole space first, plate is one detail among many.',
              dishPct: '10-15%',
            },
            {
              id: 'medium_table',
              prompt: 'MEDIUM table-level shot — camera at diner eye level, focal point is one table with the plate. Plate ~20-25% of frame. Soft natural depth-of-field; the rest of the room visible in the background, slightly out of focus, recognisable but not sharp.',
              dishPct: '20-25%',
            },
            {
              id: 'three_quarter',
              prompt: 'THREE-QUARTER angle — camera ~45° above table, plate at lower-third or side of frame, ~20% area. Empty chairs, neighbouring tables, walls clearly visible behind. Editorial lifestyle look, not food-photography hero crop.',
              dishPct: '~20%',
            },
            {
              id: 'overhead_partial',
              prompt: 'OVERHEAD PARTIAL — top-down on a corner of one table, plate fills lower-half corner ~25-30%. Other table edge, cutlery, glass, fabric napkin or marble visible; one chair and ambient room light reaching the table edge. Real photo, not flat lay.',
              dishPct: '25-30%',
            },
          ];
          const shotIdx = Math.floor(Math.random() * SHOT_TYPES.length);
          const shot = SHOT_TYPES[shotIdx];

          // Add per-business naturalism context to the visual brief
          // so e.g. an institut beauté generation respects skin/lighting
          // rules even when only one upload is being i2i'd.
          let naturalismHints = '';
          if (detectedBusinessType) {
            try {
              const { naturalismProfileFor } = await import('@/lib/agents/business-naturalism');
              const np = naturalismProfileFor(detectedBusinessType);
              naturalismHints = `\nBUSINESS NATURALISM (${np.label}):\n- People: ${np.rules.people}\n- Lighting: ${np.rules.lighting}\n- Skin / texture: ${np.rules.skin}\n- Avoid: ${np.rules.avoid.join('; ')}\n`;
            } catch {}
          }

          effectiveVisualDesc = `Preserve the exact dining room / venue shown in the reference: same tables, chairs, walls, windows, light fixtures, materials, decor. Real photograph (not 3D render).${naturalismHints}

REFERENCE VENUE — STRICT MATCH:
- Type: ${venueSpaceType}
- Visible elements that MUST stay: ${venueElements}
- Palette: ${venuePalette}

CAMERA / SHOT TYPE — ${shot.id.toUpperCase()}:
${shot.prompt}
Dish proportion target: ${shot.dishPct} of total frame area. Anything bigger looks artificial.

DISH: ${dishSummary}. Plated as in the reference photo of the dish — same plate shape and colour, same garnish, same sauce — placed naturally on a real restaurant table inside this venue.

ABSOLUTELY FORBIDDEN — DO NOT INVENT:
- NO sea view, ocean, beach, harbour, or water through windows unless the reference has it
- NO mountain view, valley, sunset, or vista unless the reference has it
- NO different chair styles, different table shapes, different door styles, or different ceiling
- NO additional rooms, balconies, or terraces beyond what the reference shows
- NO violet, purple, lilac, magenta or amber tones unless the reference contains them
- NO change to wall colour or material — keep terracotta as terracotta, brick as brick, etc.
- NO oversized dish — proportion must match the camera distance defined above

Real natural light matching the room's existing ambience. The dish must look proportional — a real plate on a real table, the same scale you'd see in a documentary photograph. No text, no logos.`;
          console.log(`[Content] Asset-grounded visualDesc — shot=${shot.id} (dish ${shot.dishPct}), elements: ${venueElements.substring(0, 80)}…`);
          // Stash chosen shot type for downstream QA — passes alongside
          // the brief so the auditor knows what proportion is "correct".
          (pickedUpload as any).chosenShot = shot;
        }

        // Quota guard — when monthly image quota is exhausted, skip
        // the i2i call entirely and reuse the raw client upload as the
        // visual. The post still ships; the user just doesn't burn
        // beyond their plan.
        if (imageQuotaExhausted) {
          visualUrl = pickedUpload.file_url;
          console.log(`[Content] Image quota exhausted — reusing raw client photo ${pickedUpload.id}`);
          await supabase.from('content_calendar').update({
            publish_diagnostic: `client_photo_quota_exhausted:${pickedUpload.id}`,
          }).eq('id', inserted.id).throwOnError?.();
        } else {
        // First i2i pass — venue-base at strength 0.10. Maximum
        // venue preservation; dish gets added as a subtle composition.
        // The previous default (0.12) sometimes made Seedream re-render
        // pendant lights or chair shapes; 0.10 cuts that re-interpret
        // budget while still giving Seedream room to place the dish.
        visualUrl = await generateVisualFromReference(
          hasVenuePair ? venueCtx.file_url : pickedUpload.file_url,
          effectiveVisualDesc,
          postFormat,
          hasVenuePair ? 0.10 : 0.4,
          hasVenuePair ? { file_url: pickedUpload.file_url, analysis: pickedUpload.analysis } : null,
        );

        // QA pass — Claude Vision scores the output 0-10. Below 7 we
        // retry with a tighter approach (low strength, no venue). If
        // still below 7, use the client's raw photo — authenticity
        // beats a bad generation every time. Never publish < 7.
        if (visualUrl) {
          try {
            const { scoreVisualQuality } = await import('@/lib/visuals/qa-check');
            const expectedSubject = pickedUpload.analysis?.content_type === 'dish'
              ? 'a specific gourmet dish on a plate (hero subject)'
              : pickedUpload.analysis?.content_type === 'product'
                ? 'a specific product (hero subject)'
                : 'the uploaded subject';
            // When we have a venue+dish pair, pass the venue photo as
            // the reference so QA can flag 'venue_changed' if Seedream
            // invented elements (sea view, different chairs, etc).
            const venueRefForQA = hasVenuePair ? venueCtx?.file_url : undefined;
            // Stash the chosen shot type so QA can verify proportions
            // against the camera distance the prompt asked for.
            const expectedShot = (pickedUpload as any).chosenShot
              ? `Shot type ordered: ${(pickedUpload as any).chosenShot.id} (dish should occupy ${(pickedUpload as any).chosenShot.dishPct} of frame). Flag proportions_unrealistic if the dish is significantly larger than this target.`
              : '';
            const briefForQA = expectedShot
              ? `${effectiveVisualDesc}\n\n[QA-INSTRUCTION] ${expectedShot}`
              : effectiveVisualDesc;
            const score = await scoreVisualQuality(visualUrl, briefForQA, expectedSubject, venueRefForQA);
            console.log(`[Content] QA score: ${score.score}/10 — flags: ${score.amateur_flags.join(',')} — ${score.notes}`);

            let bestScore = score.score;
            let bestFlags = score.amateur_flags;
            // Acceptance rule for venue+dish pairs:
            //   - venue_changed at score ≤ 3 = HARD reject (major DA
            //     violation: sea view added, wrong chair style, etc).
            //   - venue_changed at score 5-6 = accept (minor stylistic
            //     edits like slight pendant shift — within editorial
            //     license, not a DA cassée).
            //   - Otherwise score ≥ 5 = accept.
            // Without a venue pair we keep score ≥ 7.
            const isAcceptable = (s: number, flags: string[]) => {
              // Blur is a HARD reject — never publish a soft hero.
              if (flags.includes('blurry_subject') || flags.includes('out_of_focus')) return false;
              return hasVenuePair
                ? (s >= 5 && !(flags.includes('venue_changed') && s <= 3))
                : s >= 7;
            };

            if (!isAcceptable(score.score, score.amateur_flags)) {
              // Multi-pass retry — try DIFFERENT strengths/bases until
              // we hit an acceptable score. Each pass costs ~$0.04;
              // capped at 2 retries (3 total Seedream calls per post)
              // to keep the per-post cost under €0.20.
              const retries: Array<{ label: string; base: 'venue' | 'dish'; strength: number }> = hasVenuePair
                ? [
                    { label: 'venue-base 0.20', base: 'venue', strength: 0.20 },
                    { label: 'dish-base 0.30 with venue prompt', base: 'dish', strength: 0.30 },
                  ]
                : [
                    { label: 'dish-base 0.25', base: 'dish', strength: 0.25 },
                  ];

              for (const r of retries) {
                if (isAcceptable(bestScore, bestFlags)) break;
                console.log(`[Content] QA ${bestScore}/10 not acceptable, retry: ${r.label}`);
                const retryUrl = await generateVisualFromReference(
                  r.base === 'venue' ? venueCtx!.file_url : pickedUpload.file_url,
                  effectiveVisualDesc,
                  postFormat,
                  r.strength,
                  hasVenuePair
                    ? (r.base === 'venue'
                      ? { file_url: pickedUpload.file_url, analysis: pickedUpload.analysis }
                      : { file_url: venueCtx!.file_url, analysis: venueCtx!.analysis })
                    : null,
                );
                if (!retryUrl) continue;
                const sN = await scoreVisualQuality(retryUrl, briefForQA, expectedSubject, venueRefForQA);
                console.log(`[Content] QA ${r.label}: ${sN.score}/10 — flags: ${sN.amateur_flags.join(',')}`);
                // Take this attempt if it strictly improves the score.
                // We let the isAcceptable check at the end decide
                // whether the BEST attempt clears the DA bar.
                if (sN.score >= bestScore) {
                  visualUrl = retryUrl;
                  bestScore = sN.score;
                  bestFlags = sN.amateur_flags;
                }
              }
              // Final salvage rule (founder ask: "pas plusieurs fail
              // d'affilé qui envoi l'image brut"):
              //   - If best score < 3 (catastrophic — every pass had
              //     MAJOR DA violations + no usable composition), fall
              //     back to a raw photo, alternated 50/50 venue/dish
              //     for feed variety.
              //   - If best score 3-4 (QA over-reports minor drift on
              //     this venue), KEEP the best i2i. A composed scene
              //     with slight pendant shift beats spamming the feed
              //     with raw photos.
              //   - Score ≥ 5 = isAcceptable already kept it.
              if (bestScore < 3) {
                let salvageUrl: string;
                let salvageLabel: string;
                if (hasVenuePair) {
                  if (Math.random() < 0.5) {
                    salvageUrl = venueCtx.file_url;
                    salvageLabel = 'raw_venue_qa_salvage';
                  } else {
                    salvageUrl = pickedUpload.file_url;
                    salvageLabel = 'raw_dish_qa_salvage';
                  }
                } else {
                  salvageUrl = pickedUpload.file_url;
                  salvageLabel = 'raw_dish_qa_salvage';
                }
                console.log(`[Content] Final QA ${bestScore}/10 catastrophic — salvage: ${salvageLabel}`);
                visualUrl = salvageUrl;
                await supabase.from('content_calendar').update({
                  publish_diagnostic: `client_photo_${salvageLabel}:${pickedUpload.id}`,
                }).eq('id', inserted.id).throwOnError?.();
              } else if (!isAcceptable(bestScore, bestFlags)) {
                // Score 3-4 — keep the best i2i (already in visualUrl).
                console.log(`[Content] Final QA ${bestScore}/10 (flags: ${bestFlags.join(',') || 'none'}) — keeping best i2i (better than raw fallback)`);
                await supabase.from('content_calendar').update({
                  publish_diagnostic: `client_photo_i2i_kept_low_qa:${pickedUpload.id}+score=${bestScore}`,
                }).eq('id', inserted.id).throwOnError?.();
              }
            }
          } catch (qaErr: any) {
            console.warn('[Content] QA non-fatal:', qaErr?.message);
          }
        }
        if (visualUrl) {
          console.log(`[Content] Pimped client photo ${pickedUpload.id} via i2i`);
          const diagMode = hasVenuePair ? 'i2i_venue_base_dish_added_QA' : 'i2i';
          await supabase.from('content_calendar').update({
            publish_diagnostic: `client_photo_${diagMode}:${pickedUpload.id}${hasVenuePair ? `+venue:${(pickedUpload as any).venueContext?.analysis?.space_type || 'space'}` : ''}`,
          }).eq('id', inserted.id).throwOnError?.();
        } else {
          // i2i rejected by API — salvage with raw reuse before falling
          // back to a generic scene (authenticity > novelty).
          console.log(`[Content] i2i failed, falling back to raw reuse of ${pickedUpload.id}`);
          visualUrl = pickedUpload.file_url;
          await supabase.from('content_calendar').update({
            publish_diagnostic: `client_photo_raw_fallback:${pickedUpload.id}`,
          }).eq('id', inserted.id).throwOnError?.();
        }
        } // close: else (not imageQuotaExhausted)
      }
      // 30% — pure Seedream text-to-image (or whenever no client photo is available)
      if (!visualUrl && !imageQuotaExhausted) {
        visualUrl = await generateVisual(visualDesc, postFormat);
      }
      // Log quota usage AFTER successful generation (only when we
      // actually called Seedream — raw reuses don't count).
      if (visualUrl && !imageQuotaExhausted && userId && !visualUrl.includes('caption.jpg') && !visualUrl.includes('6-scaled.jpg')) {
        try {
          const { logQuotaUsage } = await import('@/lib/credits/quotas');
          await logQuotaUsage(userId, 'image_generated', { post_id: inserted.id, format: postFormat });
        } catch {}
      }

      // ── OPTIONAL TEXT OVERLAY ──
      // Claude Sonnet 4 judges whether a punchy 3-8 word overlay would
      // amplify the post (jeu de mots, link business ↔ visual + news).
      // Sonnet > Haiku here because the overlay is what stops the scroll —
      // generic punchlines lose conversion. Stored in overlay_text so
      // the user can edit it later from the post modal.
      if (visualUrl && !visualUrl.includes('.mp4')) {
        try {
          // ── HARD RATE GATE ──
          // Sonnet self-discipline failed in practice — overlays were
          // landing on every post. Count overlays in the last 10 posts
          // for this user; if ≥2 already have one, skip the call
          // entirely so the rate stays ≤20% deterministically.
          let recentOverlayCount = 0;
          if (userId) {
            try {
              const { data: recentForOverlay } = await supabase
                .from('content_calendar')
                .select('overlay_text')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(10);
              recentOverlayCount = (recentForOverlay || []).filter((r: any) => r.overlay_text && r.overlay_text.text).length;
            } catch {}
          }
          if (recentOverlayCount >= 1) {
            // Lowered from 2 → 1 after user feedback: text overlays
            // were appearing too often and not always adding value.
            // Now ≤10% of posts get overlay deterministically, and
            // Sonnet's gates 1-4 still further filter that 10%.
            console.log(`[Content] Overlay rate gate: ${recentOverlayCount}/10 recent posts already have overlay — skipping`);
          } else {
          // Pull richer business context for the overlay copy.
          let businessSummary: string | undefined;
          let signatureOffer: string | undefined;
          if (userId) {
            try {
              const { data: dossier } = await supabase
                .from('business_dossiers')
                .select('ai_summary, value_proposition')
                .eq('user_id', userId)
                .maybeSingle();
              businessSummary = dossier?.ai_summary || undefined;
              signatureOffer = dossier?.value_proposition || undefined;
            } catch {}
          }
          const recentNews = post.pillar === 'trends'
            ? (typeof trendsContext === 'string' ? trendsContext.substring(0, 300) : undefined)
            : undefined;
          const { decideTextOverlay, applyTextOverlay } = await import('@/lib/visuals/text-overlay');
          const decision = await decideTextOverlay({
            hook: post.hook || '',
            caption: post.caption || '',
            visualDescription: visualDesc,
            businessType: detectedBusinessType || (clientSettings as any)?.business_type || '',
            businessSummary,
            signatureOffer,
            recentNews,
            pillar: post.pillar || '',
            format: postFormat,
            language: 'fr',
          });
          if (decision.needsText) {
            const overlaidUrl = await applyTextOverlay(visualUrl, decision, inserted.id);
            if (overlaidUrl) {
              const originalUrl = visualUrl;
              visualUrl = overlaidUrl;
              await supabase.from('content_calendar').update({
                overlay_text: {
                  text: decision.text,
                  position: decision.position,
                  tone: decision.tone,
                  style: (decision as any).style || 'white-shadow',
                  accentColor: (decision as any).accentColor || null,
                  original_visual_url: originalUrl,
                },
              }).eq('id', inserted.id);
              console.log(`[Content] Text overlay applied: "${decision.text}" (${decision.position}, ${decision.tone}, ${(decision as any).style || 'white-shadow'})`);
            }
          } else {
            console.log('[Content] Text overlay: not needed for this post');
          }
          } // end overlay rate gate else
        } catch (overlayErr: any) {
          console.warn('[Content] Text overlay non-fatal:', overlayErr?.message);
        }
      }

      // ── CAPTION RE-GROUNDING ──
      // Léna wrote hook/caption/hashtags BEFORE we decided which upload
      // to use. If the final visual is driven by a client upload (raw
      // reuse or i2i from a dish/product/venue), the caption she wrote
      // from the generic business profile may contradict the actual
      // image — that's why agencies posting a restaurant shot end up
      // with "Ce fleuriste a triplé ses commandes…" under a plate of
      // octopus. Re-ground the copy on the specific asset so every
      // post reads as one coherent piece.
      if (pickedUpload && visualUrl) {
        try {
          const dishA = pickedUpload.analysis || {};
          const venueA = (pickedUpload as any).venueContext?.analysis || null;
          const subjectSummary = dishA.summary || 'le sujet de la photo';
          const subjectElements = Array.isArray(dishA.visible_elements) ? dishA.visible_elements.join(', ') : '';
          const subjectType = dishA.content_type || 'scene';
          const venueLine = venueA ? `\nLieu : ${venueA.summary || 'intérieur du commerce'}${venueA.visible_elements ? ` (${(venueA.visible_elements || []).join(', ')})` : ''}.` : '';
          const regenPrompt = `Réécris UNIQUEMENT hook + caption + hashtags pour qu'ils collent parfaitement à l'image qui sera publiée.

IMAGE À DÉCRIRE :
Sujet : ${subjectSummary}${subjectElements ? ` — éléments visibles : ${subjectElements}` : ''}
Type : ${subjectType}${venueLine}

Plateforme : ${postPlatform}. Pilier : ${post.pillar}. Format : ${postFormat}.

RÈGLES ABSOLUES :
- Parle exactement du sujet / lieu décrit ci-dessus. Si c'est un plat dans un restaurant : parle du plat et du restaurant. Si c'est un bouquet dans une boutique : parle du bouquet. JAMAIS un autre commerce.
- Hook : 5-12 mots accrocheurs ancrés dans le sujet réel
- Caption : 3-5 lignes aérées (saut de ligne entre blocs), style incarné, 1 emoji max par ligne, finit par un CTA naturel non agressif
- Hashtags : 5-8 hashtags pertinents au sujet/lieu, minuscules sans accents, pas de générique SaaS/marketing sauf si vraiment pertinent
- JSON strict uniquement, clés : hook (string), caption (string), hashtags (array of strings). Aucun markdown, aucun \`\`\`.`;

          const regen = await callClaude({
            system: 'Tu es un copywriter lifestyle/commerce local. Tu écris des captions Instagram qui respirent, incarnent le sujet exact de la photo et donnent envie. Retourne du JSON strict.',
            message: regenPrompt,
            maxTokens: 600,
          });
          const match = regen.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.hook && parsed.caption && Array.isArray(parsed.hashtags)) {
              post.hook = parsed.hook;
              post.caption = parsed.caption;
              post.hashtags = parsed.hashtags;
              await supabase.from('content_calendar').update({
                hook: parsed.hook,
                caption: parsed.caption,
                hashtags: parsed.hashtags,
              }).eq('id', inserted.id);
              console.log(`[Content] Caption re-grounded on ${subjectType}${venueA ? '+venue' : ''}: "${parsed.hook.substring(0, 60)}..."`);
            }
          }
        } catch (regenErr: any) {
          console.warn('[Content] Caption re-grounding failed (non-fatal):', regenErr?.message);
        }
      }
    }

    const hasMedia = visualUrl || videoUrl;
    if (hasMedia) {
      const visualUpdate: Record<string, any> = {
        visual_url: visualUrl || videoUrl,
        updated_at: new Date().toISOString(),
      };
      if (videoUrl) {
        visualUpdate.video_url = videoUrl;
      }
      if (!draftOnly) {
        // Don't set published until AFTER successful publish
        visualUpdate.status = 'approved'; // default: ready for publish

        if (postPlatform === 'instagram') {
          const igResult = await publishToInstagram(
            { format: postFormat, caption: post.caption, hashtags: post.hashtags, visual_url: visualUrl || undefined, video_url: videoUrl || undefined },
            supabase, orgId, userId
          );
          if (igResult.success) {
            visualUpdate.status = 'published';
            visualUpdate.published_at = new Date().toISOString();
            igPermalink = igResult.permalink;
            if (igResult.permalink) visualUpdate.instagram_permalink = igResult.permalink;
            console.log(`[Content] Daily post published to Instagram${igResult.permalink ? `: ${igResult.permalink}` : ''}`);
          } else {
            publicationError = igResult.error;
            visualUpdate.status = 'publish_failed';
            console.warn(`[Content] Instagram publish failed for daily post ${inserted.id}: ${igResult.error}`);
          }
        } else if (postPlatform === 'tiktok') {
          const ttResult = await publishToTikTok(
            { format: postFormat, caption: post.caption, hashtags: post.hashtags, visual_url: visualUrl || undefined, video_url: videoUrl || undefined },
            supabase
          );
          if (ttResult.success) {
            tiktokPublishId = ttResult.publish_id;
            if (ttResult.publish_id) visualUpdate.tiktok_publish_id = ttResult.publish_id;
            console.log(`[Content] Daily post published to TikTok: ${ttResult.publish_id}`);
          } else {
            publicationError = ttResult.error;
            visualUpdate.status = 'publish_failed';
            console.warn(`[Content] TikTok publish failed for daily post ${inserted.id}: ${ttResult.error}`);
          }
        }
      }
      await supabase.from('content_calendar').update(visualUpdate).eq('id', inserted.id);
      console.log(`[Content] Media generated${draftOnly ? ' (draft)' : ' + auto-published'} for post ${inserted.id}`);
    }
  }

  // Admin content email DISABLED — notifications go through Noah+AMI daily brief
  if (false && process.env.RESEND_API_KEY) {
    const isPublished = (!!visualUrl || !!videoUrl) && !draftOnly;
    const publishLink = igPermalink || (tiktokPublishId ? `TikTok publish_id: ${tiktokPublishId}` : '');
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'KeiroAI Content <contact@keiroai.com>',
        to: ['contact@keiroai.com'],
        subject: `${isPublished ? '✅' : '📱'} Post ${isPublished ? 'publié' : 'prêt'} : ${postPlatform} ${postFormat} — ${post.hook || 'Nouveau contenu'}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;">
          <h2 style="color:#0c1a3a;">${isPublished ? '✅ Publié' : '📱 Prêt'} — ${postPlatform} ${postFormat}</h2>
          <p><strong>Pilier :</strong> ${post.pillar} | <strong>Heure :</strong> ${post.best_time || scheduledTime}</p>
          <p><strong>Hook :</strong> ${post.hook || 'N/A'}</p>
          <p>${post.caption || ''}</p>
          ${igPermalink ? `<p><strong>Instagram :</strong> <a href="${igPermalink}">${igPermalink}</a></p>` : ''}
          ${tiktokPublishId ? `<p><strong>TikTok :</strong> publish_id: ${tiktokPublishId}</p>` : ''}
          ${publicationError ? `<p style="color:#dc2626;"><strong>Erreur publication :</strong> ${publicationError}</p>` : ''}
          ${visualUrl ? `<img src="${visualUrl}" style="max-width:100%;border-radius:8px;margin:12px 0;" alt="Visuel généré par KeiroAI"/>
          <p style="color:#6b7280;font-size:12px;">Visuel généré et publié automatiquement par KeiroAI</p>` : ''}
          <p style="margin-top:16px;"><a href="https://keiroai.com/admin/agents" style="color:#0c1a3a;">→ Voir dans l'admin</a></p>
        </div>`,
      }),
    });
  }

  await supabase.from('agent_logs').insert({
    agent: 'content', action: 'daily_post_generated',
    data: {
      platform: postPlatform,
      format: postFormat,
      pillar: post.pillar,
      hook: post.hook,
      instagram_permalink: igPermalink,
      tiktok_publish_id: tiktokPublishId,
      publication_error: publicationError,
      has_video: !!videoUrl,
    },
    status: 'success', created_at: nowISO,
    ...(orgId ? { org_id: orgId } : {}),
  });

  // ── Save learnings from daily post generation ──
  try {
    await saveLearning(supabase, {
      agent: 'content',
      category: 'content',
      learning: `Post quotidien généré: ${postPlatform} ${postFormat}, pilier=${post.pillar}${publicationError ? ' (erreur publication)' : ''}`,
      evidence: `daily_post: platform=${postPlatform}, format=${postFormat}, pillar=${post.pillar}, ig=${!!igPermalink}, tiktok=${!!tiktokPublishId}, error=${!!publicationError}`,
      confidence: 20,
    }, orgId);
  } catch (learnErr: any) {
    console.warn('[ContentAgent] Learning save error:', learnErr.message);
  }

  console.log(`[Content] Daily post: ${postPlatform} ${postFormat} — ${post.hook}`);

  // ── Notify client of publication result ──
  if (userId) {
    try {
      const { notifyPublication } = await import('@/lib/agents/notify-client');
      await notifyPublication(supabase, userId, {
        platform: postPlatform,
        permalink: igPermalink || undefined,
        caption: post.caption?.substring(0, 100),
        status: publicationError ? 'publish_failed' : (igPermalink || tiktokPublishId) ? 'published' : 'publish_failed',
        error: publicationError,
      });
    } catch {}
  }

  return NextResponse.json({
    ok: true,
    post: inserted,
    instagram_permalink: igPermalink,
    tiktok_publish_id: tiktokPublishId,
    publication_error: publicationError,
  });
}
// rebuild 1775042652
