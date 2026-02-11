import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Met à jour la BDD avec les URLs cachées depuis Storage
 * Corrige le problème où les images sont dans Storage mais pas en BDD
 */
export async function POST() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { user, error: authError } = await getAuthUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' }, { status: 401 });
  }

  try {
    console.log('[UpdateCachedUrls] Starting update for user:', user.id);

    // 1. Lister tous les fichiers dans Storage
    const { data: files, error: listError } = await supabase.storage
      .from('instagram-media')
      .list(user.id, {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (listError) {
      console.error('[UpdateCachedUrls] Error listing files:', listError);
      return NextResponse.json({ ok: false, error: listError.message }, { status: 500 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No files in storage. Run sync-media first.',
        updated: 0
      });
    }

    console.log(`[UpdateCachedUrls] Found ${files.length} files in Storage`);

    // 2. Récupérer le profil Instagram pour avoir le business account ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token')
      .eq('id', user.id)
      .single();

    if (!profile?.instagram_business_account_id) {
      return NextResponse.json({ ok: false, error: 'Instagram non connecté' }, { status: 400 });
    }

    // 3. Récupérer les posts Instagram actuels pour avoir les permalinks
    const fields = 'id,permalink,caption,media_type,timestamp';
    const instagramApiUrl = `https://graph.facebook.com/v20.0/${profile.instagram_business_account_id}/media?fields=${fields}&limit=100&access_token=${profile.instagram_access_token}`;

    const response = await fetch(instagramApiUrl, { cache: 'no-store' });
    const data = await response.json();

    if (data.error) {
      console.error('[UpdateCachedUrls] Instagram API error:', data.error);
      return NextResponse.json({ ok: false, error: data.error.message }, { status: 400 });
    }

    const instagramPosts = data.data || [];
    console.log(`[UpdateCachedUrls] Found ${instagramPosts.length} posts from Instagram API`);

    // 4. Pour chaque fichier dans Storage, mettre à jour ou créer l'entrée en BDD
    let updated = 0;
    let created = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        // Extraire l'ID Instagram du nom de fichier (format: {postId}.{extension})
        const postId = file.name.split('.')[0];

        // Trouver le post Instagram correspondant
        const instagramPost = instagramPosts.find((p: any) => p.id === postId);

        if (!instagramPost) {
          console.warn(`[UpdateCachedUrls] No Instagram post found for file ${file.name}`);
          continue;
        }

        // Générer l'URL publique
        const { data: urlData } = supabase.storage
          .from('instagram-media')
          .getPublicUrl(`${user.id}/${file.name}`);

        const cachedUrl = urlData.publicUrl;

        // Vérifier si une entrée existe déjà en BDD pour ce post Instagram
        const { data: existingImage } = await supabase
          .from('saved_images')
          .select('id')
          .eq('user_id', user.id)
          .eq('title', instagramPost.caption?.substring(0, 100) || `Instagram post ${postId}`)
          .limit(1)
          .single();

        if (existingImage) {
          // Mettre à jour l'entrée existante
          const { error: updateError } = await supabase
            .from('saved_images')
            .update({
              cached_instagram_url: cachedUrl,
              instagram_media_cached_at: new Date().toISOString()
            })
            .eq('id', existingImage.id);

          if (updateError) {
            console.error(`[UpdateCachedUrls] Error updating ${postId}:`, updateError);
            errors.push(`${postId}: ${updateError.message}`);
          } else {
            console.log(`[UpdateCachedUrls] ✓ Updated ${postId}`);
            updated++;
          }
        } else {
          // Créer une nouvelle entrée
          const { error: insertError } = await supabase
            .from('saved_images')
            .insert({
              user_id: user.id,
              image_url: cachedUrl,
              thumbnail_url: cachedUrl,
              cached_instagram_url: cachedUrl,
              instagram_media_cached_at: new Date().toISOString(),
              title: instagramPost.caption?.substring(0, 100) || `Instagram post ${postId}`,
              is_favorite: false,
              created_at: instagramPost.timestamp || new Date().toISOString()
            });

          if (insertError) {
            console.error(`[UpdateCachedUrls] Error inserting ${postId}:`, insertError);
            errors.push(`${postId}: ${insertError.message}`);
          } else {
            console.log(`[UpdateCachedUrls] ✓ Created ${postId}`);
            created++;
          }
        }
      } catch (error: any) {
        console.error(`[UpdateCachedUrls] Error processing ${file.name}:`, error);
        errors.push(`${file.name}: ${error.message}`);
      }
    }

    console.log(`[UpdateCachedUrls] Completed: ${updated} updated, ${created} created`);

    return NextResponse.json({
      ok: true,
      updated,
      created,
      total: files.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error('[UpdateCachedUrls] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
