/**
 * Auto-scene detection for client-uploaded videos.
 *
 * Why: a real community manager scans a client's raw footage for the
 * 2-3 strongest visual moments (a sudden gesture, a reveal, a face
 * close-up) and turns those into the post's first frames. Doing that
 * manually for every video doesn't scale, so we let ffmpeg's
 * scene-change filter score every frame transition and pick the top
 * N moments.
 *
 * Used by:
 *   - Studio "Auto-detect best moments" button (picks the strongest
 *     opening frame for the hook overlay)
 *   - Léna's video-to-carousel pipeline (extracts N keyframes spaced
 *     across the strongest scenes)
 *
 * The threshold is tuned for vertical phone footage. Higher = stricter
 * (fewer but bigger transitions). The filter scores from 0..1, where
 * 0.3+ is a hard cut, 0.15-0.30 is a moderate transition.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const execAsync = promisify(exec);

export interface DetectedScene {
  timestamp_sec: number;     // start of the scene in source video
  score: number;             // ffmpeg scene score (0..1, higher = sharper cut)
  thumbnail_url?: string;    // hosted frame image at this timestamp
  recommended_for: 'hook' | 'carousel' | 'cover';
}

interface SceneDetectorOptions {
  /** Threshold for ffmpeg's scene filter; default 0.25. */
  threshold?: number;
  /** Maximum scenes to return (top N by score). */
  maxScenes?: number;
  /** Whether to upload thumbnail frames to storage and return URLs. */
  withThumbnails?: boolean;
  /** Identifier used for thumbnail filenames in storage. */
  outputBaseId?: string;
}

/**
 * Probe a local video for total duration via ffprobe.
 */
async function probeDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { timeout: 15000 },
    );
    const d = parseFloat(stdout.trim());
    return isFinite(d) && d > 0 ? d : 0;
  } catch {
    return 0;
  }
}

/**
 * Run ffmpeg with the scene filter on a remote video URL. Returns the
 * detected timestamps + scores, ranked by score descending. The video
 * is downloaded to /tmp, scanned, then cleaned up.
 *
 * Always tops up the result with time-spaced samples even when the
 * video has no hard cuts (phone footage of a single continuous shot
 * is the common case for client uploads — without this top-up the
 * picker would always show only 1 thumbnail).
 */
export async function detectScenes(
  videoUrl: string,
  options: SceneDetectorOptions = {},
): Promise<DetectedScene[]> {
  // Lowered default 0.25 → 0.18 so subtle gestures / lighting shifts
  // count as scenes, which is what we want for hook candidates.
  const threshold = options.threshold ?? 0.18;
  const maxScenes = options.maxScenes ?? 6;
  const outputBaseId = options.outputBaseId || `sc-${Date.now()}`;
  const localVideo = join(tmpdir(), `${outputBaseId}.mp4`);

  try {
    const res = await fetch(videoUrl);
    if (!res.ok) return [];
    await writeFile(localVideo, Buffer.from(await res.arrayBuffer()));

    const duration = await probeDuration(localVideo);

    // ffmpeg outputs the scene-change events to stderr in the form:
    //   pts_time:1.234 ... scene_score:0.42
    const { stderr } = await execAsync(
      `ffmpeg -i "${localVideo}" -filter:v "select='gt(scene,${threshold})',showinfo" -f null - 2>&1`,
      { timeout: 90000, maxBuffer: 8 * 1024 * 1024 },
    );

    const lines = stderr.split(/\r?\n/);
    const detected: DetectedScene[] = [];
    for (const line of lines) {
      const tsMatch = line.match(/pts_time:([\d.]+)/);
      const scoreMatch = line.match(/scene_score:([\d.]+)/) || line.match(/scene:([\d.]+)/);
      if (tsMatch) {
        detected.push({
          timestamp_sec: parseFloat(tsMatch[1]),
          score: scoreMatch ? parseFloat(scoreMatch[1]) : threshold,
          recommended_for: 'carousel',
        });
      }
    }

    // TIME-SPACED TOP-UP — guarantees at least maxScenes candidates
    // regardless of whether ffmpeg found real cuts. Without this, a
    // single-shot phone clip returns 1 candidate and the picker grid
    // looks broken. We sample at 10%, 25%, 40%, 55%, 70%, 85% of
    // duration (skipping the very start/end which are usually black
    // frames or auto-fades on phone exports).
    if (duration > 1) {
      const ratios = [0.10, 0.25, 0.40, 0.55, 0.70, 0.85];
      for (const r of ratios) {
        const ts = duration * r;
        // Skip if a detected scene is within 0.5 s — avoids duplicates.
        const tooClose = detected.find(d => Math.abs(d.timestamp_sec - ts) < 0.5);
        if (!tooClose) {
          detected.push({
            timestamp_sec: ts,
            // Sample-based candidates get a lower baseline score so
            // a real detected cut always wins when both exist.
            score: 0.05 + (r === 0.10 ? 0.08 : 0),
            recommended_for: 'carousel',
          });
        }
      }
    } else {
      // Very short clip (< 1 s) — just sample the opening frame.
      if (detected.length === 0) {
        detected.push({ timestamp_sec: 0.1, score: 0.05, recommended_for: 'hook' });
      }
    }

    // Rank by score desc and cap to maxScenes.
    detected.sort((a, b) => b.score - a.score);
    const top = detected.slice(0, maxScenes);

    // Re-order so the carousel-recommended scenes read in chrono order
    // visually in the picker. We tag hook = the highest-scored (any
    // position), but still display them sorted by score so the founder
    // sees the strongest moments first.

    // Tag the highest-scored as hook + opening; rest as carousel.
    if (top.length > 0) top[0].recommended_for = 'hook';

    // Optionally extract thumbnails for each top scene.
    if (options.withThumbnails && top.length > 0) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      for (let i = 0; i < top.length; i++) {
        const scene = top[i];
        const localFrame = join(tmpdir(), `${outputBaseId}-${i}.jpg`);
        try {
          await execAsync(
            `ffmpeg -y -ss ${scene.timestamp_sec.toFixed(2)} -i "${localVideo}" -frames:v 1 -q:v 2 "${localFrame}"`,
            { timeout: 20000 },
          );
          const frameBuf = await readFile(localFrame);
          const path = `video-scenes/${outputBaseId}-${i}.jpg`;
          await supabase.storage.from('generated-images').upload(path, frameBuf, {
            contentType: 'image/jpeg',
            upsert: true,
          });
          const { data: pub } = supabase.storage.from('generated-images').getPublicUrl(path);
          scene.thumbnail_url = pub?.publicUrl;
        } catch { /* skip this thumbnail */ }
        await unlink(localFrame).catch(() => {});
      }
    }

    return top;
  } catch (e: any) {
    console.warn('[scene-detector] detection failed:', e?.message);
    return [];
  } finally {
    await unlink(localVideo).catch(() => {});
  }
}

/**
 * Convenience helper that turns a video into N carousel-ready frames
 * spread across its detected scenes. Used by Léna to produce an
 * Instagram carousel from a single uploaded video clip.
 */
export async function extractCarouselFrames(
  videoUrl: string,
  frameCount: number = 5,
  outputBaseId: string = `carr-${Date.now()}`,
): Promise<string[]> {
  const scenes = await detectScenes(videoUrl, {
    maxScenes: Math.max(frameCount * 2, 8),
    withThumbnails: true,
    outputBaseId,
  });
  if (scenes.length === 0) return [];

  // Sort by timestamp ascending so the carousel reads as a narrative.
  scenes.sort((a, b) => a.timestamp_sec - b.timestamp_sec);
  return scenes.slice(0, frameCount).map(s => s.thumbnail_url || '').filter(Boolean);
}
