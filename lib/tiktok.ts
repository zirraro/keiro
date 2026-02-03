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

  // TikTok ALWAYS returns an error object, even on success
  // Check error.code !== 'ok' to detect real errors
  const isRealError = data.error && data.error.code && data.error.code !== 'ok';

  if (!response.ok || isRealError || (data.error_code && data.error_code !== 0)) {
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

  // TikTok ALWAYS returns an error object, even on success
  const isRealError = data.error && data.error.code && data.error.code !== 'ok';

  if (isRealError || (data.error_code && data.error_code !== 0)) {
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

  // TikTok ALWAYS returns an error object, even on success
  // Check error.code !== 'ok' to detect real errors
  const isRealError = data.error && data.error.code && data.error.code !== 'ok';

  if (!response.ok || isRealError || (data.error_code && data.error_code !== 0)) {
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

  // TikTok ALWAYS returns an error object, even on success
  const isRealError = data.error && data.error.code && data.error.code !== 'ok';

  // Check for API-level errors
  if (isRealError || (data.error_code && data.error_code !== 0)) {
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

  // TikTok ALWAYS returns an error object, even on success
  const isRealError = data.error && data.error.code && data.error.code !== 'ok';

  if (isRealError || (data.error_code && data.error_code !== 0)) {
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
 * Get creator info - REQUIRED before posting per TikTok guidelines
 * Checks if creator can post and validates video duration limits
 *
 * @param accessToken - TikTok access token
 * @returns Creator info including posting limits and capabilities
 */
export async function getCreatorInfo(accessToken: string): Promise<{
  can_post: boolean;
  max_video_post_duration_sec: number;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
}> {
  console.log('[TikTok] Fetching creator info...');

  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  console.log('[TikTok] Creator info response status:', response.status);

  const data = await response.json();

  console.log('[TikTok] Creator info response:', {
    hasError: !!data.error,
    hasData: !!data.data,
    errorCode: data.error?.code || data.error_code,
    message: data.error?.message || data.message
  });

  // TikTok ALWAYS returns an error object, even on success
  const isRealError = data.error && data.error.code && data.error.code !== 'ok';

  if (isRealError || (data.error_code && data.error_code !== 0)) {
    const errorMsg = data.error?.message || data.message || 'Failed to get creator info';
    console.error('[TikTok] Creator info error:', errorMsg);
    throw new Error(errorMsg);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const creatorInfo = data.data;
  console.log('[TikTok] Creator info:', {
    max_video_duration: creatorInfo.max_video_post_duration_sec,
    privacy_options: creatorInfo.privacy_level_options,
    comment_disabled: creatorInfo.comment_disabled,
    duet_disabled: creatorInfo.duet_disabled,
    stitch_disabled: creatorInfo.stitch_disabled
  });

  return {
    can_post: true, // If we get here without errors, creator can post
    max_video_post_duration_sec: creatorInfo.max_video_post_duration_sec || 600,
    privacy_level_options: creatorInfo.privacy_level_options || ['SELF_ONLY'],
    comment_disabled: creatorInfo.comment_disabled || false,
    duet_disabled: creatorInfo.duet_disabled || false,
    stitch_disabled: creatorInfo.stitch_disabled || false,
  };
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

  // Step 0: Check creator info (REQUIRED by TikTok guidelines)
  console.log('[TikTok] === STEP 0: VERIFY CREATOR CAN POST ===');
  let maxVideoDuration = 600; // Default to 10 minutes if check fails

  try {
    const creatorInfo = await getCreatorInfo(accessToken);

    if (!creatorInfo.can_post) {
      console.error('[TikTok] ❌ Creator cannot post at this time (daily limit reached)');
      throw new Error('You have reached the daily posting limit. Please try again later.');
    }

    console.log('[TikTok] ✓ Creator can post');
    console.log('[TikTok] Max video duration:', creatorInfo.max_video_post_duration_sec, 'seconds');
    console.log('[TikTok] Privacy options:', creatorInfo.privacy_level_options.join(', '));

    maxVideoDuration = creatorInfo.max_video_post_duration_sec;
  } catch (error: any) {
    if (error.message.includes('daily limit') || error.message.includes('cannot post')) {
      throw error; // Re-throw limit errors
    }
    // If creator_info fails, log but continue (might be API issue)
    console.warn('[TikTok] ⚠ Creator info check failed, continuing with default max duration:', maxVideoDuration, 'seconds');
  }

  // Step 1: Download video from URL
  console.log('[TikTok] === STEP 1: DOWNLOAD VIDEO ===');
  console.log('[TikTok] Downloading video from URL...');
  const videoResponse = await fetch(videoUrl);

  if (!videoResponse.ok) {
    throw new Error(`Failed to download video: ${videoResponse.statusText}`);
  }

  const videoArrayBuffer = await videoResponse.arrayBuffer();
  const videoBuffer = Buffer.from(videoArrayBuffer);
  const videoSize = videoBuffer.length;

  console.log('[TikTok] Video downloaded, size:', videoSize, 'bytes');
  console.log('[TikTok] Video size (MB):', (videoSize / (1024 * 1024)).toFixed(2), 'MB');
  console.log('[TikTok] ⚠ Duration validation skipped (requires native binaries incompatible with serverless)');
  console.log('[TikTok] Max allowed duration from creator_info:', maxVideoDuration, 'seconds - TikTok will reject if exceeded');

  // Step 2: ADAPTIVE CHUNK CONFIGURATION
  // TikTok Requirements:
  // 1. Min chunk size: 5MB (strictly enforced)
  // 2. Max chunk size: 64MB (hard limit)
  // 3. All chunks EXCEPT last must be EXACTLY chunk_size
  // 4. Last chunk must be >= 5MB AND <= chunk_size
  // 5. chunk_size declared to TikTok MUST match the actual chunk sizes sent

  const MIN_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB minimum
  const MAX_CHUNK_SIZE = 64 * 1024 * 1024; // 64MB maximum
  const PREFERRED_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB preferred (adaptive)

  console.log('[TikTok] === ADAPTIVE CHUNK CALCULATION ===');
  console.log('[TikTok] Video size:', videoSize, 'bytes', `(${(videoSize / (1024 * 1024)).toFixed(2)} MB)`);
  console.log('[TikTok] Constraints: min=5MB, max=64MB, preferred=10MB');

  let chunkSize: number;
  let totalChunkCount: number;

  // UNIVERSAL ALGORITHM - Works for ANY video size
  if (videoSize < MIN_CHUNK_SIZE) {
    // Case 1: Video < 5MB
    // Must upload as single chunk (can't split below minimum)
    console.log('[TikTok] Case 1: Video < 5MB → single chunk = videoSize');
    chunkSize = videoSize;
    totalChunkCount = 1;

  } else if (videoSize <= PREFERRED_CHUNK_SIZE) {
    // Case 2: Video 5MB - 10MB
    // Upload as single chunk (more efficient than splitting)
    console.log('[TikTok] Case 2: Video 5-10MB → single chunk = videoSize');
    chunkSize = videoSize;
    totalChunkCount = 1;

  } else {
    // Case 3: Video > 10MB
    // Need to calculate optimal chunking strategy
    console.log('[TikTok] Case 3: Video > 10MB → calculating optimal chunks');

    const completeChunks = Math.floor(videoSize / PREFERRED_CHUNK_SIZE);
    const remainder = videoSize % PREFERRED_CHUNK_SIZE;

    console.log('[TikTok] Division analysis:', {
      completeChunks: completeChunks,
      remainder_bytes: remainder,
      remainder_MB: (remainder / (1024 * 1024)).toFixed(2) + 'MB'
    });

    if (remainder === 0) {
      // Case 3a: Perfect division (e.g., 20MB, 30MB, 40MB...)
      // All chunks are exactly PREFERRED_CHUNK_SIZE
      console.log('[TikTok] ✓ Perfect division: all chunks = 10MB');
      chunkSize = PREFERRED_CHUNK_SIZE;
      totalChunkCount = completeChunks;

    } else if (remainder >= MIN_CHUNK_SIZE) {
      // Case 3b: Remainder is large enough (>= 5MB)
      // Can use remainder as final chunk
      console.log('[TikTok] ✓ Remainder >= 5MB: can be final chunk');
      chunkSize = PREFERRED_CHUNK_SIZE;
      totalChunkCount = completeChunks + 1;

    } else {
      // Case 3c: Remainder < 5MB (CRITICAL CASE)
      // Must redistribute to ensure last chunk >= 5MB
      console.log('[TikTok] ⚠ Remainder < 5MB: redistribution required');
      console.log('[TikTok] Strategy: distribute across', completeChunks, 'chunks (no separate remainder)');

      // Redistribute video across completeChunks (NOT completeChunks+1)
      // This merges the remainder into the chunks
      const adjustedChunkSize = Math.ceil(videoSize / completeChunks);

      console.log('[TikTok] Adjusted chunk_size:', adjustedChunkSize, 'bytes', `(${(adjustedChunkSize / (1024 * 1024)).toFixed(2)} MB)`);

      // Safety checks
      if (adjustedChunkSize > MAX_CHUNK_SIZE) {
        console.error('[TikTok] ❌ Adjusted chunk_size exceeds 64MB limit!');
        throw new Error(`Adjusted chunk size ${(adjustedChunkSize / (1024 * 1024)).toFixed(2)}MB exceeds TikTok maximum of 64MB`);
      }

      // Verify last chunk will meet requirements
      const lastChunkSize = videoSize - (completeChunks - 1) * adjustedChunkSize;
      console.log('[TikTok] Last chunk verification:', {
        size_bytes: lastChunkSize,
        size_MB: (lastChunkSize / (1024 * 1024)).toFixed(2) + 'MB',
        meets_5MB_min: lastChunkSize >= MIN_CHUNK_SIZE ? '✓ YES' : '❌ NO',
        within_chunk_size: lastChunkSize <= adjustedChunkSize ? '✓ YES' : '❌ NO'
      });

      if (lastChunkSize < MIN_CHUNK_SIZE) {
        console.error('[TikTok] ❌ ALGORITHM ERROR: Last chunk < 5MB!');
        throw new Error(`Last chunk ${(lastChunkSize / (1024 * 1024)).toFixed(2)}MB is below 5MB minimum`);
      }

      if (lastChunkSize > adjustedChunkSize) {
        console.error('[TikTok] ❌ ALGORITHM ERROR: Last chunk > declared chunk_size!');
        throw new Error(`Last chunk ${lastChunkSize} bytes exceeds declared chunk_size ${adjustedChunkSize} bytes`);
      }

      chunkSize = adjustedChunkSize;
      totalChunkCount = completeChunks;
      console.log('[TikTok] ✓ Redistribution strategy validated');
    }
  }

  console.log('[TikTok] === FINAL ADAPTIVE CONFIGURATION ===');
  console.log('[TikTok] Strategy:',
    videoSize < MIN_CHUNK_SIZE ? 'Single chunk (< 5MB)' :
    videoSize <= PREFERRED_CHUNK_SIZE ? 'Single chunk (5-10MB)' :
    totalChunkCount === Math.floor(videoSize / PREFERRED_CHUNK_SIZE) ? 'Redistributed chunks' :
    'Standard chunks with remainder'
  );

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

    if (isLast && actualChunkSize < MIN_CHUNK_SIZE && totalChunkCount > 1) {
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

  // TikTok ALWAYS returns an error object, even on success
  // Check error.code !== 'ok' to detect real errors
  const isRealError = initData.error && initData.error.code && initData.error.code !== 'ok';

  if (isRealError || (initData.error_code && initData.error_code !== 0)) {
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

    if (isLastChunk && chunkActualSize < MIN_CHUNK_SIZE && totalChunkCount > 1) {
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
