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
  // single | 30 | 45 | 60
  const w = deep ? [25, 35, 25, 15] : [45, 35, 15, 5];
  let acc = 0; let pickIdx = 0;
  for (let i = 0; i < w.length; i++) { acc += w[i]; if (seed < acc) { pickIdx = i; break; } }
  const perClipSec = 9;
  if (pickIdx === 0) return { kind: 'single', durationSec: 10, sceneCount: 1, perClipSec, reason: 'snappy single-beat' };
  const dur = [30, 45, 60][pickIdx - 1];
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
}): Promise<string | null> {
  const { scenes, pixabayQuery, perClipSec, postId, internalBase, cronSecret, userId } = opts;
  try {
    const { searchPixabayImages } = await import('@/lib/stock/pixabay');
    const pics = await searchPixabayImages({ query: pixabayQuery, count: 12, orientation: 'vertical' });
    if (!pics.length) return null; // no real base → bail (caller uses single path)

    const clipUrls: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const baseImg = pics[i % pics.length]?.largeImageURL;
      if (!baseImg) continue;
      try {
        // Kick off i2v from the REAL image with this scene's cinematic prompt.
        const startRes = await fetch(`${internalBase}/api/seedream/i2v`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${cronSecret}` },
          body: JSON.stringify({ imageUrl: baseImg, prompt: scenes[i], duration: perClipSec, userId }),
        });
        const startData = await startRes.json().catch(() => null);
        const taskId = startData?.taskId;
        if (!taskId) continue;
        // Poll up to ~150s for this clip.
        const deadline = Date.now() + 150_000;
        let clipUrl: string | null = null;
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
        if (clipUrl) clipUrls.push(clipUrl);
      } catch { /* skip this scene */ }
    }

    if (clipUrls.length === 0) return null;
    // Stitch the real-image clips into one vertical reel.
    let finalUrl = await concatVideoClips(clipUrls, postId);
    if (!finalUrl) finalUrl = clipUrls[0];

    // Jamendo music (always-audio rule).
    try {
      const { pickJamendoMusic, pickMoodFromContext } = await import('@/lib/audio/jamendo-music');
      const mood = opts.mood || pickMoodFromContext({ motion: undefined as any });
      const music = await pickJamendoMusic({ mood, minDurationSec: 8 });
      if (music?.url) {
        const { muxReelAudio } = await import('@/lib/audio/reel-audio-mux');
        const mix = await muxReelAudio({ videoUrl: finalUrl, musicUrl: music.url, postId, durationSec: scenes.length * perClipSec });
        if (mix.url && mix.url !== finalUrl) finalUrl = mix.url;
      }
    } catch { /* ship without audio */ }

    // ~20% on-screen text hook (visual hook is primary).
    if (Math.random() < 0.2 && opts.hookTopic) {
      try {
        const { generateReelHook, overlayReelHook } = await import('@/lib/visuals/reel-hook');
        const hook = await generateReelHook({ topic: opts.hookTopic, platform: 'tiktok', lang: opts.hookLang || 'fr' });
        if (hook) {
          const hk = await overlayReelHook({ videoUrl: finalUrl, hookText: hook, postId });
          if (hk.applied && hk.url) finalUrl = hk.url;
        }
      } catch { /* no overlay */ }
    }

    return finalUrl;
  } catch {
    return null;
  }
}

async function fetchBuf(url: string, ms = 25_000): Promise<Buffer | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); }
  catch { return null; }
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
    for (let i = 0; i < urls.length; i++) {
      const buf = await fetchBuf(urls[i]);
      if (!buf || buf.length < 5000) continue;
      const p = path.join(tmp, `c${i}.mp4`);
      await fs.writeFile(p, buf);
      localPaths.push(p);
    }
    if (localPaths.length === 0) return null;
    if (localPaths.length === 1) return urls[urls.indexOf(urls[0])]; // only one usable → caller keeps it

    const ff = getFfmpegPath();
    const out = path.join(tmp, 'out.mp4');
    // Normalize each clip to 1080x1920 / 30fps then concat — robust to mixed
    // input specs (the concat demuxer fails on mismatched codecs).
    const inputs = localPaths.map(p => `-i "${p}"`).join(' ');
    const scale = localPaths
      .map((_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[v${i}]`)
      .join(';');
    const concatIns = localPaths.map((_, i) => `[v${i}]`).join('');
    const filter = `${scale};${concatIns}concat=n=${localPaths.length}:v=1:a=0[v]`;
    const cmd = `"${ff}" -y ${inputs} -filter_complex "${filter}" -map "[v]" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 "${out}"`;
    await execPromise(cmd, { timeout: 180_000, maxBuffer: 1024 * 1024 * 80 });

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
