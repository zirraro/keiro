import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/seedream/download-and-store
 * Download video from Seedream and upload to Supabase Storage
 * ULTRA-ROBUSTE avec gestion d'erreurs complète
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    console.log('[DownloadAndStore] ===== DÉBUT =====');

    // Step 1: Auth
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      console.error('[DownloadAndStore] Auth failed:', authError);
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }
    console.log('[DownloadAndStore] ✓ User authenticated:', user.id);

    // Step 2: Parse body
    let body;
    try {
      body = await req.json();
    } catch (parseError: any) {
      console.error('[DownloadAndStore] Failed to parse JSON:', parseError.message);
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { videoUrl, originalImageId, title } = body;
    console.log('[DownloadAndStore] Request params:', {
      videoUrl: videoUrl?.substring(0, 150),
      originalImageId,
      title
    });

    // Step 3: Validate videoUrl
    if (!videoUrl) {
      console.error('[DownloadAndStore] Missing videoUrl');
      return NextResponse.json(
        { ok: false, error: 'Video URL manquante' },
        { status: 400 }
      );
    }

    if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
      console.error('[DownloadAndStore] Invalid URL format:', videoUrl);
      return NextResponse.json(
        { ok: false, error: 'URL invalide (doit commencer par http/https)' },
        { status: 400 }
      );
    }

    // Step 4: Download video
    console.log('[DownloadAndStore] Downloading video...');
    let videoResponse;
    try {
      videoResponse = await fetch(videoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
    } catch (fetchError: any) {
      console.error('[DownloadAndStore] Fetch error:', fetchError.message);
      return NextResponse.json(
        { ok: false, error: `Impossible de télécharger: ${fetchError.message}` },
        { status: 500 }
      );
    }

    console.log('[DownloadAndStore] Response:', videoResponse.status, videoResponse.statusText);
    console.log('[DownloadAndStore] Content-Type:', videoResponse.headers.get('content-type'));

    if (!videoResponse.ok) {
      const errorText = await videoResponse.text().catch(() => 'Unable to read error');
      console.error('[DownloadAndStore] Download failed:', {
        status: videoResponse.status,
        error: errorText.substring(0, 300)
      });
      return NextResponse.json(
        { ok: false, error: `Téléchargement échoué (${videoResponse.status})` },
        { status: videoResponse.status }
      );
    }

    // Step 5: Validate content type
    const contentType = videoResponse.headers.get('content-type');
    if (contentType && !contentType.includes('video') && !contentType.includes('octet-stream') && !contentType.includes('application')) {
      console.error('[DownloadAndStore] Invalid content type:', contentType);
      const preview = await videoResponse.text().catch(() => 'Unable to preview');
      console.error('[DownloadAndStore] Response preview:', preview.substring(0, 300));
      return NextResponse.json(
        { ok: false, error: `Type de fichier invalide: ${contentType}` },
        { status: 400 }
      );
    }

    // Step 6: Get buffer
    let videoBuffer;
    try {
      videoBuffer = await videoResponse.arrayBuffer();
    } catch (bufferError: any) {
      console.error('[DownloadAndStore] Failed to get buffer:', bufferError.message);
      return NextResponse.json(
        { ok: false, error: 'Erreur lecture vidéo' },
        { status: 500 }
      );
    }

    if (videoBuffer.byteLength === 0) {
      console.error('[DownloadAndStore] Empty video buffer');
      return NextResponse.json(
        { ok: false, error: 'Vidéo vide reçue' },
        { status: 400 }
      );
    }

    const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
    const sizeInMB = (videoBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log('[DownloadAndStore] ✓ Video downloaded:', sizeInMB, 'MB');

    // Step 7: Initialize Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[DownloadAndStore] Missing Supabase config');
      return NextResponse.json(
        { ok: false, error: 'Configuration Supabase manquante' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[DownloadAndStore] ✓ Supabase client initialized');

    // Step 8: Upload to Supabase Storage
    const fileName = `tiktok-videos/${user.id}/${Date.now()}.mp4`;
    console.log('[DownloadAndStore] Uploading to:', fileName);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(fileName, videoBlob, {
        contentType: 'video/mp4',
        upsert: false
      });

    if (uploadError) {
      console.error('[DownloadAndStore] Upload error:', {
        code: uploadError.name,
        message: uploadError.message,
        cause: uploadError.cause
      });
      return NextResponse.json(
        { ok: false, error: `Erreur upload: ${uploadError.message}` },
        { status: 500 }
      );
    }

    console.log('[DownloadAndStore] ✓ Upload successful:', uploadData.path);

    // Step 9: Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('generated-images')
      .getPublicUrl(fileName);

    console.log('[DownloadAndStore] ✓ Public URL:', publicUrl);

    if (!publicUrl || !publicUrl.startsWith('http')) {
      console.error('[DownloadAndStore] Invalid public URL:', publicUrl);
      return NextResponse.json(
        { ok: false, error: 'URL publique invalide' },
        { status: 500 }
      );
    }

    // Step 10: Get original image for thumbnail (optional)
    let thumbnailUrl = null;
    if (originalImageId) {
      try {
        const { data: originalImage } = await supabase
          .from('saved_images')
          .select('thumbnail_url, image_url')
          .eq('id', originalImageId)
          .single();

        if (originalImage) {
          thumbnailUrl = originalImage.thumbnail_url || originalImage.image_url;
          console.log('[DownloadAndStore] ✓ Thumbnail found:', thumbnailUrl?.substring(0, 50));
        }
      } catch (thumbError: any) {
        console.warn('[DownloadAndStore] Failed to get thumbnail (non-critical):', thumbError.message);
        // Continue without thumbnail
      }
    }

    // Step 11: Save to saved_images table
    const videoTitle = title || 'Vidéo TikTok';
    console.log('[DownloadAndStore] Saving to gallery:', videoTitle);

    const { data: insertedImage, error: insertError } = await supabase
      .from('saved_images')
      .insert({
        user_id: user.id,
        image_url: publicUrl,
        thumbnail_url: thumbnailUrl,
        title: videoTitle,
        is_favorite: false
      })
      .select()
      .single();

    if (insertError) {
      console.error('[DownloadAndStore] Gallery insert error:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details
      });
      return NextResponse.json(
        { ok: false, error: `Erreur sauvegarde: ${insertError.message}` },
        { status: 500 }
      );
    }

    const elapsed = Date.now() - startTime;
    console.log('[DownloadAndStore] ✓ SUCCESS! Saved to gallery:', insertedImage.id);
    console.log('[DownloadAndStore] ===== TERMINÉ en', elapsed, 'ms =====');

    return NextResponse.json({
      ok: true,
      videoUrl: publicUrl,
      imageId: insertedImage.id,
      size: sizeInMB + ' MB',
      elapsed: elapsed + ' ms'
    });

  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error('[DownloadAndStore] ===== ERREUR FATALE =====');
    console.error('[DownloadAndStore] Message:', error.message);
    console.error('[DownloadAndStore] Stack:', error.stack);
    console.error('[DownloadAndStore] Elapsed:', elapsed, 'ms');

    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur inconnue' },
      { status: 500 }
    );
  }
}
