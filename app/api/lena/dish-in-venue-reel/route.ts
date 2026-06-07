/**
 * POST /api/lena/dish-in-venue-reel
 *
 * Génère un reel ultra-pro qui combine :
 *   - une photo de plat fournie par le client (dishUrl)
 *   - une photo d'ambiance fournie par le client (venueUrl)
 *
 * Pipeline :
 *   1. QA des inputs (URLs joignables, dimensions raisonnables, format image)
 *   2. compositeDishOnVenue() → still 1080×1920 ou 1920×1920
 *   3. QA du still (taille de fichier, dimensions, contraste basique)
 *   4. Prompt i2v ultra-cadré (preset au choix : dolly_steam | parallax | chef_hand | window_light)
 *   5. Délègue à /api/seedream/i2v qui gère Seedance/Kling
 *   6. Retourne { stillUrl, taskId, provider } — le client poll i2v jusqu'au videoUrl
 *
 * Pourquoi un endpoint dédié plutôt qu'un toggle sur /i2v existant :
 *   - garde-fous d'entrée (les 2 images doivent venir du client, pas
 *     d'une génération IA générique)
 *   - prompt presets verrouillés (l'utilisateur ne peut PAS injecter un
 *     prompt libre qui ferait dériver l'i2v vers un look IA)
 *   - traçabilité dans agent_logs (post_id, source images, preset choisi)
 *
 * Auth: cookie session (admin ou owner du post).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { buildDishInVenueRefinedStill, addGuestToRefinedStill, qaRefinedStillWithVision, detectGuestInStill } from '@/lib/visuals/dish-in-venue-i2i';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

type MotionPreset = 'dolly_steam' | 'parallax' | 'chef_hand' | 'window_light' | 'guest_enjoying' | 'duo_sharing' | 'chef_kitchen';

// Each preset is a FROZEN, ultra-specific i2v prompt designed to maximize
// fidelity to the still (i.e. the client's real dish + venue) and minimize
// any drift toward generic AI vibes. The structure is shared across presets:
//   - CONSTRAINT block (what MUST stay locked from frame 1)
//   - ACTION block (1 single subtle motion, no more)
//   - CINEMATOGRAPHY block (camera + lens + lighting + film stock)
//   - BANNED block (explicit anti-AI tells)
// 2026-06-07 — Global rules prepended to every motion preset. Founder
// caught the last reel had AI-generated text and unjustified transitions:
// "attention aux reels et video les textes generes direct dedant meme si
// quelques mots ca peut etre pas beau don a eviter et je t'ai demandé le
// plus naturel possible pour faire comme si c'etait un photographe stp
// les transitions ok mais justifiees et surtout pertinent". These rules
// are absolute and apply to every preset.
const GLOBAL_REEL_RULES = [
  'ABSOLUTE RULE 1 — ZERO text in the video: no captions, no titles, no labels, no overlays, no signage with text, no logos with readable text, no menu names, no street signs with text, no watermark, no subtitle. Not a single letter. If Seedance feels the urge to add a word, it MUST NOT.',
  // 2026-06-07 — Founder clarification: cuts/transitions are NOT banned
  // outright, only when they break the narrative. A well-justified cut
  // (e.g. matched-on-action close-up of the dish after a wide shot) is
  // welcome. What we ban is JARRING transitions that betray AI animation.
  'RULE 2 — Cuts only if narratively justified. Default = single continuous shot. Allowed: a single matched-on-action cut from wide to close-up of the SAME dish/subject; a focus pull that reads as a deliberate edit. BANNED: fade-to-black, dissolve, whip-pan transition, glitch effect, jump cut to a different scene, anything that screams motion-graphics or AI tells. If unsure, stay on one continuous shot.',
  'ABSOLUTE RULE 3 — Photographer realism: this must look like a frame from a real Vogue/Cereal/Apartamento editorial, not a video edit. No fancy effects, no motion graphics, no AI animation tells.',
].join(' ');

const MOTION_PRESETS: Record<MotionPreset, { label: string; prompt: string; recommendedFor: string }> = {
  dolly_steam: {
    label: 'Dolly slow + vapeur',
    recommendedFor: 'plat chaud (entrée, plat, café)',
    prompt: [
      'LOCKED ELEMENTS (must stay identical to frame 1): the plated dish in the lower center, the venue background (walls, tables, decor) exactly as in the input image, the table surface and its color/texture, ambient color grade.',
      'CAMERA: very slow dolly-in moving forward toward the plated dish, no more than 8% closer by the end. Absolutely NO zoom, NO rotation, NO tilt, NO whip-pan. Steady, deliberate, contemplative motion.',
      'ACTION: gentle white steam rises slowly from the dish (subtle, not theatrical), 2-3 thin wisps that drift up and dissipate naturally. Very faint warm light flicker on the plate as if a candle is just out of frame to the right. No human enters the scene.',
      'CINEMATOGRAPHY: shot on a Leica M11 with a 50mm Summilux f/2 prime lens at 1/250s ISO 400, Kodak Portra 400 film stock aesthetic, warm tungsten + golden-hour mixed lighting, shallow depth of field, subtle 35mm film grain.',
      'STYLE REFERENCE: Vogue Local culinary editorial, Cereal Magazine intimacy, NOT a commercial food ad.',
      'BANNED (must not appear): zoom, rotation, lens flare, neon glow, ring light, plastic skin if any human, magenta/cyan saturation, motion blur from fast pans, midjourney style, CGI render, 3D look, cartoon, illustration. NO text, NO words, NO logo, NO watermark, NO captions appearing in the video.',
    ].join(' '),
  },
  parallax: {
    label: 'Parallaxe légère + lumière',
    recommendedFor: 'plat froid (dessert, salade) ou installation propre',
    prompt: [
      'LOCKED ELEMENTS (must stay identical to frame 1): the plated dish, the venue background, every object on the table, the wall texture and color, the position of every element in frame.',
      'CAMERA: continuous slow horizontal parallax 8-10% lateral drift over the duration combined with a 4% push-in by the last second. Smooth steadicam, no jitter. No rotation, no whip, no zoom.',
      'ACTION: the natural daylight noticeably shifts over the clip — the warm tone deepens by 10%, shadows lengthen slightly, a single thin wisp of steam may rise from the dish near the start. NO human enters, NO objects move, but the LIGHT and ATMOSPHERE evolve so the frame breathes.',
      'CINEMATOGRAPHY: Hasselblad X2D with an 80mm prime f/2.8, soft window light from the side (left or right of frame, NOT front), Portra 400 grain, deep micro-contrast on the dish, ambient occlusion under the plate.',
      'STYLE REFERENCE: Apartamento magazine, Kinfolk slow-living photography, NOT instagram filter, NOT VSCO.',
      'BANNED: zoom, rotation, lens flare, glow halo, ring-light catchlight if any reflective surface, magenta cyan, motion blur, midjourney style, CGI, 3D render, cartoon, illustration, instagram filter, vsco filter, hdr glow. NO text in the video.',
    ].join(' '),
  },
  chef_hand: {
    label: 'Main du chef qui finit le dressage',
    recommendedFor: 'plat signature, démo savoir-faire',
    prompt: [
      'LOCKED ELEMENTS: the plated dish, the venue background, the table, the ambient color grade — everything visible in frame 1 must remain exactly in place throughout.',
      'CAMERA: locked off, no movement at all. Static tripod shot.',
      'ACTION: a single hand enters frame from the left (a real, naturally lit human hand with realistic skin texture, visible pores, slight asymmetry, 5 fingers correctly rendered), holding a small fresh herb sprig or a pinch of sea salt, places it precisely on the dish (1.5 seconds), then withdraws back out of frame to the left. The whole gesture takes less than 3 seconds. The plate barely moves. Then the scene holds static for the remainder.',
      'CINEMATOGRAPHY: Leica M11 50mm Summilux at f/2 1/500s ISO 400, single warm window-light source from upper right, Portra 400 grain, very shallow depth of field with the dish in sharp focus and the hand softly in focus, ambient kitchen warmth.',
      'STYLE REFERENCE: Cass Bird intimate culinary documentary, Brendan George Ko food editorial, NOT commercial food advertising, NOT MasterChef-style glossy.',
      'BANNED: more than one hand, hand with deformed/extra fingers, plastic doll skin, ring-light catchlight on the skin, neon glow, fast camera moves, zoom, rotation, midjourney style, CGI, 3D, cartoon, instagram filter glow, hdr. NO text or watermark.',
    ].join(' '),
  },
  window_light: {
    label: 'Lumière de fenêtre qui évolue',
    recommendedFor: 'ambiance, slow-living, plat statique',
    prompt: [
      'LOCKED ELEMENTS: dish, venue, table, every object — all stay exactly where they are in frame 1. No movement of any object, no human entering.',
      'CAMERA: imperceptible push-in, no more than 3% closer by the end. Mostly static.',
      'ACTION: the warm window light moves across the scene as if 20 real minutes have passed in 5 seconds — golden warmth deepens, shadows lengthen subtly, dust motes catch a beam of light. The dish does not change, only the light quality and shadow softness shift.',
      'CINEMATOGRAPHY: Hasselblad X2D 80mm prime f/2.8 1/200s ISO 400, single window-light source, Portra 400 grain, deep editorial color science, gentle vignette but NO digital vignette overlay — natural lens fall-off only.',
      'STYLE REFERENCE: Sebastiao Salgado natural light documentary, Steve McCurry portrait warmth applied to a still life, NOT commercial.',
      'BANNED: any zoom, any rotation, any movement of objects, any human appearing, lens flare, halo glow, instagram filter, vsco filter, hdr, midjourney, stable diffusion default, CGI, 3D render, cartoon. NO text, NO words, NO watermark.',
    ].join(' '),
  },
  // ─── PEOPLE INTERACTION PRESETS (founder ask 2026-06-06) ──────
  // Risk profile: higher. Adding humans = more chances of AI tells (deformed
  // hands, posed smile, plastic skin). We compensate with strict casting
  // instructions, very limited motion, and post-i2v QA on the result.
  guest_enjoying: {
    label: 'Client savoure le plat',
    recommendedFor: 'plat signature avec ambiance vivante',
    prompt: [
      'LOCKED ELEMENTS: the plated dish, the venue, the table, the guest already in frame 1 (same person identity, same clothing).',
      'CAMERA: smooth slow continuous push-in toward the table, ending ~6-7% closer by the last second. Rack-focus shift mid-clip: starts with the plate tack-sharp and guest softly blurred, then 60% of the way through the focus eases toward the guest face while the plate stays readable in the foreground. No zoom, no rotation, no whip pan, no handheld shake — silky dolly only.',
      'ACTION (CONTEXT-AWARE, emotionally readable over 5-7 seconds): the guest progressively transitions from anticipation → tasting → satisfaction. (1) First 2s: eyes glance up briefly with a curious half-smile, then drop to the plate as a slow exhale of anticipation parts the lips. (2) Middle 3s: ONE plausible interaction — IF a fork is visible → they lift food halfway to the lips, pause, then bite; ELSE IF a glass is visible → they raise it slowly past frame; ELSE → they lean forward another 1° and slowly bring one hand toward the rim of the plate as if about to pick up cutlery. (3) Last 2s: head tilts a fraction, eyes close briefly in satisfaction, smile broadens by 10%. Every micro-movement subtle and human, never theatrical. Eyes NEVER look at camera.',
      'STRICTLY FORBIDDEN ACTIONS (these betray AI insertion of objects that are not in the input): blowing candles unless candles are visibly lit in frame 1, clinking glasses, pouring wine from a bottle, smelling a flower unless flowers are in frame 1, holding a phone, taking a selfie, any gesture that requires an object NOT visible in the input.',
      'CINEMATOGRAPHY: Leica M11 50mm Summilux at f/2 1/500s ISO 400, golden-hour ambient lighting from the existing window, Portra 400 grain, very shallow depth of field with the dish in sharp focus and the guest softly blurred, natural ambient occlusion under the plate.',
      'STYLE REFERENCE: Mary Ellen Mark intimate documentary portrait, Cass Bird candid editorial — NOT commercial food advertising, NOT a glossy ad smile.',
      'SCALE: the plate continues to occupy 18-25% of frame, the guest fills upper-third of frame from chest to chin (face partly out of frame is OK and preferred).',
      'BANNED: more than one person, posed front-facing grin, ring-light catchlight in the eyes, plastic doll skin, deformed hands, extra fingers, missing fingers, anyone holding a phone, anyone looking at camera, zoom, rotation, fast moves, midjourney style, CGI, 3D render, cartoon, instagram filter glow, hdr. NO text or watermark.',
    ].join(' '),
  },
  duo_sharing: {
    label: 'Deux personnes partagent',
    recommendedFor: 'plat à partager, ambiance conviviale',
    prompt: [
      'LOCKED ELEMENTS: the plated dish at the center of the table in frame 1, the venue (walls, decor, lighting), the table surface, ambient color — all stay identical.',
      'CAMERA: slow gentle pull-back (~6% wider by the end) to reveal the social context. No rotation, no whip pan.',
      'ACTION (CONTEXT-AWARE — only what is plausibly visible in frame 1): the two guests (already in the input image) share ONE small moment over 3-4 seconds — they lean slightly toward the dish, exchange a brief warm glance, one of them gestures softly with an open hand toward the plate. IF a serving fork or shared utensil is in the scene → one guest picks something off the plate; ELSE → both keep hands resting on the table near the plate. Eyes do NOT look at camera. Heads visible, NOT cropped.',
      'STRICTLY FORBIDDEN ACTIONS: clinking glasses (unless full glasses are visible), blowing candles (unless lit candles are present), passing a phone, taking a photo of the dish, any gesture involving objects NOT visible in the input image.',
      'CINEMATOGRAPHY: Hasselblad X2D 80mm prime f/2.8 1/250s ISO 400, warm ambient pendant + window light, Portra 400 film grain, deep editorial color, both guests softly framed with the dish as the rooted center of focus.',
      'STYLE REFERENCE: Brendan George Ko convivial culinary editorial, Cereal Magazine — slow living, NOT a TV ad.',
      'SCALE: the plate occupies ~15-20% in the wider frame, each guest fills ~12-15% (chest up). Plate stays anchored center. Tables and chairs MUST NOT visually overlap or merge.',
      'BANNED: anyone facing camera, posed grin, sad expressions, raised glass clinking, ring-light catchlight, plastic skin, deformed hands, mismatched skin tone between the two guests (each must look photographically real, individually), tables merging with chairs, oversized furniture, zoom, fast pan, midjourney, CGI, 3D, cartoon, instagram filter. NO text or watermark.',
    ].join(' '),
  },
  // 2026-06-06 — Founder ask: "peu etre meme un chef en cuisine avec le
  // plat car... une cuisine est rarement vu donc elle peut etre inventée
  // pour interaction/presentation du plat attention a garder le standing".
  // The chef_kitchen preset PIVOTS the scene: instead of the dish in the
  // dining room, we move it to a kitchen pass with the chef plating /
  // garnishing. This is the only preset that intentionally drifts the
  // venue (because the venue uploaded is the dining room, not the kitchen)
  // — the i2v is allowed to invent a kitchen consistent with the
  // restaurant's standing tier (gastronomic vs casual vs fastfood).
  // The `standing` tier is passed in by the caller (or defaulted to
  // `casual`) based on business_type analysis.
  chef_kitchen: {
    label: 'Chef en cuisine + plat',
    recommendedFor: 'présentation savoir-faire, démo gestes pro',
    prompt: [
      'Scene shift to a professional kitchen pass during service. The dish from the input image is now being garnished/plated by the chef on a stainless-steel pass counter.',
      'LOCKED: the exact dish (same plate shape, same food, same garnish, same color, same composition — must be identifiable as the SAME signature dish from the input image).',
      'INVENT a kitchen that matches the restaurant\'s standing. STANDING TIER GUIDANCE (caller passes a tier hint — default = casual_bistro):',
      '— gastronomic: pristine stainless pass, warm under-pass tungsten light, wood prep boards, copper pans, hanging tongs, herbs in small ceramic bowls, quiet focus, white linen apron, clipped sleeves;',
      '— casual_bistro: open kitchen with a wood counter pass, brass utensils, chalkboard menu glimpsed in background, denim apron over a white t-shirt;',
      '— fastfood: stainless industrial counter, bright neutral LED light, plastic squeeze bottles, paper-lined trays, branded apron, fast tempo;',
      '— café/boulangerie: marble counter, wooden boards, copper espresso machine glow, flour dust on hand backs, denim apron with linen tea-towel tucked at waist.',
      'CAMERA: locked off, slight high angle ~30° over the pass, plate in lower-third sharp focus, chef\'s torso and hands in mid-ground softly in focus.',
      'ACTION: chef\'s hand enters from the right with tweezers or a finger-pinch, places a single fresh herb (or sauce dot, or zest curl) precisely on the plate over 2 seconds, then withdraws. Body language is calm, focused, professional. NO sweeping arm gesture, NO theatrical flair, NO face visible (head can be partly out of frame at the top — only torso + arms + hands).',
      'CINEMATOGRAPHY: Leica M11 50mm f/2 1/400s ISO 800, mixed tungsten + LED kitchen light, Portra 400 grain, shallow DOF on the plate.',
      'STYLE REFERENCE: Brendan George Ko on-the-pass culinary editorial, Eater magazine kitchen reportage. NOT MasterChef glossy.',
      'BANNED: branded chef hat unless casual_bistro/gastronomic, posed smile, chef looking at camera, dirty kitchen, flames bursting, smoke effects, neon, deformed hands, extra fingers, midjourney style, CGI, 3D, cartoon, illustration. NO text, NO watermark, NO restaurant logo visible.',
    ].join(' '),
  },
};

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Lightweight QA on a client-supplied image URL :
 *   - reachable HTTP 200
 *   - content-type is image/*
 *   - content-length between 30KB and 12MB (reject tiny thumbs / huge raws)
 */
async function qaImageInput(url: string): Promise<{ ok: boolean; reason?: string; size?: number }> {
  try {
    const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    if (!head.ok) return { ok: false, reason: `unreachable_${head.status}` };
    const ct = head.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return { ok: false, reason: `not_image:${ct.substring(0, 40)}` };
    const len = parseInt(head.headers.get('content-length') || '0', 10);
    if (len && len < 30 * 1024) return { ok: false, reason: 'too_small_<30kb' };
    if (len && len > 12 * 1024 * 1024) return { ok: false, reason: 'too_large_>12mb' };
    return { ok: true, size: len };
  } catch (e: any) {
    return { ok: false, reason: `qa_threw:${e?.message?.substring(0, 60)}` };
  }
}

export async function POST(req: NextRequest) {
  // Auth: session cookie (user UI) OR Bearer CRON_SECRET (admin/backend test).
  // When using Bearer CRON_SECRET, the caller must pass `userId` in the body
  // — used for credit/quota accounting + agent_logs ownership.
  const bearer = req.headers.get('authorization') || '';
  const useCronAuth = bearer === `Bearer ${process.env.CRON_SECRET}`;
  let userId: string | null = null;
  if (useCronAuth) {
    const probe = await req.clone().json().catch(() => null);
    userId = probe?.userId || null;
  } else {
    const { user } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401 });
    }
    userId = user.id;
  }
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'user_id_required_for_cron_auth' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });

  const dishUrl = String(body.dishUrl || '').trim();
  const venueUrl = String(body.venueUrl || '').trim();
  const postId = String(body.postId || `lena-dvr-${Date.now()}`).trim();
  // 2026-06-07 — Default duration bumped 5→8s after founder feedback:
  // 5s is too tight for a TikTok reel — the action barely happens.
  // 8s gives breathing room for hook + reaction without exploding cost
  // (Seedance bills per second; 8s vs 5s = +€0.06 per reel).
  const duration = Math.max(5, Math.min(10, Number(body.duration) || 8));
  const aspect: 'square' | 'story' = body.aspect === 'square' ? 'square' : 'story';
  const motion: MotionPreset = (['dolly_steam', 'parallax', 'chef_hand', 'window_light', 'guest_enjoying', 'duo_sharing', 'chef_kitchen'].includes(body.motion) ? body.motion : 'dolly_steam') as MotionPreset;
  // maxStillRetries: how many i2i refinement attempts before giving up.
  // Default = 1 (cost-safe for client UI flow). When testing manually with
  // CRON auth, pass up to 3 to maximize chance of a passing still per call.
  const maxStillRetries = Math.max(1, Math.min(3, Number(body.maxStillRetries) || 1));
  // autoPublishTiktok: when true and QA passes, publish directly to TikTok.
  // Only honored under CRON auth — UI users get the URL back and can decide.
  const autoPublishTiktok = useCronAuth && body.autoPublishTiktok === true;
  const tiktokCaption = String(body.tiktokCaption || '').trim();

  if (!dishUrl || !venueUrl) {
    return NextResponse.json({ ok: false, error: 'dishUrl_and_venueUrl_required' }, { status: 400 });
  }

  // ─── Input QA ──────────────────────────────────────────────────
  const [dishQa, venueQa] = await Promise.all([qaImageInput(dishUrl), qaImageInput(venueUrl)]);
  if (!dishQa.ok || !venueQa.ok) {
    return NextResponse.json({
      ok: false,
      error: 'input_qa_failed',
      dish: dishQa,
      venue: venueQa,
    }, { status: 400 });
  }

  // ─── Refined still loop ───────────────────────────────────────
  // Each iteration: composite + Seedream i2i refinement + Claude vision QA.
  // We stop on the first passing still (score >= 7) or after maxStillRetries.
  const stillAttempts: any[] = [];
  let passingStillUrl: string | null = null;
  let lastBuild: any = null;
  let lastQa: any = null;
  const wantsGuest = motion === 'guest_enjoying' || motion === 'duo_sharing';
  for (let attempt = 1; attempt <= maxStillRetries; attempt++) {
    // Stage 1 — composite + dish-in-venue refinement
    const build = await buildDishInVenueRefinedStill({
      venueUrl,
      dishUrl,
      postId: `${postId}-att${attempt}`,
      aspect,
    });
    lastBuild = build;
    if (!build.url) {
      stillAttempts.push({ attempt, error: build.error || 'no_url' });
      continue;
    }

    // Stage 2 — add a guest if the motion preset requires people
    let stillForQa = build.url;
    let guestAdded = false;
    let guestVerdict: any = null;
    if (wantsGuest) {
      const stage2 = await addGuestToRefinedStill({
        refinedStillUrl: build.url,
        postId: `${postId}-att${attempt}-guest`,
        aspect,
        businessType: body.businessType ? String(body.businessType).slice(0, 100) : undefined,
        audienceHint: body.audienceHint ? String(body.audienceHint).slice(0, 200) : undefined,
        eventHint: body.eventHint ? String(body.eventHint).slice(0, 200) : undefined,
      });
      stillForQa = stage2.url;
      // Verify visually that a guest actually appeared. Seedream sometimes
      // returns the same scene unchanged even with imperative prompts.
      const guestCheck = await detectGuestInStill(stillForQa);
      guestAdded = guestCheck.guestVisible;
      guestVerdict = guestCheck;
      if (!guestAdded) {
        stillAttempts.push({ attempt, stillUrl: stillForQa, refined: build.refined, guestAdded: false, guestVerdict, skipped_qa: 'no_guest_in_still' });
        continue; // try another attempt — don't waste i2v on a guest-less still for a guest preset
      }
    }

    const qa = await qaRefinedStillWithVision(stillForQa);
    lastQa = qa;
    stillAttempts.push({ attempt, stillUrl: stillForQa, refined: build.refined, guestAdded, guestVerdict, qa });
    if (qa.pass) {
      passingStillUrl = stillForQa;
      break;
    }
  }

  if (!passingStillUrl) {
    return NextResponse.json({
      ok: false,
      error: 'still_qa_failed_after_retries',
      attempts: stillAttempts,
      lastBuild,
      lastQa,
      hint: 'Try a venue photo cropped on a single foreground table, or a dish photo with neutral background.',
    }, { status: 422 });
  }

  // ─── i2v dispatch ─────────────────────────────────────────────
  const preset = MOTION_PRESETS[motion];
  // Prepend the absolute rules (no text, single shot, photographer realism)
  // so they outrank any soft hint Seedance might infer from the preset.
  const prompt = `${GLOBAL_REEL_RULES} ${preset.prompt}`;
  const siteBase = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  let i2vRes: any;
  try {
    const r = await fetch(`${siteBase}/api/seedream/i2v`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(useCronAuth
          ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
          : { cookie: req.headers.get('cookie') || '' }),
      },
      body: JSON.stringify({
        imageUrl: passingStillUrl,
        prompt,
        duration,
        userId,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    i2vRes = await r.json().catch(() => null);
    if (!r.ok || !i2vRes?.ok) {
      return NextResponse.json({
        ok: false,
        error: 'i2v_dispatch_failed',
        stillUrl: passingStillUrl,
        attempts: stillAttempts,
        downstream: i2vRes,
      }, { status: 502 });
    }
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: `i2v_fetch_threw:${e?.message?.substring(0, 80)}`,
      stillUrl: passingStillUrl,
      attempts: stillAttempts,
    }, { status: 502 });
  }

  // ─── Log dispatch ─────────────────────────────────────────────
  const sb = admin();
  try {
    await sb.from('agent_logs').insert({
      agent: 'content',
      action: 'lena_dish_in_venue_reel',
      status: 'pending',
      user_id: userId,
      data: {
        post_id: postId,
        motion_preset: motion,
        dish_url: dishUrl,
        venue_url: venueUrl,
        still_url: passingStillUrl,
        still_attempts: stillAttempts.length,
        task_id: i2vRes.taskId,
        provider: i2vRes._p || i2vRes.provider,
        duration,
        aspect,
      },
      created_at: new Date().toISOString(),
    });
  } catch {}

  // ─── Optional: wait for video + publish to TikTok ─────────────
  let videoUrl: string | null = null;
  let publishResult: any = null;
  let audioMuxed: any = null;
  let reelQa: any = null;
  if (autoPublishTiktok) {
    // Poll up to 120s for video completion. Seedance typically returns in 30-60s.
    const pollDeadline = Date.now() + 120_000;
    while (Date.now() < pollDeadline) {
      await new Promise((r) => setTimeout(r, 6_000));
      try {
        const pr = await fetch(`${siteBase}/api/seedream/i2v`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({ taskId: i2vRes.taskId, userId }),
          signal: AbortSignal.timeout(15_000),
        });
        const pdata = await pr.json().catch(() => null);
        if (pdata?.status === 'completed' && pdata?.videoUrl) {
          videoUrl = pdata.videoUrl;
          break;
        }
        if (pdata?.status === 'failed') break;
      } catch { /* keep polling */ }
    }

    // 2026-06-06 — Audio layer. OPT-IN via body.withAudio === true.
    if (videoUrl && body.withAudio === true) {
      try {
        const { getClientLanguage } = await import('@/lib/agents/client-language');
        const lang = await admin().from('business_dossiers')
          .select('communication_language').eq('user_id', userId).maybeSingle();
        const langCode = ((lang.data as any)?.communication_language || 'fr').toLowerCase().slice(0, 2);

        // 1. Voice — only if language supported
        let voiceUrl: string | null = null;
        const VOICE_SUPPORTED = new Set(['fr', 'en', 'es', 'de', 'it', 'pt']);
        if (VOICE_SUPPORTED.has(langCode) && body.voiceScript) {
          try {
            const { generateAudioWithElevenLabs, DEFAULT_VOICE_ID } = await import('@/lib/audio/elevenlabs-tts');
            const script = String(body.voiceScript).slice(0, 200);
            voiceUrl = await generateAudioWithElevenLabs(script, DEFAULT_VOICE_ID, langCode);
          } catch (e: any) {
            console.warn('[lena-dvr] voiceover failed:', e?.message);
          }
        }

        // 2. Music — Pixabay royalty-free, matched by motion preset
        const moodByMotion: Record<string, any> = {
          dolly_steam: 'ambient_warm',
          parallax: 'calm_minimal',
          window_light: 'soft_ambient_slow',
          chef_hand: 'energetic_kitchen',
          guest_enjoying: 'warm_jazz_intimate',
          duo_sharing: 'warm_jazz_intimate',
          chef_kitchen: 'energetic_kitchen',
        };
        let musicUrl: string | null = null;
        try {
          const { pickPixabayMusic } = await import('@/lib/audio/pixabay-music');
          const pick = await pickPixabayMusic({
            mood: moodByMotion[motion] || 'ambient_warm',
            minDurationSec: duration,
          });
          if (pick?.url) musicUrl = pick.url;
        } catch (e: any) {
          console.warn('[lena-dvr] music pick failed:', e?.message);
        }

        // 3. Mux — if either voice or music landed
        if (voiceUrl || musicUrl) {
          const { muxReelAudio } = await import('@/lib/audio/reel-audio-mux');
          const mix = await muxReelAudio({
            videoUrl,
            voiceUrl,
            musicUrl,
            postId,
            durationSec: duration,
          });
          if (mix.url && mix.url !== videoUrl) {
            videoUrl = mix.url;
            audioMuxed = { withVoice: mix.withVoice, withMusic: mix.withMusic, lang: langCode };
            console.log(`[lena-dvr] ✅ audio muxed: voice=${mix.withVoice} music=${mix.withMusic} lang=${langCode}`);
          } else if (mix.fallback) {
            audioMuxed = { fallback: mix.fallback };
          }
        }
      } catch (e: any) {
        console.warn('[lena-dvr] audio pipeline threw:', e?.message);
      }
    }

    // 2026-06-07 — Reel-level QA on the actual VIDEO (3 keyframes). The
    // still-only QA can score 9/10 and still ship a static, dead-looking
    // reel. reviewGeneratedReel extracts early/mid/late frames and asks
    // Sonnet whether the action makes sense and the subject identity
    // holds. hard_fail → don't publish.
    if (videoUrl) {
      try {
        const { reviewGeneratedReel } = await import('@/lib/visuals/reel-qa');
        reelQa = await reviewGeneratedReel({
          videoUrl,
          postId,
          visualBrief: body.tiktokCaption || preset.recommendedFor,
          businessType: body.businessType ? String(body.businessType) : undefined,
        });
        console.log(`[lena-dvr] reel QA: ${reelQa.verdict} — ${reelQa.issue || 'ok'}`);
        if (reelQa.verdict === 'hard_fail') {
          // Block publish — record the reason and surface in response.
          videoUrl = null;
        }
      } catch (e: any) {
        console.warn('[lena-dvr] reel QA threw (non-fatal):', e?.message);
      }
    }

    if (videoUrl) {
      // Create content_calendar row + publish to TikTok via existing pipeline.
      // We use the existing publish_single action so all production guards run.
      try {
        // content_calendar columns audited 2026-06-05: no `source` column,
        // hashtags is jsonb (not text[]).
        const { data: postRow } = await sb.from('content_calendar').insert({
          user_id: userId,
          platform: 'tiktok',
          format: 'reel',
          status: 'approved',
          hook: tiktokCaption.split('\n')[0]?.substring(0, 100) || `Notre signature dans notre salle`,
          caption: tiktokCaption || `Notre signature, servie dans notre salle. Un pas chez nous, une autre dimension.`,
          visual_url: passingStillUrl,
          video_url: videoUrl,
          scheduled_date: new Date().toISOString().slice(0, 10),
          scheduled_time: new Date().toISOString().slice(11, 19),
          hashtags: ['#keiroai', '#restaurant', '#signaturedish', '#foodlover', '#cheflife'],
          updated_at: new Date().toISOString(),
        }).select('id').single();
        if (postRow?.id) {
          const pubR = await fetch(`${siteBase}/api/agents/content?user_id=${userId}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              authorization: `Bearer ${process.env.CRON_SECRET}`,
            },
            body: JSON.stringify({ action: 'publish_single', postId: postRow.id }),
            signal: AbortSignal.timeout(180_000),
          });
          publishResult = await pubR.json().catch(() => ({ ok: false, error: 'publish_response_unparsable' }));
          publishResult.contentCalendarId = postRow.id;
        } else {
          publishResult = { ok: false, error: 'content_calendar_insert_failed' };
        }
      } catch (e: any) {
        publishResult = { ok: false, error: `publish_threw:${e?.message?.substring(0, 80)}` };
      }
    }
  }

  return NextResponse.json({
    ok: true,
    stillUrl: passingStillUrl,
    stillAttempts,
    taskId: i2vRes.taskId,
    provider: i2vRes._p || i2vRes.provider,
    motion,
    motionLabel: preset.label,
    motionRecommendedFor: preset.recommendedFor,
    duration,
    aspect,
    videoUrl,
    audioMuxed,
    reelQa,
    publishResult,
    poll: `/api/seedream/i2v?taskId=${i2vRes.taskId}`,
  });
}
