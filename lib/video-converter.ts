import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execPromise = promisify(exec);

// Try to use @ffmpeg-installer/ffmpeg for Vercel, fallback to system ffmpeg
let ffmpegPath = 'ffmpeg';
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  ffmpegPath = ffmpegInstaller.path;
  console.log('[VideoConverter] Using ffmpeg from @ffmpeg-installer/ffmpeg:', ffmpegPath);
} catch (e) {
  console.log('[VideoConverter] Using system ffmpeg');
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

  // Create temporary files
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, 'input-' + Date.now() + '.jpg');
  const outputPath = path.join(tempDir, 'output-' + Date.now() + '.mp4');

  try {
    // Write image buffer to temp file
    await fs.writeFile(inputPath, imageBuffer);

    console.log('[VideoConverter] Converting image to video...', {
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
 * Check if FFmpeg is available
 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await execPromise(`"${ffmpegPath}" -version`);
    return true;
  } catch (error) {
    console.error('[VideoConverter] FFmpeg not available:', error);
    return false;
  }
}
