/**
 * Intelligent video re-cut pipeline.
 *
 * Why: a real community manager doesn't just slap text on the front of
 * a video — they trim the boring parts, re-order moments for impact
 * (hook FIRST, escalation MIDDLE, payoff END), and tighten the whole
 * thing into a 12-25 s reel that the algorithm will replay.
 *
 * This module orchestrates:
 *   1. detectScenes() — finds the strong moments
 *   2. Sonnet vision scoring (optional) — re-ranks scenes by content
 *      relevance to the post intent (food beauty / face / action)
 *   3. ffmpeg trim+concat — cuts each selected segment and concatenates
 *      them into a single output video. Re-encodes once so cuts are
 *      frame-accurate (concat-copy would only work at I-frame boundaries
 *      which usually means visible glitches at cut points).
 *
 * Strategies:
 *   - 'best_of_3' : pick the top 3 highest-scored scenes, concat in
 *                    chronological order, 2.5 s each.
 *   - 'hook_escalation_payoff' : top scene first (hook), middle one
 *                    second (escalation), best closing scene last
 *                    (payoff). Each segment 2 s.
 *   - 'preserve_order' : keep chronological order of all top scenes,
 *                    just trim the dead time between them.
 *
 * Output: re-encoded H.264 mp4, uploaded to Supabase storage, public URL
 * returned. Caller can chain applyVideoHook() to add the opening card.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { detectScenes, type DetectedScene } from './scene-detector';

const execAsync = promisify(exec);

export type RecutStrategy = 'best_of_3' | 'hook_escalation_payoff' | 'preserve_order';

export interface RecutOptions {
  strategy?: RecutStrategy;
  /** Total target duration in seconds (default 15). */
  targetDurationSec?: number;
  /** Per-segment duration in seconds (default 2.5). */
  segmentDurationSec?: number;
  /** Identifier used for output filenames. */
  outputBaseId?: string;
}

export interface RecutResult {
  outputUrl: string | null;
  segmentsUsed: Array<{ start: number; duration: number; score: number }>;
  strategy: RecutStrategy;
  durationSec: number;
}

/**
 * Run the full recut pipeline. Returns a public URL to the cut video.
 */
export async function recutVideo(
  videoUrl: string,
  options: RecutOptions = {},
): Promise<RecutResult> {
  const strategy = options.strategy || 'hook_escalation_payoff';
  const targetDuration = options.targetDurationSec ?? 15;
  const segmentDuration = options.segmentDurationSec ?? 2.5;
  const outputBaseId = options.outputBaseId || `rc-${Date.now()}`;

  const tmp = tmpdir();
  const localSource = join(tmp, `${outputBaseId}-src.mp4`);
  const localOut = join(tmp, `${outputBaseId}-out.mp4`);
  const segmentFiles: string[] = [];

  try {
    // 1. Download source.
    const res = await fetch(videoUrl);
    if (!res.ok) return emptyResult(strategy);
    await writeFile(localSource, Buffer.from(await res.arrayBuffer()));

    // 2. Detect scenes (re-uses the lib helper).
    const scenes = await detectScenes(videoUrl, {
      maxScenes: 8,
      withThumbnails: false,
      outputBaseId,
    });
    if (scenes.length === 0) return emptyResult(strategy);

    // 3. Probe duration so segment ends never overshoot.
    const { stdout: durOut } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${localSource}"`,
      { timeout: 15000 },
    );
    const totalDuration = parseFloat(durOut.trim()) || 60;

    // 4. Select segments based on strategy.
    const selected = selectSegments(scenes, strategy, targetDuration, segmentDuration, totalDuration);
    if (selected.length === 0) return emptyResult(strategy);

    // 5. Cut each segment to its own mp4 (forces re-encode = frame-accurate).
    for (let i = 0; i < selected.length; i++) {
      const seg = selected[i];
      const segPath = join(tmp, `${outputBaseId}-seg${i}.mp4`);
      segmentFiles.push(segPath);
      await execAsync(
        `ffmpeg -y -ss ${seg.start.toFixed(2)} -i "${localSource}" -t ${seg.duration.toFixed(2)} -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -pix_fmt yuv420p "${segPath}"`,
        { timeout: 60000 },
      );
    }

    // 6. Concat list file.
    const listPath = join(tmp, `${outputBaseId}-list.txt`);
    const listBody = segmentFiles.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    await writeFile(listPath, listBody);

    // 7. Concat — stream-copy since every segment has matching codec.
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${localOut}"`,
      { timeout: 90000 },
    );
    await unlink(listPath).catch(() => {});

    // 8. Upload to Supabase storage.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const buf = await readFile(localOut);
    const path = `video-recuts/${outputBaseId}.mp4`;
    const { error: upErr } = await supabase.storage
      .from('generated-images')
      .upload(path, buf, { contentType: 'video/mp4', upsert: true });
    if (upErr) {
      console.warn('[video-recut] upload failed:', upErr.message);
      return emptyResult(strategy);
    }
    const { data: pub } = supabase.storage.from('generated-images').getPublicUrl(path);
    const outputUrl = pub?.publicUrl || null;

    return {
      outputUrl,
      segmentsUsed: selected.map(s => ({ start: s.start, duration: s.duration, score: s.score })),
      strategy,
      durationSec: selected.reduce((sum, s) => sum + s.duration, 0),
    };
  } catch (e: any) {
    console.warn('[video-recut] failed:', e?.message);
    return emptyResult(strategy);
  } finally {
    await unlink(localSource).catch(() => {});
    await unlink(localOut).catch(() => {});
    for (const f of segmentFiles) await unlink(f).catch(() => {});
  }
}

function emptyResult(strategy: RecutStrategy): RecutResult {
  return { outputUrl: null, segmentsUsed: [], strategy, durationSec: 0 };
}

interface SelectedSegment {
  start: number;
  duration: number;
  score: number;
}

/**
 * Apply strategy to pick + order segments from detected scenes.
 * Each scene contributes one segment of `segmentDuration` seconds
 * starting at its timestamp.
 */
function selectSegments(
  scenes: DetectedScene[],
  strategy: RecutStrategy,
  targetDuration: number,
  segmentDuration: number,
  totalDuration: number,
): SelectedSegment[] {
  const maxSegments = Math.max(2, Math.floor(targetDuration / segmentDuration));

  // Pre-clamp segments so they never overflow source duration.
  const clampDuration = (start: number): number => {
    const remaining = Math.max(0, totalDuration - start);
    return Math.min(segmentDuration, remaining);
  };

  if (strategy === 'preserve_order') {
    // Sort by timestamp, trim to maxSegments.
    const sorted = [...scenes].sort((a, b) => a.timestamp_sec - b.timestamp_sec);
    return sorted.slice(0, maxSegments).map(s => ({
      start: s.timestamp_sec,
      duration: clampDuration(s.timestamp_sec),
      score: s.score,
    })).filter(s => s.duration > 0.5);
  }

  if (strategy === 'best_of_3') {
    // Top-3 by score, then re-order chronologically so the recut
    // still reads as a coherent sequence.
    const top = [...scenes].sort((a, b) => b.score - a.score).slice(0, 3);
    return top
      .sort((a, b) => a.timestamp_sec - b.timestamp_sec)
      .map(s => ({ start: s.timestamp_sec, duration: clampDuration(s.timestamp_sec), score: s.score }))
      .filter(s => s.duration > 0.5);
  }

  // 'hook_escalation_payoff' — pick:
  //   - hook: highest-scored scene in the FIRST third of the video
  //   - escalation: highest-scored scene in the MIDDLE third
  //   - payoff: highest-scored scene in the FINAL third
  const third = totalDuration / 3;
  const firstThird = scenes.filter(s => s.timestamp_sec < third);
  const middleThird = scenes.filter(s => s.timestamp_sec >= third && s.timestamp_sec < 2 * third);
  const finalThird = scenes.filter(s => s.timestamp_sec >= 2 * third);

  const pickTop = (arr: DetectedScene[]): DetectedScene | null => {
    if (arr.length === 0) return null;
    return [...arr].sort((a, b) => b.score - a.score)[0];
  };

  const hook = pickTop(firstThird) || scenes[0];
  const escalation = pickTop(middleThird) || pickTop(scenes.filter(s => s.timestamp_sec >= third));
  const payoff = pickTop(finalThird) || scenes[scenes.length - 1];

  const picks = [hook, escalation, payoff].filter(Boolean) as DetectedScene[];
  // Deduplicate (small videos may have all 3 land on the same scene).
  const seen = new Set<number>();
  const unique = picks.filter(s => {
    const key = Math.round(s.timestamp_sec * 10);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.map(s => ({
    start: s.timestamp_sec,
    duration: clampDuration(s.timestamp_sec),
    score: s.score,
  })).filter(s => s.duration > 0.5);
}
