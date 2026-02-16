/**
 * LinkedIn API Helper Functions
 * REST API v2 with OpenID Connect
 */

const LINKEDIN_API_VERSION = '202401';

// Types
export type LinkedInUserInfo = {
  sub: string;       // LinkedIn member URN (e.g., "abc123")
  name: string;
  email: string;
  picture?: string;
};

export type LinkedInTokenResponse = {
  access_token: string;
  expires_in: number; // 5184000 (60 days)
  scope: string;
};

/**
 * Exchange authorization code for access token
 */
export async function exchangeLinkedInCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<LinkedInTokenResponse> {
  console.log('[LinkedIn] Exchanging code for tokens...');

  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    const errorMsg = data.error_description || data.error || `HTTP ${response.status}`;
    console.error('[LinkedIn] Token exchange failed:', errorMsg);
    throw new Error(`LinkedIn token exchange failed: ${errorMsg}`);
  }

  if (!data.access_token) {
    throw new Error('LinkedIn token exchange returned no access_token');
  }

  console.log('[LinkedIn] Token exchange successful, expires_in:', data.expires_in);
  return data;
}

/**
 * Get user info via OpenID Connect userinfo endpoint
 */
export async function getLinkedInUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
  console.log('[LinkedIn] Fetching user info...');

  const response = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data.message || data.error || `HTTP ${response.status}`;
    console.error('[LinkedIn] User info failed:', errorMsg);
    throw new Error(`Failed to get LinkedIn user info: ${errorMsg}`);
  }

  console.log('[LinkedIn] User info received:', { sub: data.sub, name: data.name });

  return {
    sub: data.sub,
    name: data.name,
    email: data.email,
    picture: data.picture,
  };
}

/**
 * Publish a text-only post on LinkedIn
 */
export async function publishLinkedInTextPost(
  accessToken: string,
  authorUrn: string,
  text: string
): Promise<any> {
  console.log('[LinkedIn] Publishing text post...');

  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${authorUrn}`,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
    }),
  });

  if (response.status === 201) {
    const postId = response.headers.get('x-restli-id');
    console.log('[LinkedIn] Text post published, id:', postId);
    return { ok: true, postId };
  }

  const data = await response.json().catch(() => ({}));
  const errorMsg = data.message || data.error || `HTTP ${response.status}`;
  console.error('[LinkedIn] Text post failed:', errorMsg);
  throw new Error(`LinkedIn post failed: ${errorMsg}`);
}

/**
 * Upload an image to LinkedIn and get the image URN
 */
export async function uploadLinkedInImage(
  accessToken: string,
  authorUrn: string,
  imageUrl: string
): Promise<string> {
  console.log('[LinkedIn] Initializing image upload...');

  // Step 1: Initialize upload
  const initResponse = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: `urn:li:person:${authorUrn}`,
      },
    }),
  });

  const initData = await initResponse.json();

  if (!initResponse.ok) {
    const errorMsg = initData.message || `HTTP ${initResponse.status}`;
    throw new Error(`LinkedIn image upload init failed: ${errorMsg}`);
  }

  const uploadUrl = initData.value?.uploadUrl;
  const imageUrn = initData.value?.image;

  if (!uploadUrl || !imageUrn) {
    throw new Error('LinkedIn image upload init returned no uploadUrl or image URN');
  }

  console.log('[LinkedIn] Image URN:', imageUrn);

  // Step 2: Download image from URL
  console.log('[LinkedIn] Downloading image from:', imageUrl.substring(0, 80));
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.statusText}`);
  }
  const imageBuffer = await imageResponse.arrayBuffer();

  // Step 3: Upload image bytes to LinkedIn
  console.log('[LinkedIn] Uploading image bytes, size:', imageBuffer.byteLength);
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: imageBuffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => '');
    throw new Error(`LinkedIn image upload failed: ${uploadResponse.status} ${errorText}`);
  }

  console.log('[LinkedIn] Image uploaded successfully');
  return imageUrn;
}

/**
 * Publish an image post on LinkedIn
 */
export async function publishLinkedInImagePost(
  accessToken: string,
  authorUrn: string,
  text: string,
  imageUrn: string
): Promise<any> {
  console.log('[LinkedIn] Publishing image post...');

  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${authorUrn}`,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      content: {
        media: {
          title: 'Post image',
          id: imageUrn,
        },
      },
    }),
  });

  if (response.status === 201) {
    const postId = response.headers.get('x-restli-id');
    console.log('[LinkedIn] Image post published, id:', postId);
    return { ok: true, postId };
  }

  const data = await response.json().catch(() => ({}));
  const errorMsg = data.message || data.error || `HTTP ${response.status}`;
  console.error('[LinkedIn] Image post failed:', errorMsg);
  throw new Error(`LinkedIn image post failed: ${errorMsg}`);
}

/**
 * Upload a video to LinkedIn and get the video URN
 */
export async function uploadLinkedInVideo(
  accessToken: string,
  authorUrn: string,
  videoUrl: string
): Promise<string> {
  console.log('[LinkedIn] Initializing video upload...');

  // Step 1: Download video to get size
  console.log('[LinkedIn] Downloading video from:', videoUrl.substring(0, 80));
  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download video: ${videoResponse.statusText}`);
  }
  const videoBuffer = await videoResponse.arrayBuffer();
  const videoSize = videoBuffer.byteLength;
  console.log('[LinkedIn] Video size:', videoSize, 'bytes');

  // Step 2: Initialize upload
  const initResponse = await fetch('https://api.linkedin.com/rest/videos?action=initializeUpload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: `urn:li:person:${authorUrn}`,
        fileSizeBytes: videoSize,
        uploadCausalIGEType: 'MEMBER_SHARE',
      },
    }),
  });

  const initData = await initResponse.json();

  if (!initResponse.ok) {
    const errorMsg = initData.message || `HTTP ${initResponse.status}`;
    throw new Error(`LinkedIn video upload init failed: ${errorMsg}`);
  }

  const videoUrn = initData.value?.video;
  const uploadInstructions = initData.value?.uploadInstructions;

  if (!videoUrn || !uploadInstructions || uploadInstructions.length === 0) {
    throw new Error('LinkedIn video upload init returned no video URN or upload instructions');
  }

  console.log('[LinkedIn] Video URN:', videoUrn);
  console.log('[LinkedIn] Upload instructions count:', uploadInstructions.length);

  // Step 3: Upload video chunks
  for (let i = 0; i < uploadInstructions.length; i++) {
    const instruction = uploadInstructions[i];
    const uploadUrl = instruction.uploadUrl;
    const firstByte = instruction.firstByte || 0;
    const lastByte = instruction.lastByte || videoSize - 1;
    const chunkBuffer = videoBuffer.slice(firstByte, lastByte + 1);

    console.log(`[LinkedIn] Uploading chunk ${i + 1}/${uploadInstructions.length}, bytes ${firstByte}-${lastByte}`);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: chunkBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => '');
      throw new Error(`LinkedIn video chunk ${i + 1} upload failed: ${uploadResponse.status} ${errorText}`);
    }

    // Collect etag for finalization
    const etag = uploadResponse.headers.get('etag');
    if (etag) {
      instruction.etag = etag;
    }
  }

  // Step 4: Finalize upload
  console.log('[LinkedIn] Finalizing video upload...');
  const finalizeResponse = await fetch('https://api.linkedin.com/rest/videos?action=finalizeUpload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      finalizeUploadRequest: {
        video: videoUrn,
        uploadToken: '',
        uploadedPartIds: uploadInstructions.map((inst: any) => inst.etag || ''),
      },
    }),
  });

  if (!finalizeResponse.ok) {
    const errorData = await finalizeResponse.json().catch(() => ({}));
    throw new Error(`LinkedIn video finalize failed: ${errorData.message || finalizeResponse.status}`);
  }

  console.log('[LinkedIn] Video uploaded and finalized successfully');
  return videoUrn;
}

/**
 * Publish a video post on LinkedIn
 */
export async function publishLinkedInVideoPost(
  accessToken: string,
  authorUrn: string,
  text: string,
  videoUrn: string
): Promise<any> {
  console.log('[LinkedIn] Publishing video post...');

  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${authorUrn}`,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      content: {
        media: {
          title: 'Post video',
          id: videoUrn,
        },
      },
    }),
  });

  if (response.status === 201) {
    const postId = response.headers.get('x-restli-id');
    console.log('[LinkedIn] Video post published, id:', postId);
    return { ok: true, postId };
  }

  const data = await response.json().catch(() => ({}));
  const errorMsg = data.message || data.error || `HTTP ${response.status}`;
  console.error('[LinkedIn] Video post failed:', errorMsg);
  throw new Error(`LinkedIn video post failed: ${errorMsg}`);
}
