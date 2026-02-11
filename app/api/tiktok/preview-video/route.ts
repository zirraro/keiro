import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { convertImageToVideo, checkFfmpegAvailable } from '@/lib/video-converter';

/**
 * POST /api/tiktok/preview-video
 * Convert image to video and return as base64 for preview
 */
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: 'URL de l\'image manquante' },
        { status: 400 }
      );
    }

    // Check FFmpeg availability
    console.log('[TikTokPreview] Checking FFmpeg availability...');
    const ffmpegAvailable = await checkFfmpegAvailable();
    if (!ffmpegAvailable) {
      console.error('[TikTokPreview] FFmpeg check failed - video conversion unavailable');
      return NextResponse.json(
        {
          ok: false,
          error: 'Ffmpeg non disponible sur le serveur. Impossible de convertir les images en vidéo. Consultez les logs du serveur pour plus de détails.',
          details: 'FFmpeg binary could not be found or executed. Check server logs for specific error.'
        },
        { status: 500 }
      );
    }
    console.log('[TikTokPreview] FFmpeg is available');

    console.log('[TikTokPreview] Downloading image...');

    // Download image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to download image');
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    console.log('[TikTokPreview] Converting image to video...');

    // Convert image to TikTok video (9:16, 5 seconds)
    const videoBuffer = await convertImageToVideo(imageBuffer, {
      width: 1080,
      height: 1920,
      duration: 5,
      fps: 30
    });

    console.log('[TikTokPreview] Video converted:', {
      size: (videoBuffer.length / 1024 / 1024).toFixed(2) + ' MB'
    });

    // Return video as base64
    const videoBase64 = videoBuffer.toString('base64');

    return NextResponse.json({
      ok: true,
      videoBase64,
      videoSize: videoBuffer.length
    });

  } catch (error: any) {
    console.error('[TikTokPreview] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la prévisualisation' },
      { status: 500 }
    );
  }
}
