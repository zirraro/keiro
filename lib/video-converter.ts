import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execPromise = promisify(exec);

/**
 * Get FFmpeg path with multiple fallback options
 */
function getFfmpegPath(): string {
  // 1. Try ffmpeg-static (best for Vercel)
  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && typeof ffmpegStatic === 'string') {
      console.log('[VideoConverter] Using ffmpeg from ffmpeg-static:', ffmpegStatic);
      return ffmpegStatic;
    }
    console.warn('[VideoConverter] ffmpeg-static returned invalid path:', ffmpegStatic);
  } catch (e: any) {
    console.warn('[VideoConverter] ffmpeg-static not available:', e.message);
  }

  // 2. Try @ffmpeg-installer/ffmpeg
  try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    if (ffmpegInstaller?.path && typeof ffmpegInstaller.path === 'string') {
      console.log('[VideoConverter] Using ffmpeg from @ffmpeg-installer:', ffmpegInstaller.path);
      return ffmpegInstaller.path;
    }
    console.warn('[VideoConverter] @ffmpeg-installer returned invalid path:', ffmpegInstaller);
  } catch (e: any) {
    console.warn('[VideoConverter] @ffmpeg-installer not available:', e.message);
  }

  // 3. Fallback to system ffmpeg (will fail on Vercel)
  console.log('[VideoConverter] Falling back to system ffmpeg (may not work on Vercel)');
  return 'ffmpeg';
}

export interface VideoOptions {
  width?: number;      // Default: 1080
  height?: number;     // Default: 1920 (9:16 for TikTok)
  duration?: number;   // Default: 5 seconds
  fps?: number;        // Default: 30
}

/**
 * Convert an image to a TikTok-compatible video
 *
 * @param imageBuffer - Buffer containing the image data
 * @param options - Video conversion options
 * @returns Buffer containing the MP4 video
 */
export async function convertImageToVideo(
  imageBuffer: Buffer,
  options: VideoOptions = {}
): Promise<Buffer> {
  const {
    width = 1080,
    height = 1920,
    duration = 5,
    fps = 30
  } = options;

  // Get FFmpeg path
  const ffmpegPath = getFfmpegPath();

  // Create temporary files
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, 'input-' + Date.now() + '.jpg');
  const outputPath = path.join(tempDir, 'output-' + Date.now() + '.mp4');

  try {
    // Write image buffer to temp file
    await fs.writeFile(inputPath, imageBuffer);

    console.log('[VideoConverter] Converting image to video...', {
      ffmpegPath,
      width,
      height,
      duration,
      fps
    });

    // FFmpeg command to convert image to video
    const command = [
      `"${ffmpegPath}"`,
      '-loop 1',
      '-i "' + inputPath + '"',
      '-t ' + duration,
      '-vf "scale=' + width + ':' + height + ':force_original_aspect_ratio=decrease,pad=' + width + ':' + height + ':(ow-iw)/2:(oh-ih)/2,setsar=1"',
      '-r ' + fps,
      '-c:v libx264',
      '-pix_fmt yuv420p',
      '-preset fast',
      '-crf 23',
      '-movflags +faststart',
      '-y',
      '"' + outputPath + '"'
    ].join(' ');

    console.log('[VideoConverter] Executing ffmpeg command...');

    const { stdout, stderr } = await execPromise(command);

    if (stderr && !stderr.includes('frame=')) {
      console.warn('[VideoConverter] FFmpeg warnings:', stderr);
    }

    console.log('[VideoConverter] Video conversion successful');

    // Read the output video
    const videoBuffer = await fs.readFile(outputPath);

    // Cleanup temp files
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    return videoBuffer;

  } catch (error: any) {
    // Cleanup on error
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    console.error('[VideoConverter] Error:', error);
    throw new Error('Video conversion failed: ' + error.message);
  }
}

/**
 * Convert an image to a video with Ken Burns effect (slow zoom/pan)
 * Creates a visually engaging video from a static image.
 * Perfect for TikTok and Instagram Reels.
 *
 * @param imageBuffer - Buffer containing the image data
 * @param options - Video conversion options
 * @returns Buffer containing the MP4 video
 */
export async function convertImageToVideoKenBurns(
  imageBuffer: Buffer,
  options: VideoOptions = {}
): Promise<Buffer> {
  const {
    width = 1080,
    height = 1920,
    duration = 30,
    fps = 30
  } = options;

  const ffmpegPath = getFfmpegPath();
  const tempDir = os.tmpdir();
  const ts = Date.now();
  const inputPath = path.join(tempDir, `kb-input-${ts}.jpg`);
  const outputPath = path.join(tempDir, `kb-output-${ts}.mp4`);

  try {
    await fs.writeFile(inputPath, imageBuffer);

    const totalFrames = duration * fps;

    // Randomly choose a Ken Burns effect for variety
    const effects = [
      // Slow zoom in (center)
      `zoompan=z='min(zoom+0.0003,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`,
      // Slow zoom out (start zoomed, pull back)
      `zoompan=z='if(eq(on,1),1.4,max(zoom-0.0004,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`,
      // Pan left to right + slight zoom
      `zoompan=z='min(zoom+0.0002,1.2)':x='if(eq(on,1),0,min(x+${(width * 0.15 / totalFrames).toFixed(4)},iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`,
      // Pan top to bottom + zoom
      `zoompan=z='min(zoom+0.0002,1.2)':x='iw/2-(iw/zoom/2)':y='if(eq(on,1),0,min(y+${(height * 0.1 / totalFrames).toFixed(4)},ih-ih/zoom))':d=${totalFrames}:s=${width}x${height}:fps=${fps}`,
    ];

    const effectIdx = Math.floor(Math.random() * effects.length);
    const zoompanFilter = effects[effectIdx];

    console.log(`[VideoConverter] Ken Burns effect #${effectIdx} (${duration}s, ${width}x${height})...`);

    const command = [
      `"${ffmpegPath}"`,
      `-loop 1`,
      `-i "${inputPath}"`,
      `-t ${duration}`,
      `-vf "${zoompanFilter},format=yuv420p"`,
      `-c:v libx264`,
      `-pix_fmt yuv420p`,
      `-preset fast`,
      `-crf 23`,
      `-movflags +faststart`,
      `-y`,
      `"${outputPath}"`
    ].join(' ');

    console.log('[VideoConverter] Executing Ken Burns ffmpeg...');

    const { stderr } = await execPromise(command, { timeout: 120000 });

    if (stderr && !stderr.includes('frame=') && !stderr.includes('speed=')) {
      console.warn('[VideoConverter] FFmpeg warnings:', stderr.substring(0, 300));
    }

    console.log('[VideoConverter] Ken Burns video conversion successful');

    const videoBuffer = await fs.readFile(outputPath);

    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    return videoBuffer;
  } catch (error: any) {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
    console.error('[VideoConverter] Ken Burns error:', error);
    throw new Error('Ken Burns video conversion failed: ' + error.message);
  }
}

/**
 * Merge a video with an audio file using FFmpeg
 * Audio is padded with silence if shorter than video, or video is cut to audio length
 *
 * @param videoBuffer - Video buffer (MP4)
 * @param audioBuffer - Audio buffer (MP3)
 * @returns Merged video buffer (MP4 with audio)
 */
export async function mergeVideoWithAudio(
  videoBuffer: Buffer,
  audioBuffer: Buffer,
): Promise<Buffer> {
  const ffmpegPath = getFfmpegPath();
  const tempDir = os.tmpdir();
  const ts = Date.now();
  const videoPath = path.join(tempDir, `merge-v-${ts}.mp4`);
  const audioPath = path.join(tempDir, `merge-a-${ts}.mp3`);
  const outputPath = path.join(tempDir, `merge-out-${ts}.mp4`);

  try {
    await fs.writeFile(videoPath, videoBuffer);
    await fs.writeFile(audioPath, audioBuffer);

    console.log('[VideoConverter] Merging video + audio...');

    // Voice audio padded to video duration, then cut to shortest
    const command = [
      `"${ffmpegPath}"`,
      `-i "${videoPath}"`,
      `-i "${audioPath}"`,
      `-filter_complex "[1:a]apad[aout]"`,
      `-map 0:v:0`,
      `-map "[aout]"`,
      `-c:v copy`,
      `-c:a aac -b:a 128k`,
      `-shortest`,
      `-movflags +faststart`,
      `-y`,
      `"${outputPath}"`
    ].join(' ');

    await execPromise(command, { timeout: 60000 });

    console.log('[VideoConverter] Audio merge successful');

    const mergedBuffer = await fs.readFile(outputPath);

    await fs.unlink(videoPath).catch(() => {});
    await fs.unlink(audioPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    return mergedBuffer;
  } catch (error: any) {
    await fs.unlink(videoPath).catch(() => {});
    await fs.unlink(audioPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
    console.error('[VideoConverter] Audio merge error:', error);
    throw new Error('Audio merge failed: ' + error.message);
  }
}

/**
 * Check if FFmpeg is available
 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    const ffmpegPath = getFfmpegPath();
    console.log('[VideoConverter] Checking FFmpeg availability at:', ffmpegPath);

    const { stdout, stderr } = await execPromise(`"${ffmpegPath}" -version`);
    console.log('[VideoConverter] FFmpeg is available:', stdout.split('\n')[0]);
    return true;
  } catch (error: any) {
    console.error('[VideoConverter] FFmpeg not available:', {
      message: error.message,
      code: error.code,
      stderr: error.stderr
    });
    return false;
  }
}
