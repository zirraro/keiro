import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

/**
 * POST /api/save-video-metadata
 * Sauvegarde les métadonnées d'une vidéo uploadée directement vers Supabase Storage
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await req.json();
    const { storagePath, title, fileSize, format, folderId } = body;

    if (!storagePath) {
      return NextResponse.json(
        { ok: false, error: 'storagePath manquant' },
        { status: 400 }
      );
    }

    console.log('[SaveVideoMetadata] Saving metadata for:', storagePath);

    // 3. Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 4. Get public URL
    const { data: urlData } = supabase.storage
      .from('generated-images')
      .getPublicUrl(storagePath);

    if (!urlData || !urlData.publicUrl) {
      console.error('[SaveVideoMetadata] Failed to get public URL');
      return NextResponse.json(
        { ok: false, error: 'Impossible de générer l\'URL publique' },
        { status: 500 }
      );
    }

    // 5. Insert metadata into my_videos table
    const { data: videoData, error: insertError } = await supabase
      .from('my_videos')
      .insert({
        user_id: user.id,
        video_url: urlData.publicUrl,
        title: title || 'Vidéo uploadée',
        source_type: 'upload',
        file_size: fileSize || null,
        format: format || null,
        folder_id: folderId || null,
        is_favorite: false
      })
      .select()
      .single();

    if (insertError) {
      console.error('[SaveVideoMetadata] Database insert error:', insertError);
      return NextResponse.json(
        { ok: false, error: `Erreur base de données: ${insertError.message}` },
        { status: 500 }
      );
    }

    console.log('[SaveVideoMetadata] Video metadata saved:', videoData.id);

    return NextResponse.json({
      ok: true,
      video: videoData
    });

  } catch (error: any) {
    console.error('[SaveVideoMetadata] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la sauvegarde' },
      { status: 500 }
    );
  }
}
