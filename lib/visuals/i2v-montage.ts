/**
 * i2v Montage pipeline foundation.
 *
 * Goal (founder): reels grounded in REAL images (Pixabay royalty-free / client
 * assets) → animated as i2v clips → stitched into a longer CINEMATIC reel
 * (12/30/45/60s) → Jamendo sound + hook. Real-image base = far less
 * "AI-detectable" than pure t2v, which is the lever for TikTok/IG reach.
 *
 * This file is the SAFE foundation: a pure planner (chooseMontagePlan) +
 * the ffmpeg stitcher (concatVideoClips). Both are self-contained with graceful
 * fallback so they can never break the working single-clip path. The async
 * orchestration (fetch real image → i2v each scene → poll → concat → audio +
 * hook) is wired on top of these in the reel pipeline / video-poll cron.
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createClient } from '@supabase/supabase-js';

const execPromise = promisify(exec);

function getFfmpegPath(): string {
  try { const f = require('ffmpeg-static'); if (f && typeof f === 'string') return f; } catch {}
  try { const i = require('@ffmpeg-installer/ffmpeg'); if (i?.path) return i.path; } catch {}
  return 'ffmpeg';
}

function getFfprobePath(): string {
  try { const i = require('@ffprobe-installer/ffprobe'); if (i?.path) return i.path; } catch {}
  return 'ffprobe';
}

/** Probe a local clip's duration in seconds (fallback to `fallback` on failure). */
async function probeDurationSec(filePath: string, fallback = 9): Promise<number> {
  try {
    const fp = getFfprobePath();
    const { stdout } = await execPromise(
      `"${fp}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { timeout: 20_000 },
    );
    const d = parseFloat(String(stdout).trim());
    return Number.isFinite(d) && d > 0.3 ? d : fallback;
  } catch { return fallback; }
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
}

export type MontageKind = 'single' | 'montage';
export interface MontagePlan {
  kind: MontageKind;
  durationSec: number;   // total target
  sceneCount: number;    // i2v clips to stitch (1 for single)
  perClipSec: number;    // ~ duration per clip (Seedance i2v ≈ 8-10s)
  reason: string;
}

/**
 * Léna decides the montage shape from the topic + strategy. She MIXES lengths
 * (not always 30s) and leans into what fits the subject. Relevant lengths:
 *   - single ~10s : snappy reactive / single-beat subjects
 *   - 30s (3 clips): standard storytelling (the default "star reel")
 *   - 45s (5 clips): value / tutorial / multi-scene
 *   - 60s (6 clips): deep cinematic story
 * `seed` (post id hash) keeps the choice stable per post; the weighting biases
 * toward the kind that suits the pillar/format.
 */
export function chooseMontagePlan(opts: {
  pillar?: string;          // P0 actu, P1 avant/après, education, etc.
  topicLength?: number;     // length of the caption/brief (proxy for depth)
  format?: string;
  seed?: number;
}): MontagePlan {
  const seed = ((opts.seed || 0) % 100 + 100) % 100;
  const deep = (opts.topicLength || 0) > 240; // rich brief → can sustain a longer story
  // Weighted buckets (sum 100). Deeper topics skew longer.
  // single(10) | 20 | 30 | 45 | 60
  const w = deep ? [15, 20, 30, 20, 15] : [40, 25, 20, 10, 5];
  let acc = 0; let pickIdx = 0;
  for (let i = 0; i < w.length; i++) { acc += w[i]; if (seed < acc) { pickIdx = i; break; } }
  const perClipSec = 10; // valid for both Seedance (~10 cap) and Kling (5|10)
  if (pickIdx === 0) return { kind: 'single', durationSec: 10, sceneCount: 1, perClipSec: 10, reason: 'snappy single-beat' };
  const dur = [20, 30, 45, 60][pickIdx - 1];
  const sceneCount = Math.max(2, Math.round(dur / perClipSec));
  return { kind: 'montage', durationSec: dur, sceneCount, perClipSec, reason: `cinematic montage ${dur}s / ${sceneCount} scenes` };
}

/**
 * Orchestrate a real-image i2v montage:
 *   for each scene → pick a real Pixabay photo → animate it (i2v ~perClipSec) →
 *   stitch all clips → mux Jamendo music → (20%) hook overlay → return URL.
 * Each i2v poll takes minutes, so this runs in a long-lived context (the
 * dedicated montage endpoint on the VPS — no serverless timeout). Returns the
 * final reel URL, or null on failure (caller falls back to the single clip).
 */
export async function runI2vMontage(opts: {
  scenes: string[];
  pixabayQuery: string;
  perClipSec: number;
  postId: string;
  internalBase: string;
  cronSecret: string;
  userId: string;
  mood?: string;
  hookTopic?: string;
  hookLang?: 'fr' | 'en';
  bakeAudio?: boolean;
  // Personalized establishing image (founder: don't always start from generic
  // stock). Priority resolved by the caller: client's real asset → a
  // business-precise generated/internet-inspired image → Pixabay. When set,
  // scene 0 animates THIS image and the rest frame-chains from it.
  baseImageUrl?: string;
}): Promise<string | null> {
  const { scenes, pixabayQuery, perClipSec, postId, internalBase, cronSecret, userId } = opts;
  try {
    const { searchPixabayImages } = await import('@/lib/stock/pixabay');
    // Pixabay is now only the FALLBACK reseed source if the chain breaks — the
    // establishing base comes from baseImageUrl (client/business-precise) when
    // the caller resolved one.
    const pics = await searchPixabayImages({ query: pixabayQuery, count: 12, orientation: 'vertical', lang: 'en' });
    if (!pics.length && !opts.baseImageUrl) return null; // no base at all → bail

    const clipUrls: string[] = [];
    // FRAME-CHAINING (founder's key insight): scene 0 animates the best real
    // Pixabay photo; every subsequent scene starts its i2v FROM THE LAST FRAME
    // of the previous clip. The montage becomes ONE continuous evolving shot —
    // consecutive plans are visually linked, and whatever carries the
    // actuality/business link stays on screen across every plan. We only need
    // ONE strong establishing image instead of N matching photos.
    // Establishing base: personalized image if the caller resolved one
    // (client asset / business-precise generated), else the best Pixabay photo.
    let currentImg = opts.baseImageUrl
      ? ((await rehostImage(opts.baseImageUrl, postId, 0)) || opts.baseImageUrl)
      : ((await rehostImage(pics[0]?.largeImageURL || '', postId, 0)) || pics[0]?.largeImageURL || '');
    let pixCursor = opts.baseImageUrl ? 0 : 1; // Pixabay only reseeds if we have NO frame yet
    // QC 2026-06-17: continuity broke because a failed clip reseeded from a
    // DIFFERENT Pixabay product (bocal→vase, framboise→viennoiserie). Keep the
    // last GOOD frame as the thread: on failure we retry from it (same subject),
    // never a new product. Pixabay reseed only when no good frame exists yet.
    let lastGoodImg = currentImg;
    for (let i = 0; i < scenes.length; i++) {
      if (!currentImg) {
        if (lastGoodImg) {
          currentImg = lastGoodImg; // preserve the visual thread
        } else {
          const nx = pics[pixCursor++ % pics.length]?.largeImageURL;
          currentImg = (nx && (await rehostImage(nx, postId, 100 + i))) || nx || '';
          if (!currentImg) continue;
        }
      }
      let clipUrl: string | null = null;
      try {
        const startRes = await fetch(`${internalBase}/api/seedream/i2v`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${cronSecret}` },
          body: JSON.stringify({ imageUrl: currentImg, prompt: scenes[i], duration: perClipSec, userId }),
        });
        const startData = await startRes.json().catch(() => null);
        const taskId = startData?.taskId;
        if (taskId) {
          const deadline = Date.now() + 150_000;
          while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 6000));
            const pr = await fetch(`${internalBase}/api/seedream/i2v`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', authorization: `Bearer ${cronSecret}` },
              body: JSON.stringify({ taskId, userId }),
            });
            const pd = await pr.json().catch(() => null);
            if (pd?.status === 'completed' && pd?.videoUrl) { clipUrl = pd.videoUrl; break; }
            if (pd?.status === 'failed') break;
          }
        }
      } catch { /* handled below */ }

      if (clipUrl) {
        clipUrls.push(clipUrl);
        // Continuity: next scene starts from THIS clip's last frame.
        if (i < scenes.length - 1) {
          const lf = await extractLastFrame(clipUrl, postId, i);
          if (lf) { currentImg = lf; lastGoodImg = lf; }
          else { currentImg = lastGoodImg; } // couldn't extract → keep last good thread
        }
      } else {
        currentImg = lastGoodImg; // failed → continue from last good frame, NOT a new product
      }
    }

    if (clipUrls.length === 0) return null;
    return await finalizeReel(clipUrls, {
      postId, durationSec: clipUrls.length * perClipSec, // real clips produced, not scenes requested
      mood: opts.mood, hookTopic: opts.hookTopic, hookLang: opts.hookLang, bakeAudio: opts.bakeAudio,
    });
  } catch {
    return null;
  }
}

/**
 * Shared post-production for any montage (i2v OR Ken Burns): stitch clips with
 * cinematic crossfades → mux Jamendo music → ~20% on-screen hook → upload.
 * Returns the final reel URL (or the first clip on concat failure), or null.
 */
export async function finalizeReel(clipUrls: string[], opts: {
  postId: string;
  durationSec: number;
  mood?: string;
  hookTopic?: string;
  hookLang?: 'fr' | 'en';
  bakeAudio?: boolean; // default true; false = leave SILENT (TikTok prepare mode:
                       // the user adds a trending TikTok sound in-app, which the
                       // API can't do and which is a top reach factor).
}): Promise<string | null> {
  const clips = (clipUrls || []).filter(Boolean);
  if (clips.length === 0) return null;
  let finalUrl = await concatVideoClips(clips, opts.postId);
  if (!finalUrl) finalUrl = clips[0];

  // Jamendo music (always-audio rule) — skipped in TikTok prepare mode.
  let hasAudio = false;
  if (opts.bakeAudio !== false) try {
    const { pickJamendoMusic, pickMoodFromContext } = await import('@/lib/audio/jamendo-music');
    const mood: any = opts.mood || pickMoodFromContext({ motion: undefined as any });
    const music = await pickJamendoMusic({ mood, minDurationSec: 8 });
    if (music?.url) {
      const { muxReelAudio } = await import('@/lib/audio/reel-audio-mux');
      const mix = await muxReelAudio({ videoUrl: finalUrl, musicUrl: music.url, postId: opts.postId, durationSec: opts.durationSec });
      if (mix.url && mix.url !== finalUrl) { finalUrl = mix.url; hasAudio = true; }
    }
  } catch { /* ship without audio */ }

  // GARANTIE PISTE AUDIO (incident 10/07) : IG Reels rejette une vidéo sans flux
  // audio. Si aucune musique n'a été bakée (mux échoué OU mode prepare silencieux),
  // on ajoute une piste SILENCIEUSE pour que la vidéo soit publiable partout.
  if (!hasAudio) try {
    const { ensureAudioTrack } = await import('@/lib/audio/reel-audio-mux');
    const withAudio = await ensureAudioTrack({ videoUrl: finalUrl, postId: opts.postId });
    if (withAudio && withAudio !== finalUrl) finalUrl = withAudio;
  } catch { /* best-effort */ }

  // ~20% on-screen text hook (visual hook is primary).
  if (Math.random() < 0.2 && opts.hookTopic) {
    try {
      const { generateReelHook, overlayReelHook } = await import('@/lib/visuals/reel-hook');
      const hook = await generateReelHook({ topic: opts.hookTopic, platform: 'tiktok', lang: opts.hookLang || 'fr' });
      if (hook) {
        const hk = await overlayReelHook({ videoUrl: finalUrl, hookText: hook, postId: opts.postId });
        if (hk.applied && hk.url) finalUrl = hk.url;
      }
    } catch { /* no overlay */ }
  }
  return finalUrl;
}

async function fetchBuf(url: string, ms = 25_000): Promise<Buffer | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); }
  catch { return null; }
}

/**
 * Ken Burns clip: slow cinematic pan/zoom over ONE real photo → 1080x1920 mp4.
 * NO AI generation → 100% photographic, zero hallucination/morphing (the
 * realism the founder wants; QC kept flagging i2v artefacts). `variant` cycles
 * the camera move so a montage doesn't feel mechanical. Returns the clip URL.
 */
export async function kenBurnsClip(photoUrl: string, postId: string, idx: number, durationSec: number, variant: number): Promise<string | null> {
  const tmp = path.join(os.tmpdir(), `kb-${postId}-${idx}-${Date.now()}`);
  try {
    const buf = await fetchBuf(photoUrl, 25_000);
    if (!buf || buf.length < 2000) return null;
    await fs.mkdir(tmp, { recursive: true });
    const img = path.join(tmp, 'in.jpg');
    const out = path.join(tmp, 'out.mp4');
    await fs.writeFile(img, buf);
    const ff = getFfmpegPath();
    const fps = 30;
    const frames = Math.max(2, Math.round(durationSec * fps));
    // Stronger, clearly-visible motion (QC 2026-06-18: subtle moves on one image
    // read as "frames quasi-identiques, aucun mouvement"). Faster zoom + each
    // variant frames a DIFFERENT region so 3 segments on one hero explore the
    // scene (detail → traverse → reveal) instead of looking frozen.
    // Duration-AWARE zoom step so the motion spreads smoothly over the WHOLE
    // clip (a fixed step hits the cap early then freezes the rest — reads as
    // "no motion" to QC). Reach ~1.38 exactly at the last frame.
    const zStep = (0.38 / frames).toFixed(6);
    const zStepSlow = (0.26 / frames).toFixed(6);
    const zin = `min(zoom+${zStep},1.5)`;
    const zout = `if(lte(zoom,1.0),1.38,max(1.0,zoom-${zStep}))`;
    const cx = `iw/2-(iw/zoom/2)`, cy = `ih/2-(ih/zoom/2)`;
    // Rich, varied camera-move repertoire (founder: "toujours le même zoom" →
    // diversifier beaucoup plus). 11 distinct moves: zoom in/out, traverses,
    // diagonals, drifts, corner pulls. v0 = safe centered zoom for single-image.
    // `rot` (optionnel) = expression d'angle (radians, var `t`=temps) appliquée
    // APRÈS le zoompan via le filtre rotate. Pour ces mouvements, le zoompan
    // rend sur un canvas plus grand (1.3×) puis on recadre au centre → la
    // rotation ne révèle jamais de bords noirs.
    const D = Math.max(0.1, durationSec);
    const variants: Array<{ z: string; x: string; y: string; rot?: string }> = [
      { z: zin, x: cx, y: cy },                                                          // 0 centered zoom-in (safe default)
      { z: `min(zoom+${zStepSlow},1.28)`, x: `(iw-iw/zoom)*on/${frames}`, y: cy },        // 1 traverse L→R
      { z: `min(zoom+${zStepSlow},1.28)`, x: `(iw-iw/zoom)*(1-on/${frames})`, y: cy },    // 2 traverse R→L
      { z: zout, x: cx, y: cy },                                                          // 3 pull back / reveal
      // 4-10 : mouvements qui RÉSOLVENT VERS LE CENTRE (founder 07/07 : le
      // mouvement ne doit jamais FINIR sur un coin — le sujet reste cadré à la
      // fin, qui est le point de transition). On "révèle" depuis un léger décalage
      // puis on se recentre sur le sujet.
      { z: zin, x: cx, y: `(ih-ih/zoom)*(0.5-0.32*(1-on/${frames}))` },                   // 4 révèle du haut → centre
      { z: zin, x: cx, y: `(ih-ih/zoom)*(0.5+0.32*(1-on/${frames}))` },                   // 5 révèle du bas → centre
      { z: `min(zoom+${zStepSlow},1.30)`, x: `(iw-iw/zoom)*(0.5-0.28*(1-on/${frames}))`, y: `(ih-ih/zoom)*(0.5-0.28*(1-on/${frames}))` }, // 6 révèle coin HG → centre
      { z: `min(zoom+${zStepSlow},1.30)`, x: `(iw-iw/zoom)*(0.5+0.28*(1-on/${frames}))`, y: `(ih-ih/zoom)*(0.5-0.28*(1-on/${frames}))` }, // 7 révèle coin HD → centre
      { z: zin, x: `(iw-iw/zoom)*(0.5-0.34*(1-on/${frames}))`, y: cy },                   // 8 révèle gauche → centre
      { z: zin, x: `(iw-iw/zoom)*(0.5+0.34*(1-on/${frames}))`, y: cy },                   // 9 révèle droite → centre
      { z: `min(zoom+${zStepSlow},1.22)`, x: cx, y: `(ih-ih/zoom)*(0.5+0.3*(1-on/${frames}))` }, // 10 monte du bas → centre
      // ── Mouvements DYNAMIQUES (founder: "tourbillon", pas que du zoom) ──
      { z: zin, x: cx, y: cy, rot: `(1-min(t/${D},1))*0.13` },                            // 11 whirl-in horaire (spin qui se stabilise) = HOOK tourbillon
      { z: zin, x: cx, y: cy, rot: `-(1-min(t/${D},1))*0.13` },                           // 12 whirl-in anti-horaire
      { z: `min(zoom+${zStepSlow},1.24)`, x: cx, y: cy, rot: `sin(t/${D}*3.14159)*0.05` },// 13 swirl / balancé doux continu
      // ── Hooks de transition supplémentaires (founder 07/07 : plus de variété
      // efficace, naturelle, pas "trop IA") — tous CENTRÉS sujet ──
      { z: `min(zoom+${(0.5 / frames).toFixed(6)},1.6)`, x: cx, y: cy },                  // 14 PUNCH-IN rapide (hook d'accroche, zoom vif qui claque)
      { z: zin, x: `(iw-iw/zoom)*(0.5+0.12*sin(on/${frames}*3.14159))`, y: cy },          // 15 arc cinématique doux (léger S qui revient au centre)
      { z: `min(zoom+${zStepSlow},1.26)`, x: cx, y: cy, rot: `(t/${D})*0.06` },           // 16 orbite lente (spirale d'ouverture naturelle, sens horaire)
      { z: zout, x: cx, y: cy, rot: `-(1-min(t/${D},1))*0.08` },                          // 17 pull-back dévoilé + redressement (reveal spiralé)
    ];
    const v = variants[((variant % variants.length) + variants.length) % variants.length];
    // Normalize to a 2160x3840 (9:16) canvas first so the pan/zoom never
    // letterboxes, then zoompan. Rotation moves render 1.3× larger then crop.
    // Uniform cinematic GRADE on every clip (QC: real-business photos mix warm
    // interior / cold exterior → continuity breaks; "étalonnage" unifies them).
    const grade = `eq=contrast=1.06:saturation=1.08:brightness=0.01,colorbalance=rm=0.04:gm=0.01:bm=-0.04`;
    const zpSize = v.rot ? '1404x2496' : '1080x1920';
    const rotPart = v.rot ? `,rotate=a='${v.rot}':ow=1404:oh=2496:c=black,crop=1080:1920` : '';
    const vf = `scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,zoompan=z='${v.z}':d=${frames}:x='${v.x}':y='${v.y}':s=${zpSize}:fps=${fps}${rotPart},${grade},format=yuv420p`;
    const cmd = `"${ff}" -y -loop 1 -i "${img}" -vf "${vf}" -t ${durationSec} -c:v libx264 -pix_fmt yuv420p -preset fast -crf 22 "${out}"`;
    await execPromise(cmd, { timeout: 120_000, maxBuffer: 1024 * 1024 * 80 });
    const outBuf = await fs.readFile(out).catch(() => null);
    if (!outBuf || outBuf.length < 10_000) return null;
    const sb = admin();
    const obj = `reels-kenburns/${postId}-${idx}-${Date.now()}.mp4`;
    const { error } = await sb.storage.from('business-assets').upload(obj, outBuf, { contentType: 'video/mp4', upsert: true });
    if (error) return null;
    const { data } = sb.storage.from('business-assets').getPublicUrl(obj);
    return data?.publicUrl || null;
  } catch { return null; }
  finally { try { await fs.rm(tmp, { recursive: true, force: true }); } catch {} }
}

/**
 * Ken Burns montage (DEFAULT path): one cinematic pan/zoom clip per real photo,
 * stitched with crossfades + music + hook. Photos should be ordered
 * client-first then business-precise stock. Returns the final reel URL.
 */
export async function runKenBurnsMontage(opts: {
  photos: string[];
  perClipSec: number;
  sceneCount: number;
  postId: string;
  mood?: string;
  hookTopic?: string;
  hookLang?: 'fr' | 'en';
  bakeAudio?: boolean;
}): Promise<string | null> {
  try {
    const photos = (opts.photos || []).filter(Boolean);
    if (!photos.length) return null;
    const clipUrls: string[] = [];
    // Randomize the camera move per clip so reels don't all feel identical
    // (founder). Single-image reel keeps the safe centered zoom (variant 0);
    // multi-clip spreads varied moves (i*3 keeps consecutive clips distinct).
    const VARIANT_COUNT = 14; // doit suivre la longueur du tableau variants[] de kenBurnsClip
    const moveBase = Math.floor(Math.random() * VARIANT_COUNT);
    // Founder: varier le HOOK — pas toujours un zoom. On ouvre souvent sur un
    // mouvement DYNAMIQUE qui capte l'œil (tourbillon 11/12, swirl 13, push 0)
    // puis on enchaîne des moves distincts. Single-image : répertoire élargi
    // incluant les tourbillons (un seul move continu reste propre).
    const HOOK_DYNAMIC = [11, 12, 13, 0, 3]; // whirl CW/CCW, swirl, push-in, reveal
    const SAFE_SINGLE = [0, 1, 2, 3, 10, 11, 12, 13];
    for (let i = 0; i < opts.sceneCount; i++) {
      const variant = opts.sceneCount === 1
        ? SAFE_SINGLE[Math.floor(Math.random() * SAFE_SINGLE.length)]
        : i === 0
          ? HOOK_DYNAMIC[Math.floor(Math.random() * HOOK_DYNAMIC.length)] // 1er plan = hook accrocheur
          : (moveBase + i * 3) % VARIANT_COUNT;
      const clip = await kenBurnsClip(photos[i % photos.length], opts.postId, i, opts.perClipSec, variant);
      if (clip) clipUrls.push(clip);
    }
    if (!clipUrls.length) return null;
    return await finalizeReel(clipUrls, {
      postId: opts.postId, durationSec: clipUrls.length * opts.perClipSec,
      mood: opts.mood, hookTopic: opts.hookTopic, hookLang: opts.hookLang, bakeAudio: opts.bakeAudio,
    });
  } catch { return null; }
}

/**
 * Re-host a stock image (Pixabay) on Supabase before feeding it to the i2v
 * provider. Seedance fetches the image URL server-side and FAILS on Pixabay
 * URLs ("resource download failed") — so without this, the primary (better)
 * provider always falls back. Supabase public URLs download fine. Returns the
 * Supabase URL, or null on failure (caller falls back to the raw URL).
 */
async function rehostImage(url: string, postId: string, i: number): Promise<string | null> {
  try {
    const buf = await fetchBuf(url, 20_000);
    if (!buf || buf.length < 3000) return null;
    const sb = admin();
    const obj = `reels-i2v-src/${postId}-${Date.now()}-${i}.jpg`;
    const { error } = await sb.storage.from('business-assets').upload(obj, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    const { data } = sb.storage.from('business-assets').getPublicUrl(obj);
    return data?.publicUrl || null;
  } catch { return null; }
}

/**
 * Extract the LAST frame of a clip and upload it as a JPG. This is the key to
 * montage continuity (founder): the next scene's i2v starts FROM this frame, so
 * consecutive clips flow as ONE evolving shot instead of disconnected images —
 * and whatever makes the actuality/business link visible stays on screen across
 * every plan. Returns the Supabase URL of the frame, or null on failure.
 */
async function extractLastFrame(videoUrl: string, postId: string, idx: number): Promise<string | null> {
  const tmp = path.join(os.tmpdir(), `lastframe-${postId}-${idx}-${Date.now()}`);
  try {
    const buf = await fetchBuf(videoUrl, 30_000);
    if (!buf || buf.length < 5000) return null;
    await fs.mkdir(tmp, { recursive: true });
    const vid = path.join(tmp, 'in.mp4');
    const img = path.join(tmp, 'last.jpg');
    await fs.writeFile(vid, buf);
    const ff = getFfmpegPath();
    // Seek ~0.25s before the end and grab one high-quality frame.
    await execPromise(`"${ff}" -y -sseof -0.25 -i "${vid}" -frames:v 1 -q:v 2 "${img}"`, { timeout: 60_000, maxBuffer: 1024 * 1024 * 40 });
    const out = await fs.readFile(img).catch(() => null);
    if (!out || out.length < 2000) return null;
    const sb = admin();
    const obj = `reels-i2v-chain/${postId}-${idx}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from('business-assets').upload(obj, out, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    const { data } = sb.storage.from('business-assets').getPublicUrl(obj);
    return data?.publicUrl || null;
  } catch { return null; }
  finally { try { await fs.rm(tmp, { recursive: true, force: true }); } catch {} }
}

/**
 * Stitch N video clips (silent i2v mp4s, possibly different sizes/fps) into one
 * vertical 1080x1920 mp4. Re-encodes for uniformity. Returns the uploaded URL,
 * or null on failure (caller falls back to the first clip / single path).
 */
export async function concatVideoClips(clipUrls: string[], postId: string): Promise<string | null> {
  const urls = (clipUrls || []).filter(Boolean);
  if (urls.length === 0) return null;
  if (urls.length === 1) return urls[0];

  const tmp = path.join(os.tmpdir(), `i2v-montage-${Date.now()}`);
  try {
    await fs.mkdir(tmp, { recursive: true });
    const localPaths: string[] = [];
    const okUrls: string[] = []; // track which source URL each downloaded clip came from
    for (let i = 0; i < urls.length; i++) {
      const buf = await fetchBuf(urls[i]);
      if (!buf || buf.length < 5000) continue;
      const p = path.join(tmp, `c${i}.mp4`);
      await fs.writeFile(p, buf);
      localPaths.push(p);
      okUrls.push(urls[i]);
    }
    if (localPaths.length === 0) return null;
    if (localPaths.length === 1) return okUrls[0]; // the single clip that actually downloaded

    const ff = getFfmpegPath();
    const out = path.join(tmp, 'out.mp4');
    const inputs = localPaths.map(p => `-i "${p}"`).join(' ');
    // Each clip → normalized 1080x1920 / 30fps stream.
    const scale = localPaths
      .map((_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p[v${i}]`)
      .join(';');

    // PRIMARY path: real cinematic xfade transitions between scenes (founder
    // wants "vraies transitions / vrai lien entre les scènes"). Compute exact
    // offsets from each clip's real duration; vary the transition style so cuts
    // feel directed, not mechanical. On ANY failure, fall back to hard concat.
    let built = false;
    try {
      const durs: number[] = [];
      for (const p of localPaths) durs.push(await probeDurationSec(p));
      const T = 0.6; // crossfade length
      // Wide, randomized transition repertoire so cuts feel directed + varied
      // (founder: transitions naturelles et variées).
      const styles = ['fade', 'smoothleft', 'smoothright', 'smoothup', 'smoothdown', 'slideleft', 'slideup', 'circleopen', 'circleclose', 'fadeblack', 'dissolve', 'wipeleft', 'diagtl', 'radial'];
      const tStart = Math.floor(Math.random() * styles.length);
      let chain = '';
      let prev = 'v0';
      let cum = durs[0];
      for (let k = 1; k < localPaths.length; k++) {
        const off = Math.max(0.1, cum - T);
        const label = k === localPaths.length - 1 ? 'vout' : `x${k}`;
        const tr = styles[(tStart + k - 1) % styles.length];
        chain += `;[${prev}][v${k}]xfade=transition=${tr}:duration=${T}:offset=${off.toFixed(2)}[${label}]`;
        cum = cum + durs[k] - T;
        prev = label;
      }
      const filter = `${scale}${chain}`;
      const cmd = `"${ff}" -y ${inputs} -filter_complex "${filter}" -map "[vout]" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 22 "${out}"`;
      await execPromise(cmd, { timeout: 240_000, maxBuffer: 1024 * 1024 * 80 });
      const probe = await fs.stat(out).catch(() => null);
      if (probe && probe.size > 10_000) built = true;
    } catch { /* fall back to hard concat below */ }

    if (!built) {
      // FALLBACK: hard concat (robust to anything xfade can't handle).
      const concatIns = localPaths.map((_, i) => `[v${i}]`).join('');
      const filter = `${scale};${concatIns}concat=n=${localPaths.length}:v=1:a=0[v]`;
      const cmd = `"${ff}" -y ${inputs} -filter_complex "${filter}" -map "[v]" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 "${out}"`;
      await execPromise(cmd, { timeout: 180_000, maxBuffer: 1024 * 1024 * 80 });
    }

    const outBuf = await fs.readFile(out);
    if (outBuf.length < 10_000) return null;
    const sb = admin();
    const obj = `reels-montage/${postId}-${Date.now()}.mp4`;
    const { error } = await sb.storage.from('business-assets').upload(obj, outBuf, { contentType: 'video/mp4', upsert: true });
    if (error) return null;
    const { data } = sb.storage.from('business-assets').getPublicUrl(obj);
    return data?.publicUrl || null;
  } catch {
    return null;
  } finally {
    try { await fs.rm(tmp, { recursive: true, force: true }); } catch {}
  }
}

/**
 * DUAL-REEL — "clip A (hook/format tendance) qui se RECOUPE sur le clip B (notre
 * reel)". Founder 2026-06-23 : « 2 reels qui se ressemblent, un trendy et l'autre
 * le nôtre, en transition qui vient se recouper/suivre ». On garde A court (le
 * hook emprunté au format) puis une transition franche enchaîne sur B en entier.
 *
 * ⚠️ A et B doivent être des clips qu'on POSSÈDE (nos générations, stock libre,
 * ou un clip dont le client a les droits). NE PAS embarquer un clip d'un autre
 * créateur dans une publication : copyright + TikTok détecte le ré-upload =
 * shadowban (la cause même des 0 vues qu'on vient de corriger). La banque de
 * clips trend sert d'INSPIRATION de format ; ici on monte deux clips à nous.
 */
export async function dualReelMontage(opts: {
  clipA: string;          // hook / format (joué court)
  clipB: string;          // notre reel (joué en entier)
  postId: string;
  hookSec?: number;       // durée de A avant la transition (def 2.6s)
}): Promise<string | null> {
  const a = opts.clipA, b = opts.clipB;
  if (!a || !b) return null;
  const tmp = path.join(os.tmpdir(), `dual-${opts.postId}-${Date.now()}`);
  try {
    await fs.mkdir(tmp, { recursive: true });
    const bufA = await fetchBuf(a), bufB = await fetchBuf(b);
    if (!bufA || !bufB || bufA.length < 5000 || bufB.length < 5000) return null;
    const pa = path.join(tmp, 'a.mp4'), pb = path.join(tmp, 'b.mp4'), out = path.join(tmp, 'out.mp4');
    await fs.writeFile(pa, bufA); await fs.writeFile(pb, bufB);
    const ff = getFfmpegPath();
    const hook = Math.max(1.5, Math.min(opts.hookSec ?? 2.6, 5));
    const T = 0.5; // overlap "recoupe"
    const off = Math.max(0.5, hook - T);
    // Transition franche qui accroche (zoom/whip/slide) — variée par postId.
    const PUNCHY = ['zoomin', 'smoothleft', 'smoothup', 'circleopen', 'fadewhite', 'slideup'];
    const seed = String(opts.postId).split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
    const tr = PUNCHY[Math.abs(seed) % PUNCHY.length];
    const norm = (label: string) => `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p${label}`;
    // A trimmé à `hook` s ; B en entier ; xfade en overlap.
    const filter = [
      `[0:v]trim=0:${hook.toFixed(2)},setpts=PTS-STARTPTS,${norm('[a]')}`,
      `[1:v]${norm('[b]')}`,
      `[a][b]xfade=transition=${tr}:duration=${T}:offset=${off.toFixed(2)}[vout]`,
    ].join(';');
    const cmd = `"${ff}" -y -i "${pa}" -i "${pb}" -filter_complex "${filter}" -map "[vout]" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 22 "${out}"`;
    await execPromise(cmd, { timeout: 240_000, maxBuffer: 1024 * 1024 * 80 });
    const outBuf = await fs.readFile(out).catch(() => null);
    if (!outBuf || outBuf.length < 10_000) return null;
    const sb = admin();
    const obj = `reels-dual/${opts.postId}-${Date.now()}.mp4`;
    const { error } = await sb.storage.from('business-assets').upload(obj, outBuf, { contentType: 'video/mp4', upsert: true });
    if (error) return null;
    const { data } = sb.storage.from('business-assets').getPublicUrl(obj);
    return data?.publicUrl || null;
  } catch { return null; }
  finally { try { await fs.rm(tmp, { recursive: true, force: true }); } catch {} }
}
