'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let isLoading = false;
let isLoaded = false;

/**
 * Load FFmpeg.wasm (only once)
 */
async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && isLoaded) {
    return ffmpegInstance;
  }

  if (isLoading) {
    // Wait for loading to complete
    while (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (ffmpegInstance && isLoaded) {
      return ffmpegInstance;
    }
  }

  isLoading = true;

  try {
    const ffmpeg = new FFmpeg();

    // Load FFmpeg core from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegInstance = ffmpeg;
    isLoaded = true;
    console.log('[VideoConverterClient] FFmpeg.wasm loaded successfully');

    return ffmpeg;
  } catch (error) {
    console.error('[VideoConverterClient] Failed to load FFmpeg:', error);
    throw new Error('Failed to load FFmpeg. Please refresh the page.');
  } finally {
    isLoading = false;
  }
}

/**
 * Convert image to TikTok-compatible video (client-side)
 *
 * @param imageUrl - URL of the image to convert
 * @param duration - Duration in seconds (default: 5)
 * @returns Blob URL of the generated video
 */
export async function convertImageToVideoClient(
  imageUrl: string,
  duration: number = 5,
  onProgress?: (progress: number) => void
): Promise<string> {
  console.log('[VideoConverterClient] Starting conversion...', { imageUrl, duration });

  const ffmpeg = await loadFFmpeg();

  try {
    // Fetch image
    const imageData = await fetchFile(imageUrl);

    // Write image to FFmpeg virtual file system
    await ffmpeg.writeFile('input.jpg', imageData);

    // Set up progress callback
    if (onProgress) {
      ffmpeg.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    // Convert image to video (9:16 aspect ratio, 5 seconds, 30fps)
    await ffmpeg.exec([
      '-loop', '1',
      '-i', 'input.jpg',
      '-t', duration.toString(),
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1',
      '-r', '30',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '23',
      '-movflags', '+faststart',
      '-y',
      'output.mp4'
    ]);

    // Read output video
    const data = await ffmpeg.readFile('output.mp4');

    // Create blob URL
    const videoBlob = new Blob([data], { type: 'video/mp4' });
    const videoBlobUrl = URL.createObjectURL(videoBlob);

    console.log('[VideoConverterClient] Conversion successful', {
      size: (videoBlob.size / 1024 / 1024).toFixed(2) + ' MB'
    });

    // Cleanup
    await ffmpeg.deleteFile('input.jpg');
    await ffmpeg.deleteFile('output.mp4');

    return videoBlobUrl;

  } catch (error: any) {
    console.error('[VideoConverterClient] Conversion failed:', error);
    throw new Error('Failed to convert image to video: ' + error.message);
  }
}

/**
 * Check if FFmpeg.wasm is supported in current browser
 */
export function isFFmpegSupported(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}
