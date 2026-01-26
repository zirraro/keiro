import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { user, error: authError } = await getAuthUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
  }

  try {
    // Vérifier si le bucket existe, sinon le créer
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === 'instagram-media');

    if (!bucketExists) {
      console.log('[SyncMedia] Creating instagram-media bucket...');
      const { error: bucketError } = await supabase.storage.createBucket('instagram-media', {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      });
      if (bucketError) {
        console.error('[SyncMedia] Bucket creation error:', bucketError);
      }
    }

    // 1. Récupérer profil Instagram
    const { data: profile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token')
      .eq('id', user.id)
      .single();

    if (!profile?.instagram_business_account_id || !profile?.instagram_access_token) {
      return NextResponse.json({ ok: false, error: 'Instagram non connecté' }, { status: 400 });
    }

    // 2. Récupérer posts Instagram via API Graph
    const fields = 'id,media_url,thumbnail_url,media_type,timestamp,permalink';
    const instagramApiUrl = `https://graph.facebook.com/v20.0/${profile.instagram_business_account_id}/media?fields=${fields}&limit=24&access_token=${profile.instagram_access_token}`;

    console.log('[SyncMedia] Fetching Instagram posts...');
    const response = await fetch(instagramApiUrl, { cache: 'no-store' });
    const data = await response.json();

    if (data.error) {
      console.error('[SyncMedia] Instagram API error:', data.error);
      return NextResponse.json({ ok: false, error: data.error.message }, { status: 400 });
    }

    const posts = data.data || [];
    const cachedPosts = [];

    // 3. Télécharger et cacher chaque image dans Supabase Storage
    for (const post of posts) {
      try {
        const imageUrl = post.media_url || post.thumbnail_url;
        if (!imageUrl) {
          console.log(`[SyncMedia] Skipping ${post.id} - no image URL`);
          continue;
        }

        // Télécharger l'image depuis Instagram avec retry
        let imageResponse;
        let retries = 3;

        while (retries > 0) {
          try {
            imageResponse = await fetch(imageUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.instagram.com/',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'cross-site',
              }
            });

            if (imageResponse.ok) {
              break;
            }

            console.warn(`[SyncMedia] Retry ${4 - retries} for ${post.id}: ${imageResponse.statusText}`);
            retries--;

            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
            }
          } catch (fetchError) {
            console.error(`[SyncMedia] Fetch error for ${post.id}:`, fetchError);
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }

        if (!imageResponse || !imageResponse.ok) {
          console.error(`[SyncMedia] Failed to fetch ${post.id} after retries`);
          continue;
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Déterminer le type de contenu de l'image
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';

        // Upload vers Supabase Storage
        const fileName = `${user.id}/${post.id}.${extension}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('instagram-media')
          .upload(fileName, buffer, {
            contentType,
            upsert: true, // Remplace si existe déjà
            cacheControl: '31536000', // Cache 1 an
          });

        if (uploadError) {
          console.error(`[SyncMedia] Upload error for ${post.id}:`, uploadError);
          continue;
        }

        // Obtenir URL publique - VÉRIFIER que le bucket est accessible
        const { data: urlData } = supabase.storage
          .from('instagram-media')
          .getPublicUrl(fileName);

        const publicUrl = urlData.publicUrl;

        // Vérifier que l'URL est accessible
        console.log(`[SyncMedia] ✓ Cached ${post.id} successfully`);
        console.log(`[SyncMedia]   File: ${fileName}`);
        console.log(`[SyncMedia]   Public URL: ${publicUrl}`);

        cachedPosts.push({
          id: post.id,
          cachedUrl: publicUrl,
          mediaType: post.media_type,
          timestamp: post.timestamp,
          permalink: post.permalink,
        });

      } catch (error) {
        console.error(`[SyncMedia] Error processing ${post.id}:`, error);
      }
    }

    console.log(`[SyncMedia] Completed: ${cachedPosts.length}/${posts.length} images cached`);

    return NextResponse.json({
      ok: true,
      cached: cachedPosts.length,
      total: posts.length,
      posts: cachedPosts,
    });

  } catch (error: any) {
    console.error('[SyncMedia] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
