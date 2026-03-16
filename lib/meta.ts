/**
 * Helpers simples pour appeler l'API Graph.
 * NB : on ne gère pas ici les tokens long-lived; pour la prod, ajoute l'échange en 60j si besoin.
 */
const GRAPH = "https://graph.facebook.com/v20.0";

export async function graphGET<T>(path: string, accessToken: string, params: Record<string,string|number|boolean> = {}): Promise<T> {
  const usp = new URLSearchParams({ access_token: accessToken, ...Object.fromEntries(Object.entries(params).map(([k,v])=>[k,String(v)])) });
  const res = await fetch(`${GRAPH}${path}?${usp.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('[graphGET] Error response:', errorText);
    throw new Error(errorText);
  }
  return res.json() as Promise<T>;
}

export async function graphPOST<T>(path: string, accessToken: string, body: Record<string,string|number|boolean> = {}): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: accessToken, ...Object.fromEntries(Object.entries(body).map(([k,v])=>[k,String(v)])) }),
    cache: "no-store",
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('[graphPOST] Error response:', errorText);
    throw new Error(errorText);
  }
  return res.json() as Promise<T>;
}

export type FbPage = { id: string; name: string; access_token?: string };
export type IgAccount = { id: string; username: string };

export async function getUserPages(userToken: string): Promise<FbPage[]> {
  const data = await graphGET<{ data: FbPage[] }>("/me/accounts", userToken, { fields: "id,name,access_token" });
  return data.data || [];
}

export async function getPageInstagramAccount(pageId: string, pageAccessToken: string): Promise<IgAccount|null> {
  const page = await graphGET<{ instagram_business_account?: { id: string } }>(`/${pageId}`, pageAccessToken, { fields: "instagram_business_account" });
  if (!page.instagram_business_account?.id) return null;
  const ig = await graphGET<IgAccount>(`/${page.instagram_business_account.id}`, pageAccessToken, { fields: "id,username" });
  return ig;
}

export async function publishToFacebookPage(pageId: string, pageAccessToken: string, message: string, link?: string) {
  // Pour une image => POST /{page-id}/photos (avec url) ; pour texte/lien => /feed
  if (link) {
    return graphPOST<{ id: string }>(`/${pageId}/feed`, pageAccessToken, { message, link });
  }
  return graphPOST<{ id: string }>(`/${pageId}/feed`, pageAccessToken, { message });
}

export async function publishImageToInstagram(igUserId: string, pageAccessToken: string, imageUrl: string, caption?: string): Promise<{ id: string; permalink?: string }> {
  try {
    console.log('[publishImageToInstagram] Step 1: Creating media container...');
    // 1) Créer un "container"
    const container = await graphPOST<{ id: string }>(`/${igUserId}/media`, pageAccessToken, {
      image_url: imageUrl,
      caption: caption || "",
    });
    console.log('[publishImageToInstagram] Container created:', container.id);

    // 2) Wait for media to be ready (Facebook needs time to process the image)
    console.log('[publishImageToInstagram] Step 2: Waiting for media to be ready...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3) Publish with retry (in case media is still processing)
    let publish: { id: string } | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[publishImageToInstagram] Publishing attempt ${attempt}/3...`);
        publish = await graphPOST<{ id: string }>(`/${igUserId}/media_publish`, pageAccessToken, {
          creation_id: container.id,
        });
        console.log('[publishImageToInstagram] Media published:', publish.id);
        break;
      } catch (pubErr: any) {
        const errMsg = pubErr.message || '';
        if (errMsg.includes('Media ID is not available') && attempt < 3) {
          console.log(`[publishImageToInstagram] Media not ready yet, retrying in ${5 + attempt * 3}s...`);
          await new Promise(resolve => setTimeout(resolve, (5 + attempt * 3) * 1000));
        } else {
          throw pubErr;
        }
      }
    }
    if (!publish) throw new Error('Failed to publish after 3 attempts');

    // 3) Récupérer le permalink du post publié
    try {
      console.log('[publishImageToInstagram] Step 3: Fetching permalink...');
      const postInfo = await graphGET<{ permalink?: string }>(`/${publish.id}`, pageAccessToken, {
        fields: "permalink"
      });
      return { id: publish.id, permalink: postInfo.permalink };
    } catch (error) {
      console.error('[publishImageToInstagram] Error fetching permalink:', error);
      return { id: publish.id };
    }
  } catch (error: any) {
    console.error('[publishImageToInstagram] Error during publication:', error);
    throw error; // Re-throw pour que l'endpoint puisse le gérer
  }
}

export async function publishStoryToInstagram(igUserId: string, pageAccessToken: string, imageUrl: string): Promise<{ id: string }> {
  try {
    console.log('[publishStoryToInstagram] Step 1: Creating story media container...');
    // 1) Créer un "container" pour une story
    const container = await graphPOST<{ id: string }>(`/${igUserId}/media`, pageAccessToken, {
      image_url: imageUrl,
      media_type: "STORIES",
    });

    // 2) Attendre que le media soit prêt (Instagram nécessite quelques secondes)
    console.log('[publishStoryToInstagram] Container created:', container.id, '- Waiting for media to be ready...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Attendre 3 secondes

    console.log('[publishStoryToInstagram] Step 2: Publishing story...');
    // 3) Publier la story
    const publish = await graphPOST<{ id: string }>(`/${igUserId}/media_publish`, pageAccessToken, {
      creation_id: container.id,
    });

    console.log('[publishStoryToInstagram] Story published:', publish.id);
    return { id: publish.id };
  } catch (error: any) {
    console.error('[publishStoryToInstagram] Error during story publication:', error);
    throw error; // Re-throw pour que l'endpoint puisse le gérer
  }
}

export async function publishCarouselToInstagram(
  igUserId: string,
  pageAccessToken: string,
  imageUrls: string[],
  caption?: string
): Promise<{ id: string; permalink?: string }> {
  try {
    if (imageUrls.length < 2 || imageUrls.length > 10) {
      throw new Error('Instagram carousel requires 2-10 images');
    }

    console.log('[publishCarouselToInstagram] Step 1: Creating child containers...', {
      imageCount: imageUrls.length
    });

    // 1) Créer un container pour chaque image (children)
    const childIds: string[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      console.log(`[publishCarouselToInstagram] Creating child ${i + 1}/${imageUrls.length}...`);

      const childContainer = await graphPOST<{ id: string }>(`/${igUserId}/media`, pageAccessToken, {
        image_url: imageUrl,
        is_carousel_item: true,
      });

      childIds.push(childContainer.id);
      console.log(`[publishCarouselToInstagram] Child ${i + 1} created:`, childContainer.id);
    }

    console.log('[publishCarouselToInstagram] Step 2: Creating parent carousel container...');

    // 2) Créer le container parent de type CAROUSEL
    const carouselContainer = await graphPOST<{ id: string }>(`/${igUserId}/media`, pageAccessToken, {
      media_type: "CAROUSEL",
      caption: caption || "",
      children: childIds.join(','),
    });

    console.log('[publishCarouselToInstagram] Carousel container created:', carouselContainer.id);

    console.log('[publishCarouselToInstagram] Step 3: Publishing carousel...');

    // 3) Publier le carrousel
    const publish = await graphPOST<{ id: string }>(`/${igUserId}/media_publish`, pageAccessToken, {
      creation_id: carouselContainer.id,
    });

    console.log('[publishCarouselToInstagram] Carousel published:', publish.id);

    // 4) Récupérer le permalink
    try {
      console.log('[publishCarouselToInstagram] Step 4: Fetching permalink...');
      const postInfo = await graphGET<{ permalink?: string }>(`/${publish.id}`, pageAccessToken, {
        fields: "permalink"
      });
      return { id: publish.id, permalink: postInfo.permalink };
    } catch (error) {
      console.error('[publishCarouselToInstagram] Error fetching permalink:', error);
      return { id: publish.id };
    }

  } catch (error: any) {
    console.error('[publishCarouselToInstagram] Error during carousel publication:', error);
    throw error;
  }
}

/**
 * Publish a Reel (video) to Instagram via Graph API
 * Instagram Reels use media_type=REELS with a video_url
 */
export async function publishReelToInstagram(
  igUserId: string,
  pageAccessToken: string,
  videoUrl: string,
  caption?: string
): Promise<{ id: string; permalink?: string }> {
  try {
    console.log('[publishReelToInstagram] Step 1: Creating REELS media container...');
    console.log('[publishReelToInstagram] Video URL:', videoUrl.substring(0, 100));

    // 1) Create a REELS container
    const container = await graphPOST<{ id: string }>(`/${igUserId}/media`, pageAccessToken, {
      media_type: 'REELS',
      video_url: videoUrl,
      caption: caption || '',
      share_to_feed: true,
    });
    console.log('[publishReelToInstagram] Container created:', container.id);

    // 2) Wait for video processing (Instagram needs time to process video)
    console.log('[publishReelToInstagram] Waiting for video processing...');
    const maxWait = 120_000; // 2 minutes max
    const pollInterval = 5_000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      try {
        const status = await graphGET<{ status_code?: string; status?: string }>(
          `/${container.id}`,
          pageAccessToken,
          { fields: 'status_code,status' }
        );
        console.log('[publishReelToInstagram] Container status:', status.status_code || status.status);
        if (status.status_code === 'FINISHED') break;
        if (status.status_code === 'ERROR') {
          throw new Error(`Instagram video processing failed: ${status.status || 'unknown error'}`);
        }
      } catch (pollErr: any) {
        // If status check fails, wait and retry
        if (pollErr.message?.includes('processing failed')) throw pollErr;
        console.warn('[publishReelToInstagram] Status check error (retrying):', pollErr.message?.substring(0, 100));
      }
    }

    console.log('[publishReelToInstagram] Step 2: Publishing reel...');
    // 3) Publish with retry (media may still be processing)
    let publish: { id: string } | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        publish = await graphPOST<{ id: string }>(`/${igUserId}/media_publish`, pageAccessToken, {
          creation_id: container.id,
        });
        console.log('[publishReelToInstagram] Reel published:', publish.id);
        break;
      } catch (pubErr: any) {
        const errMsg = pubErr.message || '';
        if (errMsg.includes('Media ID is not available') && attempt < 3) {
          console.log(`[publishReelToInstagram] Media not ready, retrying in ${8 * attempt}s...`);
          await new Promise(resolve => setTimeout(resolve, 8000 * attempt));
        } else {
          throw pubErr;
        }
      }
    }
    if (!publish) throw new Error('Failed to publish reel after 3 attempts');

    // 4) Get permalink
    try {
      console.log('[publishReelToInstagram] Step 3: Fetching permalink...');
      const postInfo = await graphGET<{ permalink?: string }>(`/${publish.id}`, pageAccessToken, {
        fields: 'permalink'
      });
      return { id: publish.id, permalink: postInfo.permalink };
    } catch (error) {
      console.error('[publishReelToInstagram] Error fetching permalink:', error);
      return { id: publish.id };
    }
  } catch (error: any) {
    console.error('[publishReelToInstagram] Error during reel publication:', error);
    throw error;
  }
}

/**
 * Fetch own Instagram media with engagement metrics.
 * Uses IG Media endpoint — requires our own IG user ID + page token.
 */
export type IgOwnMedia = {
  id: string;
  caption?: string;
  media_url?: string;
  media_type?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  permalink?: string;
  impressions?: number;
  reach?: number;
  saved?: number;
};

export async function getOwnInstagramMedia(
  igUserId: string,
  pageAccessToken: string,
  limit: number = 25,
): Promise<IgOwnMedia[]> {
  try {
    const fields = 'id,caption,media_url,media_type,timestamp,like_count,comments_count,permalink';
    const data = await graphGET<{ data: IgOwnMedia[] }>(
      `/${igUserId}/media`,
      pageAccessToken,
      { fields, limit },
    );
    const posts = data.data || [];

    // Fetch insights for each post (impressions, reach, saved)
    for (const post of posts) {
      try {
        const insights = await graphGET<{
          data: Array<{ name: string; values: Array<{ value: number }> }>;
        }>(`/${post.id}/insights`, pageAccessToken, {
          metric: 'impressions,reach,saved',
        });
        for (const metric of insights.data || []) {
          const val = metric.values?.[0]?.value || 0;
          if (metric.name === 'impressions') post.impressions = val;
          if (metric.name === 'reach') post.reach = val;
          if (metric.name === 'saved') post.saved = val;
        }
      } catch {
        // Insights not available for all media types (e.g., stories)
      }
    }

    return posts;
  } catch (e: any) {
    console.error('[getOwnInstagramMedia] Error:', e.message?.substring(0, 200));
    return [];
  }
}

/**
 * Business Discovery: fetch recent posts from any public Instagram business/creator account.
 * Uses the IG Business Discovery API — requires our own IG user ID + page token.
 */
export type IgDiscoveryPost = {
  id: string;
  caption?: string;
  media_url?: string;
  media_type?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  permalink?: string;
};

export async function getBusinessDiscoveryPosts(
  ourIgUserId: string,
  pageAccessToken: string,
  targetUsername: string,
  limit: number = 5,
): Promise<{ username: string; posts: IgDiscoveryPost[] }> {
  const cleanUsername = targetUsername.replace(/^@/, '').trim();
  return fetchBusinessDiscovery(ourIgUserId, pageAccessToken, cleanUsername, limit);
}

async function fetchBusinessDiscovery(
  igUserId: string,
  accessToken: string,
  username: string,
  limit: number,
): Promise<{ username: string; posts: IgDiscoveryPost[] }> {
  const mediaFields = `id,caption,media_url,media_type,timestamp,like_count,comments_count,permalink`;
  const url = `https://graph.facebook.com/v20.0/${igUserId}?fields=business_discovery.fields(username,media.limit(${limit}){${mediaFields}})&access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.text();
    console.error('[BusinessDiscovery] API error:', err.substring(0, 300));
    return { username, posts: [] };
  }

  const json = await res.json();
  const bd = json.business_discovery;
  if (!bd) return { username, posts: [] };

  return {
    username: bd.username || username,
    posts: bd.media?.data || [],
  };
}
