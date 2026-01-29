import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/library/tiktok/validate-video
 * Validate video meets TikTok requirements
 *
 * Body:
 * - videoUrl: URL of the video to validate
 *
 * Returns:
 * - isValid: boolean
 * - errors: string[] - List of validation errors
 * - warnings: string[] - List of warnings
 * - metadata: Video metadata (duration, size, format)
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

    console.log('[TikTokValidate] Validating video:', videoUrl);

    // Fetch video to analyze
    const videoResponse = await fetch(videoUrl);

    if (!videoResponse.ok) {
      return NextResponse.json(
        { ok: false, error: 'Impossible de télécharger la vidéo' },
        { status: 400 }
      );
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const videoSize = videoBuffer.byteLength;

    // Get content type
    const contentType = videoResponse.headers.get('content-type') || '';

    console.log('[TikTokValidate] Video size:', videoSize, 'bytes');
    console.log('[TikTokValidate] Content-Type:', contentType);

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validation 1: File size (max 287 MB for TikTok, but we'll be conservative)
    const MAX_SIZE = 100 * 1024 * 1024; // 100 MB
    if (videoSize > MAX_SIZE) {
      errors.push(`Vidéo trop volumineuse (${(videoSize / (1024 * 1024)).toFixed(2)}MB). Maximum: 100MB`);
    }

    // Validation 2: Minimum size (should be at least 100KB for a valid video)
    const MIN_SIZE = 100 * 1024; // 100 KB
    if (videoSize < MIN_SIZE) {
      errors.push(`Vidéo trop petite (${(videoSize / 1024).toFixed(2)}KB). Minimum: 100KB`);
    }

    // Validation 3: Content type
    const validContentTypes = [
      'video/mp4',
      'video/quicktime', // .mov
      'video/x-msvideo', // .avi
      'video/webm'
    ];

    if (!validContentTypes.some(type => contentType.includes(type))) {
      errors.push(`Format de vidéo non supporté: ${contentType}. Formats acceptés: MP4, MOV, WebM, AVI`);
    }

    // Validation 4: Check if it's actually a video by checking magic bytes
    const uint8Array = new Uint8Array(videoBuffer.slice(0, 12));
    const header = Array.from(uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');

    // MP4: starts with 00 00 00 xx ftyp
    // WebM: starts with 1a 45 df a3
    // AVI: starts with 52 49 46 46 (RIFF)
    const isMp4 = header.includes('66747970'); // 'ftyp' in hex
    const isWebM = header.startsWith('1a45dfa3');
    const isAvi = header.startsWith('52494646');

    if (!isMp4 && !isWebM && !isAvi) {
      errors.push('Fichier vidéo corrompu ou format invalide. Le fichier doit être une vraie vidéo MP4, WebM ou AVI.');
    }

    // Note: We cannot validate duration, resolution, codec without ffmpeg/ffprobe
    // which requires native binaries incompatible with Vercel serverless
    // These will be validated by TikTok API during upload

    warnings.push('⚠️ Durée, résolution et codec vidéo ne peuvent pas être validés côté serveur (limitations Vercel serverless)');
    warnings.push('TikTok exige: durée 3s-600s, résolution 540p-1080p, codec H.264+AAC, format MP4');
    warnings.push('Si la publication échoue, vérifiez que votre vidéo respecte ces exigences');

    const isValid = errors.length === 0;

    return NextResponse.json({
      ok: true,
      isValid,
      errors,
      warnings,
      metadata: {
        size: videoSize,
        sizeFormatted: `${(videoSize / (1024 * 1024)).toFixed(2)} MB`,
        contentType,
        isMp4,
        isWebM,
        isAvi
      }
    });

  } catch (error: any) {
    console.error('[TikTokValidate] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la validation' },
      { status: 500 }
    );
  }
}
