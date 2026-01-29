import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

/**
 * POST /api/upload-video
 * Upload user videos to Supabase Storage and save metadata to my_videos
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

    // 2. Parse multipart form
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const folderId = formData.get('folderId') as string | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'Aucun fichier fourni' },
        { status: 400 }
      );
    }

    // 3. Validate file type and size
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { ok: false, error: `Fichier trop volumineux (max 100MB)` },
        { status: 400 }
      );
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['mp4', 'mov', 'webm', 'avi'];

    if (!ext || !allowedExtensions.includes(ext)) {
      return NextResponse.json(
        { ok: false, error: `Format non supporté. Utilisez: ${allowedExtensions.join(', ')}` },
        { status: 400 }
      );
    }

    console.log('[UploadVideo] Processing video upload:', {
      filename: file.name,
      size: file.size,
      type: file.type,
      userId: user.id
    });

    // 4. Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 5. Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `user-videos/${user.id}/${timestamp}-${sanitizedFilename}`;

    console.log('[UploadVideo] Uploading to Storage:', storagePath);

    const { error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      console.error('[UploadVideo] Storage upload error:', uploadError);
      return NextResponse.json(
        { ok: false, error: `Erreur upload: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // 6. Get public URL
    const { data: urlData } = supabase.storage
      .from('generated-images')
      .getPublicUrl(storagePath);

    if (!urlData || !urlData.publicUrl) {
      console.error('[UploadVideo] Failed to get public URL');
      return NextResponse.json(
        { ok: false, error: 'Impossible de générer l\'URL publique' },
        { status: 500 }
      );
    }

    console.log('[UploadVideo] Video uploaded successfully:', urlData.publicUrl);

    // 7. Insert metadata into my_videos table
    const videoTitle = title || file.name.replace(`.${ext}`, '');

    const { data: videoData, error: insertError } = await supabase
      .from('my_videos')
      .insert({
        user_id: user.id,
        video_url: urlData.publicUrl,
        title: videoTitle,
        source_type: 'upload',
        file_size: file.size,
        format: ext,
        folder_id: folderId || null,
        is_favorite: false
      })
      .select()
      .single();

    if (insertError) {
      console.error('[UploadVideo] Database insert error:', insertError);

      // Try to clean up uploaded file
      await supabase.storage
        .from('generated-images')
        .remove([storagePath]);

      return NextResponse.json(
        { ok: false, error: `Erreur base de données: ${insertError.message}` },
        { status: 500 }
      );
    }

    console.log('[UploadVideo] Video metadata saved to database:', videoData.id);

    return NextResponse.json({
      ok: true,
      video: videoData
    });

  } catch (error: any) {
    console.error('[UploadVideo] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de l\'upload' },
      { status: 500 }
    );
  }
}
