import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/convert-video-tiktok
 * Convert video to TikTok-compatible format using CloudConvert API
 *
 * FREE TIER: 25 conversions/day
 * Alternative: Use client-side ffmpeg.wasm if quota exceeded
 *
 * Body:
 * - videoUrl: URL of video to convert
 *
 * Returns:
 * - convertedUrl: URL of TikTok-ready video (H.264 + AAC)
 * - usedClientSide: boolean (if ffmpeg.wasm was used)
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

    console.log('[ConvertVideo] Converting video to TikTok format:', videoUrl);

    // OPTION 1: Use CloudConvert API (if API key is set)
    const cloudConvertApiKey = process.env.CLOUDCONVERT_API_KEY;

    console.log('[ConvertVideo] CloudConvert API key available:', cloudConvertApiKey ? 'YES ✅' : 'NO ❌');
    console.log('[ConvertVideo] API key length:', cloudConvertApiKey?.length || 0, 'characters');

    if (cloudConvertApiKey) {
      console.log('[ConvertVideo] Starting CloudConvert conversion...');
      try {
        return await convertViaCloudConvert(videoUrl, cloudConvertApiKey);
      } catch (error: any) {
        console.error('[ConvertVideo] ❌ CloudConvert failed:', error.message);
        console.error('[ConvertVideo] Full error:', error);
        // Fall through to client-side option
      }
    } else {
      console.warn('[ConvertVideo] ⚠️ CloudConvert API key not configured in environment variables');
      console.warn('[ConvertVideo] Set CLOUDCONVERT_API_KEY in Vercel environment to enable automatic conversion');
    }

    // OPTION 2: Return error - CloudConvert API key not configured
    console.log('[ConvertVideo] ⚠️ Conversion automatique non disponible - clé API CloudConvert manquante');

    const errorMessage =
      '⚠️ Conversion automatique non configurée\n\n' +
      'La conversion automatique CloudConvert nécessite une clé API.\n\n' +
      '👉 Solution:\n' +
      '1. Ajoutez CLOUDCONVERT_API_KEY dans les variables d\'environnement Vercel\n' +
      '2. Redéployez l\'application\n\n' +
      'Contactez l\'administrateur pour activer cette fonctionnalité.';

    return NextResponse.json({
      ok: false,
      requiresCloudConvertSetup: true,
      videoUrl,
      error: 'Conversion automatique non disponible - Clé API CloudConvert manquante',
      message: errorMessage,
      adminNote: 'Set CLOUDCONVERT_API_KEY environment variable in Vercel to enable automatic video conversion'
    }, { status: 503 });

  } catch (error: any) {
    console.error('[ConvertVideo] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la conversion' },
      { status: 500 }
    );
  }
}

/**
 * Convert video using CloudConvert API
 * Free tier: 25 conversions/day
 * https://cloudconvert.com/api/v2
 */
async function convertViaCloudConvert(videoUrl: string, apiKey: string) {
  console.log('[CloudConvert] Starting conversion...');

  // Step 1: Create job
  const createJobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tasks: {
        'import-video': {
          operation: 'import/url',
          url: videoUrl,
          filename: 'input.mp4'
        },
        'convert-video': {
          operation: 'convert',
          input: 'import-video',
          output_format: 'mp4',
          engine: 'ffmpeg',
          video_codec: 'h264',
          audio_codec: 'aac',
          audio_bitrate: 128,
          preset: 'medium',
          fit: 'max',
          width: 1080,
          height: 1920
        },
        'export-video': {
          operation: 'export/url',
          input: 'convert-video'
        }
      }
    })
  });

  const jobData = await createJobResponse.json();

  if (!createJobResponse.ok) {
    console.error('[CloudConvert] Job creation failed:', jobData);
    throw new Error(jobData.message || 'CloudConvert job creation failed');
  }

  console.log('[CloudConvert] Job created:', jobData.data.id);

  // Step 2: Wait for job completion (poll every 2 seconds, max 60 seconds)
  const jobId = jobData.data.id;
  let attempts = 0;
  const maxAttempts = 30; // 60 seconds max

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

    const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const statusData = await statusResponse.json();

    console.log('[CloudConvert] Job status:', statusData.data.status);

    if (statusData.data.status === 'finished') {
      // Find export task
      const exportTask = Object.values(statusData.data.tasks).find(
        (task: any) => task.name === 'export-video'
      ) as any;

      if (exportTask?.result?.files?.[0]?.url) {
        const convertedUrl = exportTask.result.files[0].url;
        console.log('[CloudConvert] ✅ Conversion completed:', convertedUrl);

        return NextResponse.json({
          ok: true,
          convertedUrl,
          originalUrl: videoUrl,
          method: 'cloudconvert',
          usedCloudConvert: true
        });
      }
    }

    if (statusData.data.status === 'error') {
      throw new Error('CloudConvert job failed');
    }

    attempts++;
  }

  throw new Error('CloudConvert timeout after 60 seconds');
}

/**
 * Setup instructions:
 *
 * 1. Create CloudConvert account (free): https://cloudconvert.com/register
 * 2. Get API key: https://cloudconvert.com/dashboard/api/v2/keys
 * 3. Add to .env.local:
 *    CLOUDCONVERT_API_KEY=your_api_key_here
 *
 * Free tier: 25 conversions/day (sufficient for testing)
 * Paid: $9/month for 500 conversions
 */
