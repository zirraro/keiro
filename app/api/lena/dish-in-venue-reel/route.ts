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

type MotionPreset = 'dolly_steam' | 'parallax' | 'chef_hand' | 'window_light' | 'guest_enjoying' | 'duo_sharing';

// Each preset is a FROZEN, ultra-specific i2v prompt designed to maximize
// fidelity to the still (i.e. the client's real dish + venue) and minimize
// any drift toward generic AI vibes. The structure is shared across presets:
//   - CONSTRAINT block (what MUST stay locked from frame 1)
//   - ACTION block (1 single subtle motion, no more)
//   - CINEMATOGRAPHY block (camera + lens + lighting + film stock)
//   - BANNED block (explicit anti-AI tells)
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
      'CAMERA: extremely subtle horizontal parallax, no more than 4% lateral drift over the duration, perfectly steady — like a steadicam holding breath. No dolly, NO zoom, NO rotation, NO tilt.',
      'ACTION: the natural daylight subtly shifts — as if a cloud has just passed and the warmth deepens by 5%. The shadows on the plate elongate a touch. NO human enters, NO objects move.',
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
      'LOCKED ELEMENTS: the plated dish at the lower-center of frame 1, the venue background (walls, doors, plants, chairs, ceiling, light fixtures), the table surface, the ambient color grade — everything stays exactly as in the input image.',
      'CAMERA: locked off, static tripod shot. No movement at all.',
      'ACTION: a single naturally-lit guest sits at the table behind the plate, blurred slightly out of focus (the plate stays sharp). Pick ONE of these diverse profiles RANDOMLY across reels: a mid-30s woman of maghrebi origin in a linen blouse, OR a 50yo afro-french man in a button-up shirt, OR a 28yo asian-french woman in a knit sweater, OR a 40yo south-european man in a navy polo. The guest lifts a fork (real hand, 5 fingers correctly rendered, visible pores, natural skin texture, slight asymmetry), takes a small bite of the dish, then sets the fork down. Eyes lower toward the plate in concentration, then a small genuine half-smile of satisfaction (NOT a posed commercial grin). The whole gesture takes 4 seconds.',
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
      'ACTION: two diverse guests sit across from each other at the table behind the dish. Pick a casting that varies post-to-post: e.g. mid-40s maghrebi-french couple, OR two friends one afro-french one asian-french early-30s, OR a 60yo south-european grandfather + his 30yo daughter. They lean slightly toward the dish, one hand reaches in with a serving fork to pick something up (real hand, 5 fingers rendered correctly, natural skin texture), they exchange a brief glance and small smile of shared pleasure. Eyes do NOT look at camera. Conversation is implied through body language — no exaggerated gestures.',
      'CINEMATOGRAPHY: Hasselblad X2D 80mm prime f/2.8 1/250s ISO 400, warm ambient pendant + window light, Portra 400 film grain, deep editorial color, both guests softly framed with the dish as the rooted center of focus.',
      'STYLE REFERENCE: Brendan George Ko convivial culinary editorial, Cereal Magazine — slow living, NOT a TV ad.',
      'SCALE: the plate occupies ~15-20% in the wider frame, each guest fills ~12-15% (chest up). Plate stays anchored center.',
      'BANNED: anyone facing camera, posed smile, raised glass clinking, ring-light catchlight, plastic skin, deformed hands, mismatched skin tone between the two guests (each must look photographically real, individually), zoom, fast pan, midjourney, CGI, 3D, cartoon, instagram filter. NO text or watermark.',
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
  const duration = Math.max(5, Math.min(10, Number(body.duration) || 5));
  const aspect: 'square' | 'story' = body.aspect === 'square' ? 'square' : 'story';
  const motion: MotionPreset = (['dolly_steam', 'parallax', 'chef_hand', 'window_light', 'guest_enjoying', 'duo_sharing'].includes(body.motion) ? body.motion : 'dolly_steam') as MotionPreset;
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
  const prompt = preset.prompt;
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
    publishResult,
    poll: `/api/seedream/i2v?taskId=${i2vRes.taskId}`,
  });
}
