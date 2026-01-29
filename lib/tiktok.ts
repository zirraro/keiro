/**
 * TikTok API Helper Functions
 * Mirrors lib/meta.ts structure for Instagram
 */

const TIKTOK_API_BASE = 'https://open.tiktokapis.com';
const TIKTOK_AUTH_BASE = 'https://www.tiktok.com';

// Types
export type TikTokUser = {
  open_id: string;
  union_id: string;
  avatar_url: string;
  avatar_url_100: string;
  avatar_url_200: string;
  avatar_large_url: string;
  display_name: string;
};

export type TikTokVideo = {
  id: string;
  title: string;
  video_description: string;
  duration: number;
  cover_image_url: string;
  share_url: string;
  embed_link: string;
  create_time: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
};

export type TikTokTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // 86400 (24 hours)
  refresh_expires_in: number; // 31536000 (365 days)
  open_id: string;
  scope: string;
  token_type: string;
};

/**
 * Exchange authorization code for access token
 */
export async function exchangeTikTokCode(
  code: string,
  clientKey: string,
  clientSecret: string,
  redirectUri: string
): Promise<TikTokTokenResponse> {
  console.log('[TikTok] Exchanging code for tokens...', {
    hasCode: !!code,
    hasClientKey: !!clientKey,
    hasClientSecret: !!clientSecret,
    redirectUri
  });

  const response = await fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  console.log('[TikTok] Token exchange response status:', response.status);

  const data = await response.json();

  console.log('[TikTok] Token exchange response data:', {
    hasError: !!data.error,
    hasAccessToken: !!data.access_token,
    errorMessage: data.error?.message,
    errorCode: data.error?.code || data.error_code,
    message: data.message,
    fullResponse: JSON.stringify(data)
  });

  // Check for TikTok API errors (error_code !== 0 or error exists)
  if (!response.ok || data.error || (data.error_code && data.error_code !== 0)) {
    const errorMsg = data.error?.message || data.message || data.description || `HTTP ${response.status}: ${response.statusText}`;
    console.error('[TikTok] Token exchange failed:', errorMsg);
    throw new Error(`TikTok token exchange failed: ${errorMsg}`);
  }

  // TikTok OAuth response is at root level, not in data.data
  if (!data.access_token) {
    console.error('[TikTok] No access_token in response:', data);
    throw new Error('TikTok token exchange returned no access_token');
  }

  console.log('[TikTok] Token exchange successful');
  return data;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshTikTokToken(
  refreshToken: string,
  clientKey: string
): Promise<TikTokTokenResponse> {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: clientKey,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();

  if (data.error || (data.error_code && data.error_code !== 0)) {
    throw new Error(data.error?.message || data.message || 'TikTok token refresh failed');
  }

  if (!data.access_token) {
    throw new Error('TikTok token refresh returned no access_token');
  }

  return data;
}

/**
 * Get user info (username, avatar, etc.)
 */
export async function getTikTokUserInfo(accessToken: string): Promise<TikTokUser> {
  console.log('[TikTok] Fetching user info...');

  const response = await fetch(
    `${TIKTOK_API_BASE}/v2/user/info/?fields=open_id,union_id,avatar_url,avatar_url_100,avatar_url_200,avatar_large_url,display_name`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  console.log('[TikTok] User info response status:', response.status);

  const data = await response.json();

  console.log('[TikTok] User info response data:', {
    hasError: !!data.error,
    hasData: !!data.data,
    hasUser: !!(data.data?.user),
    errorMessage: data.error?.message,
    errorCode: data.error?.code || data.error_code,
    message: data.message,
    fullResponse: JSON.stringify(data)
  });

  if (!response.ok || data.error || (data.error_code && data.error_code !== 0)) {
    const errorMsg = data.error?.message || data.message || data.description || `HTTP ${response.status}: ${response.statusText}`;
    console.error('[TikTok] User info failed:', errorMsg);
    throw new Error(`Failed to get TikTok user info: ${errorMsg}`);
  }

  if (!data.data?.user) {
    console.error('[TikTok] No user in response:', data);
    throw new Error('TikTok user info returned no user data');
  }

  console.log('[TikTok] User info successful:', {
    open_id: data.data.user.open_id,
    display_name: data.data.user.display_name
  });

  return data.data.user;
}

/**
 * Get user's published videos
 */
export async function getTikTokVideos(
  accessToken: string,
  maxCount: number = 20
): Promise<TikTokVideo[]> {
  console.log('[TikTok] Fetching videos, max_count:', maxCount);

  const response = await fetch(
    `${TIKTOK_API_BASE}/v2/video/list/?fields=id,title,video_description,duration,cover_image_url,share_url,embed_link,create_time&max_count=${maxCount}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );

  console.log('[TikTok] Video list response status:', response.status);

  const data = await response.json();

  console.log('[TikTok] Video list response:', {
    hasError: !!data.error,
    errorCode: data.error?.code || data.error_code,
    message: data.error?.message || data.message,
    hasData: !!data.data,
    videoCount: data.data?.videos?.length || 0,
    fullResponse: JSON.stringify(data)
  });

  // Check for HTTP errors first
  if (!response.ok) {
    const errorMsg = data.error?.message || data.message || `HTTP ${response.status}: ${response.statusText}`;
    console.error('[TikTok] Video list HTTP error:', response.status, errorMsg);

    // Enhanced scope/permission error detection for video.list
    if (response.status === 403 || response.status === 401) {
      throw new Error('SCOPE_ERROR: Insufficient permissions. Please reconnect your TikTok account to grant video.list access.');
    }

    throw new Error(errorMsg);
  }

  // Check for API-level errors
  if (data.error || (data.error_code && data.error_code !== 0)) {
    const errorMsg = data.error?.message || data.message || 'Failed to fetch TikTok videos';
    console.error('[TikTok] Video list API error:', {
      code: data.error?.code || data.error_code,
      message: errorMsg,
      fullError: JSON.stringify(data.error || data)
    });

    // Detect scope/permission errors
    const errorLower = errorMsg.toLowerCase();
    if (errorLower.includes('scope') || errorLower.includes('permission') ||
        errorLower.includes('forbidden') || errorLower.includes('unauthorized')) {
      throw new Error('SCOPE_ERROR: ' + errorMsg);
    }

    throw new Error(errorMsg);
  }

  const videos = data.data?.videos || [];
  console.log('[TikTok] Successfully fetched', videos.length, 'videos');

  return videos;
}

/**
 * Initialize video upload (Step 1 of 3)
 */
export async function initTikTokVideoUpload(
  accessToken: string,
  videoSize: number,
  chunkSize: number = 10485760, // 10MB default
  totalChunkCount: number = 1
): Promise<{ publish_id: string; upload_url: string }> {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: {
        title: '',
        privacy_level: 'SELF_ONLY', // Required for unaudited apps per TikTok guidelines
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Failed to initialize TikTok upload');
  }

  return data.data;
}

/**
 * Upload video bytes to TikTok (Step 2 of 3)
 */
export async function uploadTikTokVideoBytes(
  uploadUrl: string,
  videoBuffer: Buffer
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': videoBuffer.length.toString(),
    },
    body: new Uint8Array(videoBuffer),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload video bytes: ${response.statusText}`);
  }
}

/**
 * Publish video to TikTok (Step 3 of 3)
 */
export async function publishTikTokVideo(
  accessToken: string,
  publishId: string
): Promise<{ publish_id: string }> {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      publish_id: publishId,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Failed to publish TikTok video');
  }

  return data.data;
}

/**
 * Publish video using PULL_FROM_URL (recommended for server-side content)
 * This is simpler than FILE_UPLOAD as TikTok downloads the video directly
 *
 * @param accessToken - TikTok access token
 * @param videoUrl - Public URL where TikTok can download the video
 * @param caption - Video caption/description
 * @param options - Additional options for the post
 * @returns Publish ID for tracking
 */
export async function publishTikTokVideoFromUrl(
  accessToken: string,
  videoUrl: string,
  caption: string = '',
  options?: {
    disable_duet?: boolean;
    disable_comment?: boolean;
    disable_stitch?: boolean;
    video_cover_timestamp_ms?: number;
  }
): Promise<{ publish_id: string }> {
  console.log('[TikTok] Publishing video from URL (PULL_FROM_URL method)');
  console.log('[TikTok] Video URL:', videoUrl);
  console.log('[TikTok] Caption:', caption.substring(0, 100));

  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: {
        title: caption.substring(0, 150), // TikTok max title length
        privacy_level: 'SELF_ONLY', // Required for unaudited apps
        disable_duet: options?.disable_duet ?? false,
        disable_comment: options?.disable_comment ?? false,
        disable_stitch: options?.disable_stitch ?? false,
        video_cover_timestamp_ms: options?.video_cover_timestamp_ms ?? 1000,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl, // TikTok downloads directly from this URL
      },
    }),
  });

  console.log('[TikTok] PULL_FROM_URL response status:', response.status);

  const data = await response.json();

  console.log('[TikTok] PULL_FROM_URL response:', {
    hasError: !!data.error,
    hasData: !!data.data,
    errorCode: data.error?.code || data.error_code,
    message: data.error?.message || data.message
  });

  if (data.error || (data.error_code && data.error_code !== 0)) {
    const errorMsg = data.error?.message || data.message || 'Failed to publish TikTok video';
    console.error('[TikTok] PULL_FROM_URL error:', errorMsg);
    throw new Error(errorMsg);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const publishId = data.data?.publish_id || data.publish_id;

  if (!publishId) {
    console.error('[TikTok] No publish_id in response:', data);
    throw new Error('No publish_id returned from TikTok');
  }

  console.log('[TikTok] Video published successfully via PULL_FROM_URL:', publishId);

  return { publish_id: publishId };
}

/**
 * Initialize photo post (carousel) upload
 */
export async function initTikTokPhotoUpload(
  accessToken: string,
  photoUrls: string[],
  title: string,
  description?: string
): Promise<{ publish_id: string }> {
  if (photoUrls.length > 35) {
    throw new Error('TikTok photo posts support max 35 images');
  }

  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/inbox/video/init/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: {
        title: title || '',
        description: description || '',
        privacy_level: 'SELF_ONLY', // Required for unaudited apps per TikTok guidelines
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_images: photoUrls,
      },
      post_mode: 'PHOTO_MODE',
      media_type: 'PHOTO',
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Failed to initialize TikTok photo upload');
  }

  return data.data;
}

/**
 * Publish video using FILE_UPLOAD method
 * Downloads video from URL and uploads bytes directly to TikTok
 * Use this method when the video URL domain cannot be verified (e.g., Supabase Storage)
 *
 * @param accessToken - TikTok access token
 * @param videoUrl - Public URL where to download the video
 * @param caption - Video caption/description
 * @param options - Additional options for the post
 * @returns Publish ID for tracking
 */
export async function publishTikTokVideoViaFileUpload(
  accessToken: string,
  videoUrl: string,
  caption: string = '',
  options?: {
    disable_duet?: boolean;
    disable_comment?: boolean;
    disable_stitch?: boolean;
    video_cover_timestamp_ms?: number;
  }
): Promise<{ publish_id: string }> {
  console.log('[TikTok] Publishing video via FILE_UPLOAD method');
  console.log('[TikTok] Video URL:', videoUrl);
  console.log('[TikTok] Caption:', caption.substring(0, 100));

  // Step 1: Download video from URL
  console.log('[TikTok] Downloading video...');
  const videoResponse = await fetch(videoUrl);

  if (!videoResponse.ok) {
    throw new Error(`Failed to download video: ${videoResponse.statusText}`);
  }

  const videoArrayBuffer = await videoResponse.arrayBuffer();
  const videoBuffer = Buffer.from(videoArrayBuffer);
  const videoSize = videoBuffer.length;

  console.log('[TikTok] Video downloaded, size:', videoSize, 'bytes');
  console.log('[TikTok] Video size (MB):', (videoSize / (1024 * 1024)).toFixed(2), 'MB');

  // Step 2: Determine chunk configuration (following TikTok rules)
  // TikTok Requirements:
  // 1. Min chunk size: 5MB
  // 2. Max chunk size: 64MB
  // 3. All chunks EXCEPT last must be EXACTLY chunk_size
  // 4. Last chunk must be >= 5MB AND <= chunk_size
  const MIN_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB minimum
  const MAX_CHUNK_SIZE = 64 * 1024 * 1024; // 64MB maximum
  const PREFERRED_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB preferred

  console.log('[TikTok] Chunk size constraints:', {
    MIN_MB: (MIN_CHUNK_SIZE / (1024 * 1024)).toFixed(2) + 'MB',
    MAX_MB: (MAX_CHUNK_SIZE / (1024 * 1024)).toFixed(2) + 'MB',
    PREFERRED_MB: (PREFERRED_CHUNK_SIZE / (1024 * 1024)).toFixed(2) + 'MB'
  });

  let chunkSize: number;
  let totalChunkCount: number;

  if (videoSize < MIN_CHUNK_SIZE) {
    // Videos < 5MB must be uploaded as whole
    console.log('[TikTok] Video smaller than 5MB, uploading as single chunk');
    chunkSize = videoSize;
    totalChunkCount = 1;
  } else {
    // Start with preferred chunk size
    const initialChunkSize = PREFERRED_CHUNK_SIZE;
    const completeChunks = Math.floor(videoSize / initialChunkSize);
    const remainder = videoSize % initialChunkSize;

    console.log('[TikTok] Initial calculation with preferred chunk size:', {
      initialChunkSize_MB: (initialChunkSize / (1024 * 1024)).toFixed(2) + 'MB',
      completeChunks,
      remainder_bytes: remainder,
      remainder_MB: (remainder / (1024 * 1024)).toFixed(2) + 'MB'
    });

    if (remainder === 0) {
      // Perfect division - all chunks are exactly PREFERRED_CHUNK_SIZE
      console.log('[TikTok] ✓ Perfect division, no remainder');
      chunkSize = initialChunkSize;
      totalChunkCount = completeChunks;
    } else if (remainder >= MIN_CHUNK_SIZE) {
      // Remainder is large enough to be its own chunk
      console.log('[TikTok] ✓ Remainder >= 5MB, will be separate chunk');

      // CRITICAL FIX: If video is smaller than PREFERRED_CHUNK_SIZE (completeChunks = 0),
      // we must use videoSize as chunk_size, not PREFERRED_CHUNK_SIZE!
      // TikTok rejects when declared chunk_size > video_size
      if (completeChunks === 0) {
        console.log('[TikTok] ⚠ Video smaller than preferred chunk size (completeChunks = 0)');
        console.log('[TikTok] Using videoSize as chunk_size to match TikTok requirements');
        chunkSize = videoSize;
        totalChunkCount = 1;
      } else {
        chunkSize = initialChunkSize;
        totalChunkCount = completeChunks + 1;
      }
    } else {
      // Remainder < 5MB - CRITICAL CASE
      // We need to redistribute bytes so last chunk is >= 5MB
      console.log('[TikTok] ⚠ Remainder < 5MB, redistribution required');
      console.log('[TikTok] Redistribution: will use', completeChunks, 'chunks total (merge remainder with chunks)');

      // Calculate adjusted chunk size that evenly distributes the video
      // This ensures last chunk will be >= 5MB
      const adjustedChunkSize = Math.ceil(videoSize / completeChunks);

      console.log('[TikTok] Adjusted chunk size calculated:', {
        adjustedChunkSize_bytes: adjustedChunkSize,
        adjustedChunkSize_MB: (adjustedChunkSize / (1024 * 1024)).toFixed(2) + 'MB'
      });

      // Verify adjusted chunk size is within TikTok limits
      if (adjustedChunkSize > MAX_CHUNK_SIZE) {
        console.error('[TikTok] ❌ Adjusted chunk size exceeds maximum!');
        throw new Error(`Adjusted chunk size ${(adjustedChunkSize / (1024 * 1024)).toFixed(2)}MB exceeds maximum ${(MAX_CHUNK_SIZE / (1024 * 1024)).toFixed(2)}MB`);
      }

      // CRITICAL: Verify that last chunk will actually be >= 5MB
      const lastChunkSize = videoSize - (completeChunks - 1) * adjustedChunkSize;
      console.log('[TikTok] Last chunk size verification:', {
        lastChunkSize_bytes: lastChunkSize,
        lastChunkSize_MB: (lastChunkSize / (1024 * 1024)).toFixed(2) + 'MB',
        meets_minimum: lastChunkSize >= MIN_CHUNK_SIZE ? '✓' : '❌'
      });

      if (lastChunkSize < MIN_CHUNK_SIZE) {
        console.error('[TikTok] ❌ ALGORITHM ERROR: Last chunk would be < 5MB!');
        throw new Error(`Algorithm error: Last chunk size ${(lastChunkSize / (1024 * 1024)).toFixed(2)}MB is below 5MB minimum`);
      }

      if (lastChunkSize > adjustedChunkSize) {
        console.error('[TikTok] ❌ ALGORITHM ERROR: Last chunk exceeds declared chunk_size!');
        throw new Error(`Algorithm error: Last chunk size ${lastChunkSize} exceeds declared chunk_size ${adjustedChunkSize}`);
      }

      chunkSize = adjustedChunkSize;
      totalChunkCount = completeChunks;
      console.log('[TikTok] ✓ Redistribution validated successfully');
    }
  }

  // FINAL VERIFICATION: Calculate and verify each chunk size BEFORE sending to TikTok
  console.log('[TikTok] === FINAL CHUNK CONFIGURATION VERIFICATION ===');
  console.log('[TikTok] Declared chunk_size:', chunkSize, 'bytes (', (chunkSize / (1024 * 1024)).toFixed(2), 'MB)');
  console.log('[TikTok] Total chunks:', totalChunkCount);

  const chunkSizes: number[] = [];
  for (let i = 0; i < totalChunkCount; i++) {
    const firstByte = i * chunkSize;
    const lastByte = (i === totalChunkCount - 1) ? videoSize - 1 : firstByte + chunkSize - 1;
    const actualChunkSize = lastByte - firstByte + 1;
    chunkSizes.push(actualChunkSize);

    const isLast = i === totalChunkCount - 1;
    console.log(`[TikTok] Chunk ${i + 1}/${totalChunkCount}:`, {
      bytes: actualChunkSize,
      MB: (actualChunkSize / (1024 * 1024)).toFixed(2) + 'MB',
      range: `${firstByte}-${lastByte}`,
      isLast
    });

    // Verify chunk size constraints
    if (!isLast && actualChunkSize !== chunkSize) {
      console.error('[TikTok] ❌ VERIFICATION FAILED: Intermediate chunk size mismatch!');
      throw new Error(`Chunk ${i + 1} size ${actualChunkSize} does not match declared chunk_size ${chunkSize}`);
    }

    if (isLast && actualChunkSize > chunkSize) {
      console.error('[TikTok] ❌ VERIFICATION FAILED: Last chunk exceeds declared chunk_size!');
      throw new Error(`Last chunk size ${actualChunkSize} exceeds declared chunk_size ${chunkSize}`);
    }

    if (isLast && actualChunkSize < MIN_CHUNK_SIZE) {
      console.error('[TikTok] ❌ VERIFICATION FAILED: Last chunk below 5MB minimum!');
      throw new Error(`Last chunk size ${(actualChunkSize / (1024 * 1024)).toFixed(2)}MB is below 5MB minimum`);
    }
  }

  const totalBytes = chunkSizes.reduce((sum, size) => sum + size, 0);
  console.log('[TikTok] Total bytes verification:', {
    sum_of_chunks: totalBytes,
    expected_videoSize: videoSize,
    match: totalBytes === videoSize ? '✓' : '❌'
  });

  if (totalBytes !== videoSize) {
    console.error('[TikTok] ❌ VERIFICATION FAILED: Chunk sizes do not sum to video size!');
    throw new Error(`Chunk sizes sum to ${totalBytes} but video size is ${videoSize}`);
  }

  console.log('[TikTok] ✅ All chunk size verifications passed!');

  // Step 3: Initialize upload with TikTok
  console.log('[TikTok] Initializing TikTok upload...');
  const initResponse = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: {
        title: caption.substring(0, 150), // TikTok max title length
        privacy_level: 'SELF_ONLY', // Required for unaudited apps
        disable_duet: options?.disable_duet ?? false,
        disable_comment: options?.disable_comment ?? false,
        disable_stitch: options?.disable_stitch ?? false,
        video_cover_timestamp_ms: options?.video_cover_timestamp_ms ?? 1000,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    }),
  });

  console.log('[TikTok] Init response status:', initResponse.status);

  const initData = await initResponse.json();

  console.log('[TikTok] Init response:', {
    hasError: !!initData.error,
    hasData: !!initData.data,
    errorCode: initData.error?.code || initData.error_code,
    message: initData.error?.message || initData.message
  });

  if (initData.error || (initData.error_code && initData.error_code !== 0)) {
    const errorMsg = initData.error?.message || initData.message || 'Failed to initialize TikTok upload';
    console.error('[TikTok] Init error:', errorMsg);
    throw new Error(errorMsg);
  }

  if (!initResponse.ok) {
    throw new Error(`HTTP ${initResponse.status}: ${initResponse.statusText}`);
  }

  const uploadUrl = initData.data?.upload_url;
  const publishId = initData.data?.publish_id;

  if (!uploadUrl || !publishId) {
    console.error('[TikTok] Missing upload_url or publish_id in response:', initData);
    throw new Error('No upload_url or publish_id returned from TikTok');
  }

  console.log('[TikTok] Upload initialized, publish_id:', publishId);

  // Step 4: Upload video chunks
  console.log('[TikTok] === STARTING CHUNK UPLOAD ===');
  console.log('[TikTok] Upload URL:', uploadUrl.substring(0, 50) + '...');

  for (let chunkIndex = 0; chunkIndex < totalChunkCount; chunkIndex++) {
    const isLastChunk = chunkIndex === totalChunkCount - 1;
    const firstByte = chunkIndex * chunkSize;

    // For the last chunk, always extend to the end of the video
    // This handles both cases: remainder as separate chunk OR merged with last chunk
    const lastByte = isLastChunk ? videoSize - 1 : firstByte + chunkSize - 1;

    const chunkBuffer = videoBuffer.slice(firstByte, lastByte + 1);
    const chunkActualSize = chunkBuffer.length;

    console.log(`[TikTok] === Uploading chunk ${chunkIndex + 1}/${totalChunkCount} ===`);
    console.log(`[TikTok] Chunk details:`, {
      isLast: isLastChunk,
      firstByte,
      lastByte,
      actualSize_bytes: chunkActualSize,
      actualSize_MB: (chunkActualSize / (1024 * 1024)).toFixed(2) + 'MB',
      declaredChunkSize_bytes: chunkSize,
      declaredChunkSize_MB: (chunkSize / (1024 * 1024)).toFixed(2) + 'MB',
      contentRange: `bytes ${firstByte}-${lastByte}/${videoSize}`
    });

    // Double-check chunk size matches our verification
    if (!isLastChunk && chunkActualSize !== chunkSize) {
      console.error('[TikTok] ❌ CRITICAL: Chunk size mismatch detected at upload time!');
      throw new Error(`Chunk ${chunkIndex + 1} actual size ${chunkActualSize} does not match declared ${chunkSize}`);
    }

    if (isLastChunk && chunkActualSize > chunkSize) {
      console.error('[TikTok] ❌ CRITICAL: Last chunk exceeds declared chunk_size!');
      throw new Error(`Last chunk actual size ${chunkActualSize} exceeds declared ${chunkSize}`);
    }

    if (isLastChunk && chunkActualSize < MIN_CHUNK_SIZE) {
      console.error('[TikTok] ❌ CRITICAL: Last chunk below 5MB minimum!');
      throw new Error(`Last chunk size ${(chunkActualSize / (1024 * 1024)).toFixed(2)}MB is below 5MB minimum`);
    }

    console.log(`[TikTok] ✓ Chunk size validation passed, uploading to TikTok...`);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': chunkActualSize.toString(),
        'Content-Range': `bytes ${firstByte}-${lastByte}/${videoSize}`,
      },
      body: chunkBuffer,
    });

    console.log(`[TikTok] Chunk ${chunkIndex + 1} upload response:`, {
      status: uploadResponse.status,
      statusText: uploadResponse.statusText,
      expectedStatus: isLastChunk ? '201 (Created)' : '206 (Partial Content)'
    });

    // Expected responses: 206 (Partial Content) for intermediate chunks, 201 (Created) for last chunk
    if (uploadResponse.status !== 206 && uploadResponse.status !== 201) {
      const errorText = await uploadResponse.text().catch(() => 'Unknown error');
      console.error('[TikTok] ❌ Chunk upload failed:', errorText);
      throw new Error(`Failed to upload chunk ${chunkIndex + 1}: ${uploadResponse.status} ${errorText}`);
    }

    console.log(`[TikTok] ✅ Chunk ${chunkIndex + 1}/${totalChunkCount} uploaded successfully`);

    // For last chunk, expect 201
    if (chunkIndex === totalChunkCount - 1 && uploadResponse.status !== 201) {
      console.warn('[TikTok] Warning: Last chunk did not return 201 Created');
    }
  }

  console.log('[TikTok] All chunks uploaded successfully');
  console.log('[TikTok] Video published successfully via FILE_UPLOAD:', publishId);

  return { publish_id: publishId };
}
