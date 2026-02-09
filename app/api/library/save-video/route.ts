import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

/**
 * POST /api/library/save-video
 * Save generated video metadata to my_videos (video already in Storage)
 * Used for videos from Seedream I2V or other generation tools
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await req.json();
    const {
      videoUrl,
      title,
      sourceType = 'seedream_i2v',
      originalImageId,
      duration,
      thumbnailUrl,
      folderId
    } = body;

    // 3. Validate required fields
    if (!videoUrl) {
      return NextResponse.json(
        { ok: false, error: 'URL de la vidéo requise' },
        { status: 400 }
      );
    }

    if (!['seedream_i2v', 'generate', 'upload'].includes(sourceType)) {
      return NextResponse.json(
        { ok: false, error: 'Type de source invalide' },
        { status: 400 }
      );
    }

    console.log('[SaveVideo] Saving video metadata:', {
      videoUrl,
      title,
      sourceType,
      userId: user.id
    });

    // 4. Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 5. Extract format from URL
    const format = videoUrl.split('.').pop()?.toLowerCase() || 'mp4';

    // 6. Insert into my_videos table
    const { data: videoData, error: insertError } = await supabase
      .from('my_videos')
      .insert({
        user_id: user.id,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl || null,
        title: title || 'Vidéo générée',
        source_type: sourceType,
        original_image_id: originalImageId || null,
        duration: duration || null,
        format,
        folder_id: folderId || null,
        is_favorite: false,
        published_to_tiktok: false
      })
      .select()
      .single();

    if (insertError) {
      console.error('[SaveVideo] Database insert error:', insertError);
      return NextResponse.json(
        { ok: false, error: `Erreur base de données: ${insertError.message}` },
        { status: 500 }
      );
    }

    console.log('[SaveVideo] Video metadata saved successfully:', videoData.id);

    return NextResponse.json({
      ok: true,
      video: videoData
    });

  } catch (error: any) {
    console.error('[SaveVideo] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la sauvegarde' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/library/save-video
 * Mettre à jour une vidéo existante (remplacer URL après édition/merge audio)
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json();
    const { id, videoUrl, title } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'id requis' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (videoUrl) updateData.video_url = videoUrl;
    if (title) updateData.title = title;

    const { data, error } = await supabase
      .from('my_videos')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[SaveVideo PATCH] Error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    console.log('[SaveVideo PATCH] ✅ Video updated:', id);
    return NextResponse.json({ ok: true, video: data });
  } catch (error: any) {
    console.error('[SaveVideo PATCH] ❌ Error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
