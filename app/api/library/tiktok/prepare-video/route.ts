import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/library/tiktok/prepare-video
 * Optimize and prepare video for TikTok
 *
 * This endpoint ensures videos meet TikTok requirements:
 * - Format: MP4 with H.264 video codec and AAC audio codec
 * - Resolution: 1080x1920 (9:16 vertical)
 * - Duration: preserved (minimum 3s enforced by TikTok)
 * - Optimized for fast upload
 *
 * Body:
 * - videoUrl: URL of video to prepare
 *
 * Returns:
 * - optimizedUrl: URL of TikTok-ready video
 * - metadata: Video details
 */
export async function POST(req: NextRequest) {
  try {
    const { videoUrl } = await req.json();

    if (!videoUrl) {
      return NextResponse.json(
        { ok: false, error: 'URL de la vidéo manquante' },
        { status: 400 }
      );
    }

    console.log('[TikTokPrepare] Preparing video for TikTok:', videoUrl);

    // Note: Without server-side FFmpeg (incompatible with Vercel serverless),
    // we cannot transcode videos. Options:
    //
    // 1. Use Cloudinary video transformation API (requires Cloudinary account)
    // 2. Use Mux Video API (requires Mux account)
    // 3. Use AWS MediaConvert (requires AWS setup)
    // 4. Use client-side conversion with ffmpeg.wasm (slow, browser-only)
    //
    // For now, we'll validate and return the original URL with recommendations

    // Validate video first
    const validateResponse = await fetch(`${req.nextUrl.origin}/api/library/tiktok/validate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl })
    });

    const validateData = await validateResponse.json();

    if (!validateData.ok) {
      return NextResponse.json(
        { ok: false, error: validateData.error },
        { status: 400 }
      );
    }

    // If video is already valid, return it
    if (validateData.isValid) {
      console.log('[TikTokPrepare] Video is already TikTok-compatible');
      return NextResponse.json({
        ok: true,
        optimizedUrl: videoUrl,
        metadata: validateData.metadata,
        alreadyOptimized: true,
        message: 'Vidéo déjà conforme aux exigences TikTok'
      });
    }

    // Video needs optimization but we can't do it server-side
    console.warn('[TikTokPrepare] Video needs optimization but server-side conversion not available');

    return NextResponse.json({
      ok: false,
      error: 'Vidéo non conforme et conversion serveur non disponible',
      validationErrors: validateData.errors,
      recommendations: [
        'Utilisez un outil de conversion vidéo (HandBrake, FFmpeg, CloudConvert)',
        'Format requis: MP4 avec codec H.264 (vidéo) et AAC (audio)',
        'Résolution recommandée: 1080x1920 (9:16 vertical)',
        'Durée minimum: 3 secondes',
        'Consultez TIKTOK_REQUIREMENTS.md pour le guide complet'
      ],
      conversionCommand:
        'ffmpeg -i input.mp4 -c:v libx264 -preset medium -crf 23 ' +
        '-c:a aac -b:a 128k -vf "scale=1080:1920:force_original_aspect_ratio=decrease" ' +
        '-movflags +faststart output_tiktok.mp4'
    }, { status: 400 });

  } catch (error: any) {
    console.error('[TikTokPrepare] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la préparation' },
      { status: 500 }
    );
  }
}

/**
 * Example Cloudinary transformation (if Cloudinary is configured):
 *
 * async function convertViaCloudinary(videoUrl: string): Promise<string> {
 *   const cloudinary = require('cloudinary').v2;
 *
 *   cloudinary.config({
 *     cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
 *     api_key: process.env.CLOUDINARY_API_KEY,
 *     api_secret: process.env.CLOUDINARY_API_SECRET
 *   });
 *
 *   // Upload and transform in one step
 *   const result = await cloudinary.uploader.upload(videoUrl, {
 *     resource_type: 'video',
 *     eager: [
 *       {
 *         format: 'mp4',
 *         video_codec: 'h264',
 *         audio_codec: 'aac',
 *         width: 1080,
 *         height: 1920,
 *         crop: 'pad',
 *         background: 'black',
 *         quality: 'auto'
 *       }
 *     ],
 *     eager_async: false
 *   });
 *
 *   return result.eager[0].secure_url;
 * }
 */
