import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/seedream/download-and-store
 * Download video from Seedream and upload to Supabase Storage
 *
 * Body:
 * - videoUrl: Seedream video URL
 * - originalImageId: ID of the original image (optional)
 * - title: Video title
 */
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const { videoUrl, originalImageId, title } = await req.json();

    if (!videoUrl) {
      return NextResponse.json(
        { ok: false, error: 'Video URL manquante' },
        { status: 400 }
      );
    }

    console.log('[DownloadAndStore] Downloading video from Seedream:', videoUrl.substring(0, 100));

    // Download video from Seedream (server-side, no CORS issue)
    const videoResponse = await fetch(videoUrl);

    if (!videoResponse.ok) {
      console.error('[DownloadAndStore] Failed to fetch video:', videoResponse.status, videoResponse.statusText);
      return NextResponse.json(
        { ok: false, error: `Impossible de télécharger la vidéo: ${videoResponse.statusText}` },
        { status: videoResponse.status }
      );
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });

    console.log('[DownloadAndStore] Video downloaded:', {
      size: (videoBuffer.byteLength / 1024 / 1024).toFixed(2) + ' MB'
    });

    // Initialize Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upload to Supabase Storage
    const fileName = `tiktok-videos/${user.id}/${Date.now()}.mp4`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(fileName, videoBlob, {
        contentType: 'video/mp4',
        upsert: false
      });

    if (uploadError) {
      console.error('[DownloadAndStore] Upload error:', uploadError);
      return NextResponse.json(
        { ok: false, error: `Erreur lors de l'upload: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('generated-images')
      .getPublicUrl(fileName);

    console.log('[DownloadAndStore] Video uploaded to Supabase:', publicUrl);

    // Get original image for thumbnail
    let thumbnailUrl = null;
    if (originalImageId) {
      const { data: originalImage } = await supabase
        .from('saved_images')
        .select('thumbnail_url, image_url')
        .eq('id', originalImageId)
        .single();

      if (originalImage) {
        thumbnailUrl = originalImage.thumbnail_url || originalImage.image_url;
      }
    }

    // Save to saved_images table
    const { data: insertedImage, error: insertError } = await supabase
      .from('saved_images')
      .insert({
        user_id: user.id,
        image_url: publicUrl,
        thumbnail_url: thumbnailUrl,
        title: title || 'Vidéo TikTok',
        is_favorite: false
      })
      .select()
      .single();

    if (insertError) {
      console.error('[DownloadAndStore] Error saving to gallery:', insertError);
      return NextResponse.json(
        { ok: false, error: `Erreur lors de la sauvegarde: ${insertError.message}` },
        { status: 500 }
      );
    }

    console.log('[DownloadAndStore] Video saved to gallery:', insertedImage.id);

    return NextResponse.json({
      ok: true,
      videoUrl: publicUrl,
      imageId: insertedImage.id
    });

  } catch (error: any) {
    console.error('[DownloadAndStore] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
