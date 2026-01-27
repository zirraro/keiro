import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export interface VideoConversionOptions {
  duration?: number; // Duration in seconds (default: 5)
  width?: number; // Default: 1080
  height?: number; // Default: 1920 (TikTok format 9:16)
  fps?: number; // Frames per second (default: 30)
  format?: 'mp4' | 'mov' | 'webm'; // Default: mp4
}

/**
 * Convert image to video using ffmpeg
 * Requires ffmpeg to be installed on the server
 *
 * @param imageBuffer - Image buffer (JPEG, PNG, WebP)
 * @param options - Video conversion options
 * @returns Buffer containing the converted video (MP4)
 */
export async function convertImageToVideo(
  imageBuffer: Buffer,
  options: VideoConversionOptions = {}
): Promise<Buffer> {
  const {
    duration = 5,
    width = 1080,
    height = 1920,
    fps = 30,
    format = 'mp4',
  } = options;

  // Create temp directory for conversion
  const tempDir = path.join('/tmp', `video-conversion-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  const inputPath = path.join(tempDir, 'input.jpg');
  const outputPath = path.join(tempDir, `output.${format}`);

  try {
    // Write image buffer to temp file
    await fs.writeFile(inputPath, imageBuffer);

    console.log('[VideoConverter] Converting image to video...');
    console.log(`[VideoConverter] Dimensions: ${width}x${height}, Duration: ${duration}s, FPS: ${fps}`);

    // Build ffmpeg command
    // -loop 1: Loop the input image
    // -i: Input file
    // -c:v libx264: Use H.264 codec (widely compatible)
    // -t: Duration in seconds
    // -pix_fmt yuv420p: Pixel format for compatibility (required by most players)
    // -vf scale: Scale and pad to target resolution maintaining aspect ratio
    // -r: Frame rate
    // -movflags +faststart: Optimize for streaming (move moov atom to start)
    const command = `ffmpeg -loop 1 -i "${inputPath}" -c:v libx264 -t ${duration} -pix_fmt yuv420p -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2" -r ${fps} -movflags +faststart "${outputPath}"`;

    console.log('[VideoConverter] Executing ffmpeg...');

    await execAsync(command);

    // Read output video
    const videoBuffer = await fs.readFile(outputPath);

    console.log('[VideoConverter] ✅ Conversion successful:', videoBuffer.length, 'bytes');

    return videoBuffer;
  } catch (error: any) {
    console.error('[VideoConverter] ❌ Conversion failed:', error);
    throw new Error(`Video conversion failed: ${error.message}`);
  } finally {
    // Cleanup temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log('[VideoConverter] Temp files cleaned up');
    } catch (err) {
      console.error('[VideoConverter] Cleanup error:', err);
    }
  }
}

/**
 * Check if ffmpeg is installed on the system
 */
export async function checkFfmpegInstalled(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version');
    console.log('[VideoConverter] ✅ ffmpeg is installed');
    return true;
  } catch (error) {
    console.error('[VideoConverter] ❌ ffmpeg not found');
    console.error('[VideoConverter] Please install ffmpeg: https://ffmpeg.org/download.html');
    return false;
  }
}

/**
 * Get video metadata (duration, dimensions, etc.)
 * Requires ffprobe (comes with ffmpeg)
 */
export async function getVideoMetadata(videoPath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  size: number;
}> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`
    );

    const data = JSON.parse(stdout);
    const videoStream = data.streams.find((s: any) => s.codec_type === 'video');

    return {
      duration: parseFloat(data.format.duration),
      width: videoStream.width,
      height: videoStream.height,
      size: parseInt(data.format.size),
    };
  } catch (error: any) {
    throw new Error(`Failed to get video metadata: ${error.message}`);
  }
}

/**
 * Alternative: Use cloud service for conversion (Cloudinary, AWS MediaConvert, etc.)
 * This is a placeholder for production implementation if ffmpeg is not available
 *
 * @param imageUrl - Public URL of the image
 * @param options - Conversion options
 * @returns URL of the converted video
 */
export async function convertImageToVideoCloud(
  imageUrl: string,
  options: VideoConversionOptions = {}
): Promise<string> {
  // TODO: Implement cloud-based conversion
  // Options for production:
  // 1. Cloudinary Video API: https://cloudinary.com/documentation/video_manipulation_and_delivery
  // 2. AWS Elemental MediaConvert: https://aws.amazon.com/mediaconvert/
  // 3. FFmpeg.wasm (browser-side): https://github.com/ffmpegwasm/ffmpeg.wasm
  // 4. Cloudflare Stream: https://developers.cloudflare.com/stream/

  throw new Error('Cloud video conversion not yet implemented. Use convertImageToVideo() with ffmpeg for now.');
}
