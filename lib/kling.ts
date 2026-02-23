/**
 * Kling AI Generation Helper
 *
 * JWT authentication + API helpers for:
 * - Text-to-Image (kling-image-o1)
 * - Image-to-Image / Omni Image (kling-image-o1)
 * - Text-to-Video (kling-v2-5-turbo)
 * - Image-to-Video (kling-v2-5-turbo)
 *
 * API docs: https://api.klingai.com
 */

import jwt from 'jsonwebtoken';

const KLING_API_BASE = 'https://api.klingai.com';

/**
 * Generate a JWT token for Kling API authentication.
 * Uses HS256 with access_key as issuer and secret_key for signing.
 * Token valid for 30 minutes.
 */
export function generateKlingToken(): string {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new Error('KLING_ACCESS_KEY and KLING_SECRET_KEY must be configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: accessKey,
    exp: now + 1800,
    nbf: now - 5,
  };

  return jwt.sign(payload, secretKey, { algorithm: 'HS256' });
}

/**
 * Get auth headers for Kling API requests.
 */
export function getKlingHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${generateKlingToken()}`,
  };
}

// Kling only supports 16:9, 9:16, 1:1
// Map unsupported ratios to the closest supported one
const SUPPORTED_RATIOS = ['16:9', '9:16', '1:1'];
function normalizeAspectRatio(ratio?: string): string {
  if (!ratio || SUPPORTED_RATIOS.includes(ratio)) return ratio || '16:9';
  // 4:5 (Instagram portrait) → 9:16
  if (ratio === '4:5' || ratio === '3:4' || ratio === '2:3') return '9:16';
  // 5:4, 4:3, 3:2 (landscape) → 16:9
  if (ratio === '5:4' || ratio === '4:3' || ratio === '3:2') return '16:9';
  return '16:9';
}

// Image aspect ratios — Kling images support more ratios than video
const IMAGE_SUPPORTED_RATIOS = ['1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '21:9'];
function normalizeImageAspectRatio(ratio?: string): string {
  if (!ratio) return '1:1';
  if (IMAGE_SUPPORTED_RATIOS.includes(ratio)) return ratio;
  if (ratio === '4:5') return '3:4';
  if (ratio === '5:4') return '4:3';
  return '1:1';
}

// ====== Text-to-Image ======

/**
 * Create a T2I task and poll until completion (server-side).
 * Returns the generated image URL.
 */
export async function generateKlingT2I(params: {
  prompt: string;
  aspectRatio?: string;
}): Promise<{ imageUrl: string }> {
  // Kling limit: prompt max 2500 chars
  const prompt = params.prompt.length > 2500 ? params.prompt.substring(0, 2500) : params.prompt;

  const body = {
    model_name: 'kling-image-o1',
    prompt,
    n: 1,
    aspect_ratio: normalizeImageAspectRatio(params.aspectRatio),
  };

  console.log('[Kling T2I] Creating task with model kling-image-o1, prompt length:', prompt.length);

  const createRes = await fetch(`${KLING_API_BASE}/v1/images/generations`, {
    method: 'POST',
    headers: getKlingHeaders(),
    body: JSON.stringify(body),
  });

  const createText = await createRes.text();
  if (!createRes.ok) {
    throw new Error(`Kling T2I create error: ${createRes.status} - ${createText}`);
  }

  const createData = JSON.parse(createText);
  const taskId = createData.data?.task_id;
  if (!taskId) throw new Error('Kling T2I: no task_id returned');

  console.log('[Kling T2I] Task created:', taskId);

  // Server-side polling (max 60s, every 2s)
  return pollKlingImageTask(`/v1/images/generations/${taskId}`, 'T2I');
}

// ====== Image-to-Image (Omni Image) ======

/**
 * Create an I2I task using Kling omni-image endpoint.
 * Image must be base64 data URI.
 */
export async function generateKlingI2I(params: {
  prompt: string;
  image: string; // base64 data URI or URL
  aspectRatio?: string;
}): Promise<{ imageUrl: string }> {
  // Kling limit: prompt max 2500 chars (including the <<<image_1>>> prefix)
  const rawPrompt = params.prompt.length > 2480 ? params.prompt.substring(0, 2480) : params.prompt;

  const body: any = {
    model_name: 'kling-image-o1',
    prompt: `<<<image_1>>> ${rawPrompt}`,
    image_list: [{ image: params.image }],
    n: 1,
    aspect_ratio: normalizeImageAspectRatio(params.aspectRatio),
  };

  console.log('[Kling I2I] Creating omni-image task, prompt length:', rawPrompt.length, ', image size:', params.image.length > 200 ? `${(params.image.length / 1024).toFixed(0)}KB` : 'URL');

  const createRes = await fetch(`${KLING_API_BASE}/v1/images/omni-image`, {
    method: 'POST',
    headers: getKlingHeaders(),
    body: JSON.stringify(body),
  });

  const createText = await createRes.text();
  if (!createRes.ok) {
    throw new Error(`Kling I2I create error: ${createRes.status} - ${createText}`);
  }

  const createData = JSON.parse(createText);
  const taskId = createData.data?.task_id;
  if (!taskId) throw new Error('Kling I2I: no task_id returned');

  console.log('[Kling I2I] Task created:', taskId);

  return pollKlingImageTask(`/v1/images/omni-image/${taskId}`, 'I2I');
}

/**
 * Poll a Kling image task until completion.
 * Max 60s, polling every 2s.
 */
async function pollKlingImageTask(pollPath: string, tag: string): Promise<{ imageUrl: string }> {
  const maxWait = 60_000;
  const interval = 2_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, interval));

    const pollRes = await fetch(`${KLING_API_BASE}${pollPath}`, {
      method: 'GET',
      headers: getKlingHeaders(),
    });

    const pollText = await pollRes.text();
    if (!pollRes.ok) {
      throw new Error(`Kling ${tag} poll error: ${pollRes.status} - ${pollText}`);
    }

    const pollData = JSON.parse(pollText);
    const taskStatus = pollData.data?.task_status;

    if (taskStatus === 'succeed') {
      const images = pollData.data?.task_result?.images;
      if (images && images.length > 0 && images[0].url) {
        console.log(`[Kling ${tag}] Image ready:`, images[0].url);
        return { imageUrl: images[0].url };
      }
      throw new Error(`Kling ${tag}: succeed but no image URL`);
    }

    if (taskStatus === 'failed') {
      const msg = pollData.data?.task_status_msg || 'Image generation failed';
      throw new Error(`Kling ${tag} failed: ${msg}`);
    }

    console.log(`[Kling ${tag}] Polling... status: ${taskStatus}`);
  }

  throw new Error(`Kling ${tag}: timeout after ${maxWait / 1000}s`);
}

// ====== Text-to-Video ======

export interface KlingT2VRequest {
  prompt: string;
  duration: string; // "5" or "10"
  aspect_ratio?: string; // "16:9", "9:16", "1:1"
  mode?: string; // "std" or "pro"
}

/**
 * Create a text-to-video task on Kling.
 * Returns the task_id for polling.
 */
export async function createT2VTask(params: KlingT2VRequest): Promise<string> {
  const body = {
    model_name: 'kling-v2-5-turbo',
    prompt: params.prompt,
    duration: params.duration,
    aspect_ratio: normalizeAspectRatio(params.aspect_ratio),
    mode: params.mode || 'std',
  };

  console.log('[Kling T2V] Creating task:', JSON.stringify(body, null, 2));

  const response = await fetch(`${KLING_API_BASE}/v1/videos/text2video`, {
    method: 'POST',
    headers: getKlingHeaders(),
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  console.log('[Kling T2V] Response:', responseText);

  if (!response.ok) {
    throw new Error(`Kling T2V API error: ${response.status} - ${responseText}`);
  }

  const data = JSON.parse(responseText);
  const taskId = data.data?.task_id;

  if (!taskId) {
    console.error('[Kling T2V] No task_id in response:', data);
    throw new Error('Kling API returned no task_id');
  }

  console.log('[Kling T2V] Task created:', taskId);
  return taskId;
}

/**
 * Check the status of a text-to-video task.
 */
export async function checkT2VTask(taskId: string): Promise<{ status: string; videoUrl?: string; error?: string }> {
  const response = await fetch(`${KLING_API_BASE}/v1/videos/text2video/${taskId}`, {
    method: 'GET',
    headers: getKlingHeaders(),
  });

  const responseText = await response.text();
  console.log('[Kling T2V] Status:', responseText.substring(0, 500));

  if (!response.ok) {
    throw new Error(`Kling status check error: ${response.status} - ${responseText}`);
  }

  const data = JSON.parse(responseText);
  return parseKlingTaskResponse(data, 'T2V');
}

// ====== Image-to-Video ======

export interface KlingI2VRequest {
  image: string; // base64 or URL
  prompt?: string;
  duration: string; // "5" or "10"
  mode?: string; // "std" or "pro"
}

/**
 * Create an image-to-video task on Kling.
 * Returns the task_id for polling.
 */
export async function createI2VTask(params: KlingI2VRequest): Promise<string> {
  const body: any = {
    model_name: 'kling-v2-5-turbo',
    image: params.image,
    duration: params.duration,
    mode: params.mode || 'std',
  };

  if (params.prompt) {
    body.prompt = params.prompt;
  }

  console.log('[Kling I2V] Creating task, image length:', params.image.length > 200 ? `${(params.image.length / 1024).toFixed(0)}KB base64` : params.image);

  const response = await fetch(`${KLING_API_BASE}/v1/videos/image2video`, {
    method: 'POST',
    headers: getKlingHeaders(),
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  console.log('[Kling I2V] Response:', responseText);

  if (!response.ok) {
    throw new Error(`Kling I2V API error: ${response.status} - ${responseText}`);
  }

  const data = JSON.parse(responseText);
  const taskId = data.data?.task_id;

  if (!taskId) {
    console.error('[Kling I2V] No task_id in response:', data);
    throw new Error('Kling API returned no task_id');
  }

  console.log('[Kling I2V] Task created:', taskId);
  return taskId;
}

/**
 * Check the status of an image-to-video task.
 */
export async function checkI2VTask(taskId: string): Promise<{ status: string; videoUrl?: string; error?: string }> {
  const response = await fetch(`${KLING_API_BASE}/v1/videos/image2video/${taskId}`, {
    method: 'GET',
    headers: getKlingHeaders(),
  });

  const responseText = await response.text();
  console.log('[Kling I2V] Status:', responseText.substring(0, 500));

  if (!response.ok) {
    throw new Error(`Kling status check error: ${response.status} - ${responseText}`);
  }

  const data = JSON.parse(responseText);
  return parseKlingTaskResponse(data, 'I2V');
}

// ====== Shared ======

/**
 * Parse Kling task response into a normalized format.
 */
function parseKlingTaskResponse(data: any, tag: string): { status: string; videoUrl?: string; error?: string } {
  const taskData = data.data;
  if (!taskData) {
    console.error(`[Kling ${tag}] No data in response:`, data);
    return { status: 'failed', error: 'Invalid response from Kling API' };
  }

  const taskStatus = taskData.task_status;
  console.log(`[Kling ${tag}] Task status: ${taskStatus}`);

  if (taskStatus === 'succeed') {
    const videos = taskData.task_result?.videos;
    if (videos && videos.length > 0 && videos[0].url) {
      console.log(`[Kling ${tag}] Video ready:`, videos[0].url);
      return { status: 'completed', videoUrl: videos[0].url };
    }
    console.error(`[Kling ${tag}] Succeed but no video URL:`, JSON.stringify(taskData, null, 2));
    return { status: 'completed', error: 'Video completed but URL not found' };
  }

  if (taskStatus === 'failed') {
    const errorMsg = taskData.task_status_msg || taskData.task_result?.message || 'Video generation failed';
    console.error(`[Kling ${tag}] Task failed:`, errorMsg);
    return { status: 'failed', error: errorMsg };
  }

  // submitted, processing
  return { status: taskStatus || 'processing' };
}
