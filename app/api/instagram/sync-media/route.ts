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

        // Télécharger l'image depuis Instagram
        const imageResponse = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        if (!imageResponse.ok) {
          console.error(`[SyncMedia] Failed to fetch ${post.id}: ${imageResponse.statusText}`);
          continue;
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload vers Supabase Storage
        const fileName = `${user.id}/${post.id}.jpg`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('instagram-media')
          .upload(fileName, buffer, {
            contentType: 'image/jpeg',
            upsert: true, // Remplace si existe déjà
            cacheControl: '31536000', // Cache 1 an
          });

        if (uploadError) {
          console.error(`[SyncMedia] Upload error for ${post.id}:`, uploadError);
          continue;
        }

        // Obtenir URL publique
        const { data: { publicUrl } } = supabase.storage
          .from('instagram-media')
          .getPublicUrl(fileName);

        cachedPosts.push({
          id: post.id,
          cachedUrl: publicUrl,
          mediaType: post.media_type,
          timestamp: post.timestamp,
          permalink: post.permalink,
        });

        console.log(`[SyncMedia] Cached ${post.id} successfully`);

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
