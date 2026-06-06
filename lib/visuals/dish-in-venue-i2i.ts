/**
 * Dish-in-venue still v2 — composite + Seedream i2i refinement.
 *
 * Why this exists: the sharp-only composite from dish-in-venue.ts produces
 * a "sticker-pasted" feel when the venue is a wide angle (multiple tables
 * visible, dish lands between furniture). Founder ask 2026-06-05 after
 * the first test failed QA visually.
 *
 * Pipeline :
 *   1. sharp composite → gives Seedream the SPATIAL ANCHOR for the dish
 *   2. Seedream i2i (strength 0.45) on that composite → fixes perspective,
 *      matches lighting, hides the composite seam, keeps both venue + dish
 *      identity recognizable
 *
 * The result is uploaded as a fresh JPEG to business-assets/composites-i2i/
 * and the URL returned. Falls back to the raw composite on i2i failure.
 *
 * Cost: composite ~€0 (sharp local) + Seedream i2i ~€0.025 = ~€0.025 per still.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { compositeDishOnVenue } from './dish-in-venue';

/**
 * Look up a usable dish+venue pair from the client's uploaded assets.
 * Returns null if either side is missing — caller falls back to standard
 * AI generation.
 *
 * Picks RANDOMLY among fresh assets (not used in last 15 posts) to vary
 * the mix. Falls back to any available asset when the pool is exhausted.
 * Founder ask 2026-06-06: "faut une stratégie variée et varier aussi les
 * mixes d'images que ce soit pour publier sur insta ou tiktok ou linkedin".
 */
export async function pickClientDishVenuePair(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ dishUrl: string; venueUrl: string } | null> {
  try {
    const { data: files } = await supabase
      .from('agent_files')
      .select('file_url, ai_analysis')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!files || files.length === 0) return null;

    const dishes = files.filter((f: any) => ['dish', 'product'].includes(f.ai_analysis?.content_type) && f.file_url);
    const venues = files.filter((f: any) => ['space', 'ambiance'].includes(f.ai_analysis?.content_type) && f.file_url);
    if (dishes.length === 0 || venues.length === 0) return null;

    // Recently-used URLs (last 15 posts that referenced a client asset).
    const { data: recentPosts } = await supabase
      .from('content_calendar')
      .select('visual_url')
      .eq('user_id', userId)
      .not('visual_url', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(15);
    const recentUrls = new Set((recentPosts || []).map((p: any) => p.visual_url).filter(Boolean));

    const freshDishes = dishes.filter((d: any) => !recentUrls.has(d.file_url));
    const freshVenues = venues.filter((v: any) => !recentUrls.has(v.file_url));
    const dishPool = freshDishes.length > 0 ? freshDishes : dishes;
    const venuePool = freshVenues.length > 0 ? freshVenues : venues;

    const dish = dishPool[Math.floor(Math.random() * dishPool.length)];
    const venue = venuePool[Math.floor(Math.random() * venuePool.length)];
    return { dishUrl: dish.file_url, venueUrl: venue.file_url };
  } catch {
    return null;
  }
}

const SEEDREAM_API_URL = process.env.SEEDREAM_API_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';
const SEEDREAM_API_KEY = (process.env.SEEDREAM_API_KEY || process.env.ARK_API_KEY || '').replace(/\\n/g, '').trim();

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * The i2i prompt is FROZEN (no caller injection). Its job is to take the
 * sharp-composited still and integrate the dish into the venue properly:
 * - lock venue identity (same room, same decor, same lighting source)
 * - lock dish identity (same plate, same garnish, same colors)
 * - fix perspective (dish must sit on a real table at the correct angle)
 * - match lighting and shadow direction between dish and venue
 * - hide the compositing seam
 *
 * The negative_prompt explicitly bans the failure modes from the first test :
 * floating object, mismatched scale, double table, ghost dish, AI/midjourney look.
 */
const REFINEMENT_PROMPT = [
  'Editorial photograph of this exact restaurant interior with this specific signature dish placed naturally on the front table, as if a professional food photographer just composed the shot in-situ during service.',
  'PRESERVE the entire room exactly as in the base image: walls, windows, doors, plants, chairs, ceiling, color palette, light sources, ambient mood, every element of decor.',
  'PRESERVE the exact dish identity: same plate shape, same color of plate, same garnish, same protein, same sauce, same ingredients arrangement.',
  'NATURAL PLACEMENT: the dish sits ON a real table surface in the foreground of the room, at a perspective consistent with the camera angle of the venue photo (the dish must obey the same vanishing lines as the floor and tables in the venue). The plate rests on the table, not floating in mid-air.',
  'CONSISTENT LIGHTING: the shadow under the dish matches the direction and softness of the existing window light and pendant lamps in the venue. The dish picks up the warm/cool color cast of the surrounding ambient light.',
  'SCALE (STRICT): the plate occupies between 18% and 25% of the total image area — NEVER more than 25%. The dish must look proportional to a real plate (24-28cm diameter) on a real bistro table (~70-80cm diameter). If the plate appears bigger than ~1/3 of the table surface, the scale is WRONG. Founder note 2026-06-06: "lassiette est parfois un poil trop grosse" — keep it strictly under the threshold.',
  'CINEMATOGRAPHY: Leica M11 with 50mm Summilux at f/2.8, shot during service at golden hour or warm tungsten ambient, Kodak Portra 400 grain, soft natural shadow under the plate, ambient occlusion, ultra realistic editorial photography.',
  'STYLE REFERENCE: Vogue Local culinary editorial, Cereal Magazine, Apartamento — NOT commercial food advertising, NOT a stock photo.',
  'ZERO text in the image, ZERO watermark, ZERO logo, ZERO captions.',
].join(' ');

const NEGATIVE_REFINE = [
  'floating object', 'plate floating in mid-air', 'plate suspended', 'dish hovering',
  'wrong perspective', 'mismatched perspective', 'flat pasted look', 'sticker pasted',
  'duplicate plate', 'duplicate dish', 'ghost dish', 'translucent dish',
  'oversized dish', 'tiny dish', 'unrealistic scale',
  'different room', 'different venue', 'different building', 'changed walls',
  'new furniture', 'changed chairs', 'added objects on tables',
  'plastic skin', 'doll-like', 'plastic food', 'rubbery food',
  'porcelain finish', 'wax food', 'cgi food', '3d render look',
  'neon glow', 'magenta cyan saturation', 'hyper saturated', 'instagram filter glow',
  'midjourney style', 'stable diffusion default', 'dall-e style', 'AI portrait artifacts',
  'cartoon', 'anime', 'illustration', 'vector art',
  'text', 'words', 'letters', 'numbers', 'watermark', 'logo', 'caption',
].join(', ');

/**
 * People-add prompt — Stage 2 for "guest_enjoying" / "duo_sharing"
 * presets. Runs after the standard dish-in-venue refinement. Higher
 * strength (0.55) so Seedream can introduce a guest, but locks the
 * plate + venue identity hard via prompt.
 */
// Direct, action-oriented prompt. Seedream i2i responds better to
// imperative composition instructions ("add", "place") than to soft
// declarative ones ("with"). The 0.55 strength previously kept the
// scene fixed because nothing told the model to MODIFY it. 0.65 +
// imperative wording = guest reliably appears.
const ADD_GUEST_PROMPT = [
  'Add a single seated person behind the plate in this exact restaurant interior.',
  'The person is sitting at the table where the plate already is, body chest-up, head softly cropped at top of frame, eyes lowered toward the dish with focused concentration (NOT looking at camera). Cast a real human with authentic skin texture, visible pores, slight asymmetry. Vary the casting across reels: a mid-30s woman of maghrebi origin in a linen blouse, OR a 50yo afro-french man in a button-up shirt, OR a 28yo asian-french woman in a knit sweater, OR a 40yo south-european man in a navy polo. ONE person only.',
  'Preserve everything else exactly: the same plate, same food, same table, same walls, same windows, same chairs, same lighting, same camera angle, same ambient color grade. The plate must remain the visual anchor at 18-25% of frame.',
  'Shot on a Leica M11 with a 50mm Summilux at f/2, golden-hour ambient light from the existing window, Kodak Portra 400 film grain, very shallow depth of field with the plate sharp and the person softly blurred.',
  'Editorial documentary photography (Mary Ellen Mark, Cass Bird), NOT a commercial ad, NOT a posed front-facing smile.',
  'Zero text, zero watermark, zero logo in the image.',
].join(' ');

/**
 * Stage 2: run a 2nd Seedream i2i pass on the refined still to introduce
 * a guest in the scene. Returns the new URL on success, falls back to
 * the input refined still on failure (so the pipeline degrades to "no
 * guest" instead of returning null).
 *
 * Cost: ~€0.025 added on top of the stage-1 refinement (~€0.05 total
 * stills for people-interaction reels vs €0.025 for plain ones).
 */
export async function addGuestToRefinedStill(params: {
  refinedStillUrl: string;
  postId: string;
  aspect?: 'square' | 'story';
}): Promise<{ url: string; with_guest: boolean }> {
  if (!SEEDREAM_API_KEY) return { url: params.refinedStillUrl, with_guest: false };
  const size = params.aspect === 'square' ? '1920x1920' : '1440x2560';
  try {
    const res = await fetch(SEEDREAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SEEDREAM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'seedream-4-5-251128',
        prompt: ADD_GUEST_PROMPT,
        image: params.refinedStillUrl,
        // 2026-06-06: bumped 0.55→0.65 after first test produced no guest.
        // Lower values keep too much of the input (no person introduced);
        // 0.65 is the sweet spot where Seedream actively changes the scene
        // to add a guest while the explicit "preserve room/plate" prompt
        // holds the venue identity. 0.75+ starts drifting walls/chairs.
        image_strength: 0.65,
        strength: 0.65,
        // Crucial: removed "no guest"/"empty restaurant" from negative —
        // those were INSTRUCTING the model to AVOID generating a person.
        // Keep only the "guest-quality" negatives (no posed smile, no AI tells).
        negative_prompt: 'multiple guests, two people, three people, crowd, group of people, posed model, smiling at camera, looking at camera, perfect symmetry, plastic skin, doll skin, deformed hands, extra fingers, missing fingers, mutated hand, ring light catchlight, midjourney style, stable diffusion default, dall-e style, CGI, 3D render, anime, cartoon, illustration, vector art, text, words, letters, watermark, logo, caption',
        size,
        response_format: 'url',
        seed: -1,
        watermark: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      console.warn('[add-guest] Seedream HTTP', res.status, errTxt.substring(0, 250));
      return { url: params.refinedStillUrl, with_guest: false };
    }
    const data = await res.json();
    const tempUrl = data.data?.[0]?.url || data.images?.[0]?.url || null;
    if (!tempUrl) {
      console.warn('[add-guest] No URL in Seedream response:', JSON.stringify(data).substring(0, 250));
      return { url: params.refinedStillUrl, with_guest: false };
    }

    // Cache the result
    const fetched = await fetch(tempUrl);
    if (!fetched.ok) return { url: tempUrl, with_guest: true };
    const buf = Buffer.from(await fetched.arrayBuffer());
    const sb = admin();
    const path = `composites-i2i-guest/${params.postId}-${Date.now()}.jpg`;
    const { error: upErr } = await sb.storage
      .from('business-assets')
      .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
    if (upErr) return { url: tempUrl, with_guest: true };
    const { data: pub } = sb.storage.from('business-assets').getPublicUrl(path);
    return { url: pub?.publicUrl || tempUrl, with_guest: true };
  } catch (e: any) {
    console.warn('[add-guest] threw:', e?.message);
    return { url: params.refinedStillUrl, with_guest: false };
  }
}

/**
 * Build the integrated still. Returns null on hard failure (caller handles).
 */
export async function buildDishInVenueRefinedStill(params: {
  venueUrl: string;
  dishUrl: string;
  postId: string;
  aspect?: 'square' | 'story';
}): Promise<{ url: string | null; composite_url: string | null; refined: boolean; error?: string }> {
  // Step 1: sharp composite (spatial anchor)
  const compositeUrl = await compositeDishOnVenue(params);
  if (!compositeUrl) {
    return { url: null, composite_url: null, refined: false, error: 'composite_failed' };
  }

  // Step 2: Seedream i2i refinement
  if (!SEEDREAM_API_KEY) {
    return { url: compositeUrl, composite_url: compositeUrl, refined: false, error: 'no_seedream_key' };
  }

  const size = params.aspect === 'square' ? '1920x1920' : '1440x2560';

  try {
    const res = await fetch(SEEDREAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SEEDREAM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'seedream-4-5-251128',
        prompt: REFINEMENT_PROMPT,
        image: compositeUrl,
        image_strength: 0.45,
        strength: 0.45,
        negative_prompt: NEGATIVE_REFINE,
        size,
        response_format: 'url',
        seed: -1,
        watermark: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('[dish-in-venue-i2i] Seedream HTTP', res.status, txt.substring(0, 200));
      return { url: compositeUrl, composite_url: compositeUrl, refined: false, error: `seedream_${res.status}` };
    }
    const data = await res.json();
    const tempUrl = data.data?.[0]?.url || data.images?.[0]?.url || null;
    if (!tempUrl) {
      return { url: compositeUrl, composite_url: compositeUrl, refined: false, error: 'no_url_in_response' };
    }

    // Cache to our Supabase storage so the URL is stable for i2v dispatch
    const fetched = await fetch(tempUrl);
    if (!fetched.ok) {
      return { url: tempUrl, composite_url: compositeUrl, refined: true };
    }
    const buf = Buffer.from(await fetched.arrayBuffer());
    const sb = admin();
    const path = `composites-i2i/${params.postId}-${Date.now()}.jpg`;
    const { error: upErr } = await sb.storage
      .from('business-assets')
      .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
    if (upErr) {
      console.warn('[dish-in-venue-i2i] upload failed, returning provider URL:', upErr.message);
      return { url: tempUrl, composite_url: compositeUrl, refined: true };
    }
    const { data: pub } = sb.storage.from('business-assets').getPublicUrl(path);
    return { url: pub?.publicUrl || tempUrl, composite_url: compositeUrl, refined: true };
  } catch (err: any) {
    console.error('[dish-in-venue-i2i] threw:', err?.message);
    return { url: compositeUrl, composite_url: compositeUrl, refined: false, error: err?.message?.substring(0, 200) };
  }
}

/**
 * Claude vision QA on the refined still. Returns a verdict the caller uses
 * to decide whether to proceed with i2v (expensive) or stop now.
 *
 * Pass = the still convincingly looks like a real photographer captured a
 *        signature dish on a table in this specific restaurant.
 * Fail = obvious AI tells, floating dish, mismatched perspective, etc.
 *
 * Cost: ~€0.001 (Haiku vision call).
 */
export async function qaRefinedStillWithVision(
  refinedUrl: string,
): Promise<{ pass: boolean; score: number; verdict: string; issues: string[] }> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    // Without QA we can't gate — default to pass so caller can still proceed.
    return { pass: true, score: 5, verdict: 'no_vision_qa_available', issues: [] };
  }

  // Fetch and base64-encode the image because Claude requires base64 for
  // arbitrary URLs that aren't directly accessible from their fetchers.
  let imageData: { type: 'base64'; media_type: string; data: string } | null = null;
  try {
    const r = await fetch(refinedUrl);
    if (!r.ok) throw new Error(`fetch_${r.status}`);
    const ct = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    imageData = { type: 'base64', media_type: ct, data: buf.toString('base64') };
  } catch (e: any) {
    console.warn('[dish-in-venue-i2i] QA fetch failed:', e?.message);
    return { pass: true, score: 5, verdict: 'qa_fetch_failed', issues: [] };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: `You are a senior photo editor reviewing a generated still BEFORE it ships to a restaurant client's social feed. The still should look like a real professional photographer captured a signature dish naturally placed on a table inside the client's actual venue.

Score 1-10:
- 9-10: Indistinguishable from a real editorial restaurant photo. Dish sits on a real table at correct perspective and scale. Lighting and shadow match the venue. No AI tells.
- 7-8: Mostly convincing. Maybe one minor flaw (slight perspective inconsistency, soft seam). Acceptable to publish.
- 5-6: Visible compositing seam OR mismatched lighting OR slight scale issue. Borderline. Don't publish unless no alternative.
- 1-4: Obvious AI/composite tells. Floating dish, wrong perspective, doubled plate, ghost objects, AI-style food, mismatched scale. DO NOT PUBLISH.

Return STRICT JSON: {"score": <int 1-10>, "verdict": "<one-sentence>", "issues": ["<short issue>", ...]}

Pass threshold: score >= 7.`,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: imageData },
            { type: 'text', text: 'QA this still. Be strict — this is a paying client\'s feed.' },
          ],
        }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      return { pass: true, score: 5, verdict: 'qa_api_error', issues: [] };
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { pass: true, score: 5, verdict: 'qa_no_json', issues: [] };
    const parsed = JSON.parse(match[0]);
    const score = Math.max(1, Math.min(10, parseInt(String(parsed.score), 10) || 5));
    return {
      pass: score >= 7,
      score,
      verdict: String(parsed.verdict || ''),
      issues: Array.isArray(parsed.issues) ? parsed.issues.map((x: any) => String(x)).slice(0, 6) : [],
    };
  } catch (e: any) {
    console.warn('[dish-in-venue-i2i] QA threw:', e?.message);
    return { pass: true, score: 5, verdict: 'qa_threw', issues: [] };
  }
}

/**
 * Quick Claude vision check: is there a clearly visible person/guest
 * in this image? Used after addGuestToRefinedStill to confirm Stage 2
 * actually introduced a human (Seedream sometimes silently keeps the
 * scene empty even with imperative prompts).
 */
export async function detectGuestInStill(stillUrl: string): Promise<{ guestVisible: boolean; reason: string }> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return { guestVisible: false, reason: 'no_api_key' };
  let imageData: { type: 'base64'; media_type: string; data: string } | null = null;
  try {
    const r = await fetch(stillUrl);
    if (!r.ok) return { guestVisible: false, reason: `fetch_${r.status}` };
    const ct = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    imageData = { type: 'base64', media_type: ct, data: buf.toString('base64') };
  } catch (e: any) {
    return { guestVisible: false, reason: `fetch_threw:${e?.message?.substring(0, 40)}` };
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: 'You answer a single yes/no question about an image. Return STRICT JSON: {"guest_visible": true|false, "reason": "<one short sentence>"}. A "guest" means a clearly identifiable human person in the scene — body, head, hands, or face visible. A pair of empty chairs is NOT a guest. A reflection/shadow alone is NOT a guest.',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: imageData },
            { type: 'text', text: 'Is there a clearly visible human guest/person in this restaurant scene?' },
          ],
        }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { guestVisible: false, reason: `api_${res.status}` };
    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { guestVisible: false, reason: 'no_json' };
    const parsed = JSON.parse(match[0]);
    return {
      guestVisible: !!parsed.guest_visible,
      reason: String(parsed.reason || ''),
    };
  } catch (e: any) {
    return { guestVisible: false, reason: `threw:${e?.message?.substring(0, 40)}` };
  }
}
