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

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'TikTok token exchange failed');
  }

  return data.data;
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

  if (data.error) {
    throw new Error(data.error.message || 'TikTok token refresh failed');
  }

  return data.data;
}

/**
 * Get user info (username, avatar, etc.)
 */
export async function getTikTokUserInfo(accessToken: string): Promise<TikTokUser> {
  const response = await fetch(
    `${TIKTOK_API_BASE}/v2/user/info/?fields=open_id,union_id,avatar_url,avatar_url_100,avatar_url_200,avatar_large_url,display_name`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Failed to get TikTok user info');
  }

  return data.data.user;
}

/**
 * Get user's published videos
 */
export async function getTikTokVideos(
  accessToken: string,
  maxCount: number = 20
): Promise<TikTokVideo[]> {
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

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Failed to fetch TikTok videos');
  }

  return data.data.videos || [];
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
        privacy_level: 'PUBLIC_TO_EVERYONE',
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
        privacy_level: 'PUBLIC_TO_EVERYONE',
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
