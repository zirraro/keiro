import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { writeFile, unlink, mkdir, readFile, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 min pour fusion multi-segments

const FFMPEG_PATH = join(tmpdir(), 'ffmpeg');

/**
 * Ensure FFmpeg is available (same pattern as merge-audio-video)
 */
async function ensureFFmpeg(): Promise<string> {
  if (existsSync(FFMPEG_PATH)) return FFMPEG_PATH;

  try {
    const npmPath = require('ffmpeg-static') as string;
    if (npmPath && existsSync(npmPath)) return npmPath;
  } catch {}

  const manualPaths = [
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    '/var/task/node_modules/ffmpeg-static/ffmpeg',
  ];
  for (const p of manualPaths) {
    if (existsSync(p)) return p;
  }

  const urls = [
    'https://github.com/shaka-project/static-ffmpeg-binaries/releases/latest/download/ffmpeg-linux-x64',
    'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/linux-x64',
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(FFMPEG_PATH, buffer);
      await chmod(FFMPEG_PATH, '755');
      break;
    } catch {}
  }

  if (!existsSync(FFMPEG_PATH)) {
    throw new Error('Cannot download FFmpeg');
  }

  try {
    execSync(`"${FFMPEG_PATH}" -version`, { timeout: 5000 });
  } catch {
    const gzPath = FFMPEG_PATH + '.gz';
    const { renameSync } = require('fs');
    renameSync(FFMPEG_PATH, gzPath);
    execSync(`gunzip -f "${gzPath}"`);
    await chmod(FFMPEG_PATH, '755');
    execSync(`"${FFMPEG_PATH}" -version`, { timeout: 5000 });
  }
  return FFMPEG_PATH;
}

/**
 * POST /api/seedream/video-long/merge
 * Fusionne plusieurs segments vidéo en une seule vidéo finale.
 *
 * Body: { jobId: string, segmentUrls: string[] }
 * Returns: { ok: true, mergedUrl: string }
 */
export async function POST(req: NextRequest) {
  const id = randomUUID().slice(0, 8);
  const tmpDir = join(tmpdir(), `merge-segments-${id}`);

  try {
    console.log(`[MergeSegments-${id}] Starting...`);

    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
    }

    const { jobId, segmentUrls } = await req.json();

    if (!segmentUrls || !Array.isArray(segmentUrls) || segmentUrls.length < 2) {
      return NextResponse.json({ ok: false, error: 'At least 2 segment URLs required' }, { status: 400 });
    }

    console.log(`[MergeSegments-${id}] Merging ${segmentUrls.length} segments for job ${jobId}`);

    // Get FFmpeg
    const ffmpegBin = await ensureFFmpeg();

    // Create temp directory
    await mkdir(tmpDir, { recursive: true });

    // Download all segments in parallel
    console.log(`[MergeSegments-${id}] Downloading ${segmentUrls.length} segments...`);
    const downloadPromises = segmentUrls.map(async (url: string, idx: number) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download segment ${idx + 1} failed: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const segPath = join(tmpDir, `segment_${idx}.mp4`);
      await writeFile(segPath, buffer);
      console.log(`[MergeSegments-${id}] Segment ${idx + 1}: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
      return segPath;
    });

    const segmentPaths = await Promise.all(downloadPromises);

    // Create concat list file
    const concatListPath = join(tmpDir, 'concat_list.txt');
    const concatContent = segmentPaths.map(p => `file '${p}'`).join('\n');
    await writeFile(concatListPath, concatContent);

    const outputPath = join(tmpDir, 'merged.mp4');

    // Always re-encode for guaranteed seamless transitions
    // Using high quality CRF 18 and medium preset for smooth boundaries
    console.log(`[MergeSegments-${id}] Re-encoding ${segmentUrls.length} segments for seamless merge...`);
    const mergeCmd = `"${ffmpegBin}" -f concat -safe 0 -i "${concatListPath}" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 24 -c:a aac -b:a 192k -movflags +faststart -y "${outputPath}"`;
    execSync(mergeCmd, { timeout: 180000 }); // 3 min timeout for quality encode
    console.log(`[MergeSegments-${id}] Seamless merge completed`);

    // Read merged file
    const mergedBuffer = await readFile(outputPath);
    console.log(`[MergeSegments-${id}] Merged file: ${(mergedBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    // Upload to Supabase Storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `long-videos/${user.id}/${Date.now()}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(fileName, mergedBuffer, { contentType: 'video/mp4', upsert: false });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from('generated-images')
      .getPublicUrl(fileName);

    console.log(`[MergeSegments-${id}] Uploaded: ${publicUrl}`);

    // Update job status if jobId provided
    if (jobId) {
      try {
        await supabase
          .from('video_generation_jobs')
          .update({
            status: 'completed',
            final_video_url: publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      } catch (e) {
        console.warn(`[MergeSegments-${id}] Failed to update job:`, e);
      }
    }

    // Cleanup
    const cleanupPromises = [
      ...segmentPaths.map(p => unlink(p).catch(() => {})),
      unlink(concatListPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ];
    await Promise.all(cleanupPromises);

    return NextResponse.json({ ok: true, mergedUrl: publicUrl, segmentCount: segmentUrls.length });

  } catch (error: any) {
    console.error(`[MergeSegments-${id}] Error:`, error.message);

    // Cleanup on error
    try {
      const { readdirSync } = require('fs');
      if (existsSync(tmpDir)) {
        const files = readdirSync(tmpDir);
        await Promise.all(files.map((f: string) => unlink(join(tmpDir, f)).catch(() => {})));
      }
    } catch {}

    return NextResponse.json(
      { ok: false, error: error.message || 'Video merge failed' },
      { status: 500 }
    );
  }
}
