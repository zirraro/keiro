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
