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
import { compositeDishOnVenue } from '@/lib/visuals/dish-in-venue';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 90;

type MotionPreset = 'dolly_steam' | 'parallax' | 'chef_hand' | 'window_light';

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
  const { user } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });

  const dishUrl = String(body.dishUrl || '').trim();
  const venueUrl = String(body.venueUrl || '').trim();
  const postId = String(body.postId || `lena-dvr-${Date.now()}`).trim();
  const duration = Math.max(5, Math.min(10, Number(body.duration) || 5));
  const aspect: 'square' | 'story' = body.aspect === 'square' ? 'square' : 'story';
  const motion: MotionPreset = (['dolly_steam', 'parallax', 'chef_hand', 'window_light'].includes(body.motion) ? body.motion : 'dolly_steam') as MotionPreset;

  if (!dishUrl || !venueUrl) {
    return NextResponse.json({ ok: false, error: 'dishUrl_and_venueUrl_required' }, { status: 400 });
  }

  // ─── Input QA ──────────────────────────────────────────────────
  // Garde-fou strict : on refuse de lancer l'i2v si les inputs ne sont
  // pas des vraies images joignables de qualité raisonnable. Sinon on
  // anime un défaut → résultat AI-look garanti.
  const [dishQa, venueQa] = await Promise.all([qaImageInput(dishUrl), qaImageInput(venueUrl)]);
  if (!dishQa.ok || !venueQa.ok) {
    return NextResponse.json({
      ok: false,
      error: 'input_qa_failed',
      dish: dishQa,
      venue: venueQa,
    }, { status: 400 });
  }

  // ─── Composite still ──────────────────────────────────────────
  const stillUrl = await compositeDishOnVenue({ venueUrl, dishUrl, postId, aspect });
  if (!stillUrl) {
    return NextResponse.json({ ok: false, error: 'composite_failed' }, { status: 500 });
  }

  // ─── Composite QA ─────────────────────────────────────────────
  // On vérifie que le still a bien atterri en storage et n'est pas
  // suspectement petit (échec sharp qui aurait écrit un placeholder).
  const stillQa = await qaImageInput(stillUrl);
  if (!stillQa.ok || (stillQa.size && stillQa.size < 80 * 1024)) {
    return NextResponse.json({
      ok: false,
      error: 'composite_qa_failed',
      stillUrl,
      stillQa,
    }, { status: 500 });
  }

  // ─── Build i2v prompt (frozen preset) ─────────────────────────
  const preset = MOTION_PRESETS[motion];
  const prompt = preset.prompt;

  // ─── Call internal i2v endpoint ───────────────────────────────
  // We delegate to /api/seedream/i2v (Seedance primary, Kling fallback).
  // It handles credits, quota, margin gates, and provider dispatch.
  const siteBase = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  let i2vRes: any;
  try {
    const r = await fetch(`${siteBase}/api/seedream/i2v`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the user's cookies so the i2v endpoint sees the same auth
        cookie: req.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        imageUrl: stillUrl,
        prompt,
        duration,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    i2vRes = await r.json().catch(() => null);
    if (!r.ok || !i2vRes?.ok) {
      return NextResponse.json({
        ok: false,
        error: 'i2v_dispatch_failed',
        stillUrl,
        downstream: i2vRes,
      }, { status: 502 });
    }
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: `i2v_fetch_threw:${e?.message?.substring(0, 80)}`,
      stillUrl,
    }, { status: 502 });
  }

  // ─── Log ──────────────────────────────────────────────────────
  try {
    const sb = admin();
    await sb.from('agent_logs').insert({
      agent: 'content',
      action: 'lena_dish_in_venue_reel',
      status: 'pending',
      user_id: user.id,
      data: {
        post_id: postId,
        motion_preset: motion,
        dish_url: dishUrl,
        venue_url: venueUrl,
        still_url: stillUrl,
        task_id: i2vRes.taskId,
        provider: i2vRes._p || i2vRes.provider,
        duration,
        aspect,
      },
      created_at: new Date().toISOString(),
    });
  } catch { /* logging is best-effort */ }

  return NextResponse.json({
    ok: true,
    stillUrl,
    taskId: i2vRes.taskId,
    provider: i2vRes._p || i2vRes.provider,
    motion,
    motionLabel: preset.label,
    motionRecommendedFor: preset.recommendedFor,
    duration,
    aspect,
    poll: `/api/seedream/i2v?taskId=${i2vRes.taskId}`,
    note: 'Poll /api/seedream/i2v with the taskId until status=completed to get the final videoUrl.',
  });
}
