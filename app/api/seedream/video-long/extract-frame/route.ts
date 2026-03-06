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
export const maxDuration = 30;

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
 * POST /api/seedream/video-long/extract-frame
 * Extracts the last frame of a video as a lossless PNG image.
 * Used for I2V continuation between segments.
 *
 * Body: { videoUrl: string }
 * Returns: { ok: true, frameUrl: string }
 */
export async function POST(req: NextRequest) {
  const id = randomUUID().slice(0, 8);
  const tmpDir = join(tmpdir(), `extract-frame-${id}`);

  try {
    console.log(`[ExtractFrame-${id}] Starting...`);

    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
    }

    const { videoUrl } = await req.json();
    if (!videoUrl) {
      return NextResponse.json({ ok: false, error: 'videoUrl required' }, { status: 400 });
    }

    // Get FFmpeg
    const ffmpegBin = await ensureFFmpeg();

    // Create temp directory
    await mkdir(tmpDir, { recursive: true });

    const videoPath = join(tmpDir, 'input.mp4');
    const framePath = join(tmpDir, 'last_frame.png');

    // Download video
    console.log(`[ExtractFrame-${id}] Downloading video...`);
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`Download failed: ${videoRes.status}`);
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    await writeFile(videoPath, videoBuffer);
    console.log(`[ExtractFrame-${id}] Video: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    // Extract last frame using FFmpeg as lossless PNG
    console.log(`[ExtractFrame-${id}] Extracting last frame...`);
    // Extract last frame as lossless PNG for maximum I2V quality
    // Use -sseof -0.04 (1 frame at 25fps) for more precise last frame
    const cmd = `"${ffmpegBin}" -sseof -0.04 -i "${videoPath}" -frames:v 1 -y "${framePath}"`;
    execSync(cmd, { timeout: 15000 });

    if (!existsSync(framePath)) {
      throw new Error('Frame extraction failed - no output file');
    }

    // Read frame
    const frameBuffer = await readFile(framePath);
    console.log(`[ExtractFrame-${id}] Frame: ${(frameBuffer.byteLength / 1024).toFixed(0)} KB`);

    // Upload to Supabase Storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `video-frames/${user.id}/${Date.now()}_lastframe.png`;
    const { error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(fileName, frameBuffer, { contentType: 'image/png', upsert: false });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from('generated-images')
      .getPublicUrl(fileName);

    console.log(`[ExtractFrame-${id}] Frame uploaded: ${publicUrl}`);

    // Cleanup
    await Promise.all([
      unlink(videoPath).catch(() => {}),
      unlink(framePath).catch(() => {}),
    ]);

    return NextResponse.json({ ok: true, frameUrl: publicUrl });

  } catch (error: any) {
    console.error(`[ExtractFrame-${id}] Error:`, error.message);

    // Cleanup on error
    try {
      if (existsSync(tmpDir)) {
        const { readdirSync } = require('fs');
        const files = readdirSync(tmpDir);
        await Promise.all(files.map((f: string) => unlink(join(tmpDir, f)).catch(() => {})));
      }
    } catch {}

    return NextResponse.json(
      { ok: false, error: error.message || 'Frame extraction failed' },
      { status: 500 }
    );
  }
}
