/**
 * LinkedIn API Helper Functions
 * UGC Posts API v2 (Share on LinkedIn)
 * Docs: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
 */

// Types
export type LinkedInUserInfo = {
  sub: string;
  name: string;
  email: string;
  picture?: string;
};

export type LinkedInTokenResponse = {
  access_token: string;
  expires_in: number;
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data.message || data.error || `HTTP ${response.status}`;
    throw new Error(`Failed to get LinkedIn user info: ${errorMsg}`);
  }

  console.log('[LinkedIn] User info received:', { sub: data.sub, name: data.name });
  return { sub: data.sub, name: data.name, email: data.email, picture: data.picture };
}

/**
 * Publish a text-only post via UGC Posts API
 */
export async function publishLinkedInTextPost(
  accessToken: string,
  authorUrn: string,
  text: string
): Promise<any> {
  console.log('[LinkedIn] Publishing text post via UGC API...');

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${authorUrn}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    }),
  });

  if (response.status === 201) {
    const postId = response.headers.get('x-restli-id');
    console.log('[LinkedIn] Text post published, id:', postId);
    return { ok: true, postId };
  }

  const data = await response.json().catch(() => ({}));
  const errorMsg = data.message || data.error || `HTTP ${response.status}`;
  console.error('[LinkedIn] Text post failed:', errorMsg, JSON.stringify(data));
  throw new Error(`LinkedIn post failed: ${errorMsg}`);
}

/**
 * Register and upload an image to LinkedIn, returns the asset URN
 */
export async function uploadLinkedInImage(
  accessToken: string,
  authorUrn: string,
  imageUrl: string
): Promise<string> {
  console.log('[LinkedIn] Registering image upload...');

  // Step 1: Register upload
  const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: `urn:li:person:${authorUrn}`,
        serviceRelationships: [
          {
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          },
        ],
      },
    }),
  });

  const registerData = await registerResponse.json();

  if (!registerResponse.ok) {
    const errorMsg = registerData.message || `HTTP ${registerResponse.status}`;
    throw new Error(`LinkedIn image register failed: ${errorMsg}`);
  }

  const uploadUrl = registerData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const assetUrn = registerData.value?.asset;

  if (!uploadUrl || !assetUrn) {
    console.error('[LinkedIn] Register response:', JSON.stringify(registerData));
    throw new Error('LinkedIn image register returned no uploadUrl or asset');
  }

  console.log('[LinkedIn] Asset URN:', assetUrn);

  // Step 2: Download image
  console.log('[LinkedIn] Downloading image from:', imageUrl.substring(0, 80));
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.statusText}`);
  }
  const imageBuffer = await imageResponse.arrayBuffer();

  // Step 3: Upload image binary to LinkedIn
  console.log('[LinkedIn] Uploading image bytes, size:', imageBuffer.byteLength);
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    body: imageBuffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => '');
    throw new Error(`LinkedIn image upload failed: ${uploadResponse.status} ${errorText}`);
  }

  console.log('[LinkedIn] Image uploaded successfully');
  return assetUrn;
}

/**
 * Publish an image post via UGC Posts API
 */
export async function publishLinkedInImagePost(
  accessToken: string,
  authorUrn: string,
  text: string,
  assetUrn: string
): Promise<any> {
  console.log('[LinkedIn] Publishing image post via UGC API...');

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${authorUrn}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'IMAGE',
          media: [
            {
              status: 'READY',
              media: assetUrn,
            },
          ],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
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
  console.error('[LinkedIn] Image post failed:', errorMsg, JSON.stringify(data));
  throw new Error(`LinkedIn image post failed: ${errorMsg}`);
}

/**
 * Register and upload a video to LinkedIn, returns the asset URN
 */
export async function uploadLinkedInVideo(
  accessToken: string,
  authorUrn: string,
  videoUrl: string
): Promise<string> {
  console.log('[LinkedIn] Registering video upload...');

  // Step 1: Register upload
  const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
        owner: `urn:li:person:${authorUrn}`,
        serviceRelationships: [
          {
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          },
        ],
      },
    }),
  });

  const registerData = await registerResponse.json();

  if (!registerResponse.ok) {
    const errorMsg = registerData.message || `HTTP ${registerResponse.status}`;
    throw new Error(`LinkedIn video register failed: ${errorMsg}`);
  }

  const uploadUrl = registerData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const assetUrn = registerData.value?.asset;

  if (!uploadUrl || !assetUrn) {
    console.error('[LinkedIn] Register response:', JSON.stringify(registerData));
    throw new Error('LinkedIn video register returned no uploadUrl or asset');
  }

  console.log('[LinkedIn] Video asset URN:', assetUrn);

  // Step 2: Download video
  console.log('[LinkedIn] Downloading video from:', videoUrl.substring(0, 80));
  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download video: ${videoResponse.statusText}`);
  }
  const videoBuffer = await videoResponse.arrayBuffer();
  console.log('[LinkedIn] Video size:', videoBuffer.byteLength, 'bytes');

  // Step 3: Upload video binary to LinkedIn
  console.log('[LinkedIn] Uploading video bytes...');
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    body: videoBuffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => '');
    throw new Error(`LinkedIn video upload failed: ${uploadResponse.status} ${errorText}`);
  }

  console.log('[LinkedIn] Video uploaded successfully');
  return assetUrn;
}

/**
 * Publish a video post via UGC Posts API
 */
export async function publishLinkedInVideoPost(
  accessToken: string,
  authorUrn: string,
  text: string,
  assetUrn: string
): Promise<any> {
  console.log('[LinkedIn] Publishing video post via UGC API...');

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${authorUrn}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'VIDEO',
          media: [
            {
              status: 'READY',
              media: assetUrn,
            },
          ],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
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
  console.error('[LinkedIn] Video post failed:', errorMsg, JSON.stringify(data));
  throw new Error(`LinkedIn video post failed: ${errorMsg}`);
}
