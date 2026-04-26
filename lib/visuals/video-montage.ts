/**
 * Video montage / editor — combines multiple clips (and optionally
 * still images) into a single output with transitions, optional
 * background music, and a target duration.
 *
 * Built on ffmpeg, which is already present on the VPS for the
 * existing video generation pipeline.
 *
 * MVP scope:
 *   - 2-6 input clips (videos and/or images, mixed)
 *   - Transitions: cut, crossfade, fade-to-black
 *   - Per-clip duration override (otherwise: min(natural, 5s) for
 *     videos, 3s for images)
 *   - Output portrait 1080x1920 (Reel/TikTok) or square 1080x1080
 *   - Output uploaded to Supabase storage, returns public URL
 *
 * Not yet supported (todo): text overlays per clip, music sync, AI
 * shot ordering — those are layered on top in a follow-up.
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const execAsync = promisify(exec);

export type MontageInput = {
  url: string;          // public URL of video or image
  type: 'video' | 'image';
  durationSec?: number; // override per-clip duration
};

export type MontageOptions = {
  inputs: MontageInput[];
  transition?: 'cut' | 'crossfade' | 'fade';
  format?: 'portrait' | 'square' | 'landscape';
  outputName?: string;          // basename used for the storage key
};

export type MontageResult = {
  ok: boolean;
  url?: string;
  durationSec?: number;
  error?: string;
};

function dimsForFormat(fmt: 'portrait' | 'square' | 'landscape'): { w: number; h: number } {
  if (fmt === 'square') return { w: 1080, h: 1080 };
  if (fmt === 'landscape') return { w: 1920, h: 1080 };
  return { w: 1080, h: 1920 };
}

async function downloadTo(url: string, dest: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(dest, buf);
}

/**
 * Build a single segment file (always videos, even if input is image
 * we generate a still video) at the target dims. Lets us concat with
 * a single filter graph regardless of source mix.
 */
async function buildSegment(
  input: MontageInput,
  index: number,
  dims: { w: number; h: number },
  tmp: string,
): Promise<string> {
  const ext = input.type === 'video' ? 'mp4' : 'jpg';
  const localIn = join(tmp, `mt-in-${index}.${ext}`);
  const localOut = join(tmp, `mt-seg-${index}.mp4`);
  await downloadTo(input.url, localIn);

  const dur = input.durationSec || (input.type === 'video' ? 5 : 3);
  const scaleFilter = `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,crop=${dims.w}:${dims.h}`;

  if (input.type === 'image') {
    // -loop 1 → still becomes a video; -t sets duration; -tune stillimage
    await execAsync(
      `ffmpeg -y -loop 1 -t ${dur} -i "${localIn}" -vf "${scaleFilter},format=yuv420p" -r 30 -an -c:v libx264 -preset veryfast -tune stillimage "${localOut}"`,
      { timeout: 60000 },
    );
  } else {
    // Trim videos to dur seconds, normalise dims/fps, drop audio (we'll
    // handle music later). -an strips audio.
    await execAsync(
      `ffmpeg -y -t ${dur} -i "${localIn}" -vf "${scaleFilter},format=yuv420p" -r 30 -an -c:v libx264 -preset veryfast "${localOut}"`,
      { timeout: 90000 },
    );
  }
  await unlink(localIn).catch(() => {});
  return localOut;
}

/**
 * Concatenate segments with the chosen transition. For 'cut' we use the
 * concat demuxer (fastest, no re-encode). For 'crossfade' / 'fade' we
 * build a filter graph with xfade between consecutive segments.
 */
async function concatSegments(
  segments: string[],
  transition: 'cut' | 'crossfade' | 'fade',
  outPath: string,
  tmp: string,
): Promise<void> {
  if (transition === 'cut' || segments.length === 1) {
    const listFile = join(tmp, 'mt-list.txt');
    await writeFile(listFile, segments.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outPath}"`,
      { timeout: 60000 },
    );
    await unlink(listFile).catch(() => {});
    return;
  }

  // xfade chain — fade=fadeblack, crossfade=fade
  const transName = transition === 'fade' ? 'fadeblack' : 'fade';
  const overlap = 0.5; // 0.5s transition

  // Probe each segment for its duration so we know offset for the next xfade
  const durations: number[] = [];
  for (const s of segments) {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${s}"`,
        { timeout: 10000 },
      );
      durations.push(parseFloat(stdout.trim()) || 5);
    } catch {
      durations.push(5);
    }
  }

  const inputs = segments.map(s => `-i "${s}"`).join(' ');
  const filters: string[] = [];
  let last = '[0:v]';
  let offset = 0;
  for (let i = 1; i < segments.length; i++) {
    offset += durations[i - 1] - overlap;
    const cur = `[${i}:v]`;
    const out = `[v${i}]`;
    filters.push(`${last}${cur}xfade=transition=${transName}:duration=${overlap}:offset=${offset}${out}`);
    last = out;
  }
  const filterGraph = filters.join(';');

  await execAsync(
    `ffmpeg -y ${inputs} -filter_complex "${filterGraph}" -map "${last}" -c:v libx264 -preset veryfast -pix_fmt yuv420p "${outPath}"`,
    { timeout: 180000 },
  );
}

export async function buildMontage(opts: MontageOptions, postId: string): Promise<MontageResult> {
  if (!opts.inputs || opts.inputs.length < 2) {
    return { ok: false, error: 'Need at least 2 inputs' };
  }
  if (opts.inputs.length > 6) {
    return { ok: false, error: 'Max 6 inputs supported' };
  }

  const tmp = tmpdir();
  const dims = dimsForFormat(opts.format || 'portrait');
  const transition = opts.transition || 'crossfade';
  const outName = opts.outputName || `montage-${postId}-${Date.now()}.mp4`;
  const outLocal = join(tmp, outName);

  let segments: string[] = [];
  try {
    for (let i = 0; i < opts.inputs.length; i++) {
      const seg = await buildSegment(opts.inputs[i], i, dims, tmp);
      segments.push(seg);
    }
    await concatSegments(segments, transition, outLocal, tmp);

    // Probe final duration
    let finalDur = 0;
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outLocal}"`,
        { timeout: 10000 },
      );
      finalDur = parseFloat(stdout.trim()) || 0;
    } catch {}

    // Upload
    const buf = await readFile(outLocal);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const storagePath = `montages/${outName}`;
    const { error: upErr } = await supabase.storage
      .from('generated-images')
      .upload(storagePath, buf, { contentType: 'video/mp4', upsert: true });
    if (upErr) {
      return { ok: false, error: `upload: ${upErr.message}` };
    }
    const { data: pub } = supabase.storage.from('generated-images').getPublicUrl(storagePath);
    return { ok: true, url: pub?.publicUrl, durationSec: finalDur };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'montage failed' };
  } finally {
    for (const s of segments) await unlink(s).catch(() => {});
    await unlink(outLocal).catch(() => {});
  }
}
