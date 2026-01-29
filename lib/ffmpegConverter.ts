import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/**
 * Client-side video converter using FFmpeg.wasm
 * Converts videos to TikTok-compatible format (H.264 + AAC)
 */

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;

/**
 * Load FFmpeg.wasm (only once)
 */
async function loadFFmpeg(onProgress?: (ratio: number) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpegLoaded) {
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();

  // Log handler
  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  // Progress handler
  ffmpeg.on('progress', ({ progress, time }) => {
    console.log('[FFmpeg] Progress:', Math.round(progress * 100) + '%', 'Time:', time);
    if (onProgress) {
      onProgress(progress);
    }
  });

  // Load FFmpeg.wasm core
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

  console.log('[FFmpeg] Loading FFmpeg.wasm...');
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegLoaded = true;
  console.log('[FFmpeg] ✅ FFmpeg.wasm loaded successfully');

  return ffmpeg;
}

/**
 * Convert video to TikTok-compatible format
 *
 * @param videoUrl - URL of the video to convert
 * @param onProgress - Progress callback (0.0 to 1.0)
 * @returns Blob URL of the converted video
 */
export async function convertVideoForTikTok(
  videoUrl: string,
  onProgress?: (progress: number, stage: string) => void
): Promise<string> {
  try {
    // Stage 1: Load FFmpeg
    onProgress?.(0.1, 'Chargement de FFmpeg...');
    const ffmpegInstance = await loadFFmpeg((ratio) => {
      // FFmpeg loading is 0-20% of total progress
      onProgress?.(0.1 + ratio * 0.1, 'Chargement de FFmpeg...');
    });

    // Stage 2: Download video
    onProgress?.(0.2, 'Téléchargement de la vidéo...');
    console.log('[FFmpeg] Downloading video:', videoUrl);
    const videoData = await fetchFile(videoUrl);

    // Stage 3: Write input file
    onProgress?.(0.3, 'Préparation de la conversion...');
    await ffmpegInstance.writeFile('input.mp4', videoData);

    // Stage 4: Convert video
    onProgress?.(0.4, 'Conversion en cours...');
    console.log('[FFmpeg] Converting to TikTok format (H.264 + AAC)...');

    /**
     * FFmpeg command breakdown:
     * -i input.mp4          : Input file
     * -c:v libx264          : Video codec H.264 (required by TikTok)
     * -preset medium        : Encoding speed/quality tradeoff
     * -crf 23               : Quality (18-28, lower = better quality)
     * -c:a aac              : Audio codec AAC (required by TikTok)
     * -b:a 128k             : Audio bitrate 128 kbps
     * -ar 44100             : Audio sample rate 44.1 kHz
     * -movflags +faststart  : Optimize for streaming (web playback)
     * -pix_fmt yuv420p      : Pixel format (compatible)
     * -vf scale=...         : Scale to max 1080x1920 (9:16)
     */
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=\'min(1080,iw)\':\'min(1920,ih)\':force_original_aspect_ratio=decrease',
      'output.mp4'
    ]);

    // Stage 5: Read output file
    onProgress?.(0.9, 'Finalisation...');
    console.log('[FFmpeg] Reading converted video...');
    const outputData = await ffmpegInstance.readFile('output.mp4');

    // Stage 6: Create blob URL
    // FileData from FFmpeg is always Uint8Array for binary files
    if (!(outputData instanceof Uint8Array)) {
      throw new Error('Invalid output data type from FFmpeg');
    }
    // Convert to standard Uint8Array to satisfy BlobPart type
    const uint8Data = new Uint8Array(outputData);
    const blob = new Blob([uint8Data], { type: 'video/mp4' });
    const blobUrl = URL.createObjectURL(blob);

    // Cleanup
    await ffmpegInstance.deleteFile('input.mp4');
    await ffmpegInstance.deleteFile('output.mp4');

    onProgress?.(1.0, 'Conversion terminée!');
    console.log('[FFmpeg] ✅ Conversion completed, blob URL:', blobUrl);

    return blobUrl;

  } catch (error: any) {
    console.error('[FFmpeg] Conversion error:', error);
    throw new Error(`Échec de la conversion vidéo: ${error.message}`);
  }
}

/**
 * Convert video file (File object) to TikTok format
 */
export async function convertVideoFileForTikTok(
  videoFile: File,
  onProgress?: (progress: number, stage: string) => void
): Promise<Blob> {
  try {
    // Stage 1: Load FFmpeg
    onProgress?.(0.1, 'Chargement de FFmpeg...');
    const ffmpegInstance = await loadFFmpeg((ratio) => {
      onProgress?.(0.1 + ratio * 0.1, 'Chargement de FFmpeg...');
    });

    // Stage 2: Read file
    onProgress?.(0.2, 'Lecture du fichier...');
    const videoData = await fetchFile(videoFile);

    // Stage 3: Write input file
    onProgress?.(0.3, 'Préparation de la conversion...');
    await ffmpegInstance.writeFile('input.mp4', videoData);

    // Stage 4: Convert video
    onProgress?.(0.4, 'Conversion en cours...');
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=\'min(1080,iw)\':\'min(1920,ih)\':force_original_aspect_ratio=decrease',
      'output.mp4'
    ]);

    // Stage 5: Read output file
    onProgress?.(0.9, 'Finalisation...');
    const outputData = await ffmpegInstance.readFile('output.mp4');

    // Cleanup
    await ffmpegInstance.deleteFile('input.mp4');
    await ffmpegInstance.deleteFile('output.mp4');

    onProgress?.(1.0, 'Conversion terminée!');

    // FileData from FFmpeg is always Uint8Array for binary files
    if (!(outputData instanceof Uint8Array)) {
      throw new Error('Invalid output data type from FFmpeg');
    }
    // Convert to standard Uint8Array to satisfy BlobPart type
    const uint8Data = new Uint8Array(outputData);
    return new Blob([uint8Data], { type: 'video/mp4' });

  } catch (error: any) {
    console.error('[FFmpeg] Conversion error:', error);
    throw new Error(`Échec de la conversion vidéo: ${error.message}`);
  }
}

/**
 * Check if FFmpeg.wasm is supported in this browser
 */
export function isFFmpegSupported(): boolean {
  // FFmpeg.wasm requires SharedArrayBuffer
  // https://github.com/ffmpegwasm/ffmpeg.wasm#requirements
  return typeof SharedArrayBuffer !== 'undefined';
}

/**
 * Estimate conversion time (rough approximation)
 * @param videoSizeBytes - Video file size in bytes
 * @returns Estimated time in seconds
 */
export function estimateConversionTime(videoSizeBytes: number): number {
  // Very rough estimate: ~2-5 seconds per MB on average hardware
  const sizeMB = videoSizeBytes / (1024 * 1024);
  const secondsPerMB = 3.5; // middle ground
  return Math.ceil(sizeMB * secondsPerMB);
}
