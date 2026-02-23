/**
 * Kling AI Video Generation Helper
 *
 * JWT authentication + API helpers for text-to-video and image-to-video.
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
