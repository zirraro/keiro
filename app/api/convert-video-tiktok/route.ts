import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';

/**
 * POST /api/convert-video-tiktok
 * Convert video to TikTok-compatible format using CloudConvert API
 *
 * FREE TIER: 25 conversions/day
 * Alternative: Use client-side ffmpeg.wasm if quota exceeded
 *
 * Body:
 * - videoUrl: URL of video to convert
 * - videoId: Optional ID to update my_videos table
 * - audioUrl: Optional audio URL to merge with video
 *
 * Returns:
 * - convertedUrl: URL of TikTok-ready video (H.264 + AAC)
 * - usedClientSide: boolean (if ffmpeg.wasm was used)
 */
export async function POST(req: NextRequest) {
  try {
    // Get authenticated user
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const { videoUrl, videoId, audioUrl } = await req.json();

    if (!videoUrl) {
      return NextResponse.json(
        { ok: false, error: 'URL de la vidéo manquante' },
        { status: 400 }
      );
    }

    console.log('[ConvertVideo] User ID:', user.id);
    console.log('[ConvertVideo] Converting video to TikTok format:', videoUrl);
    console.log('[ConvertVideo] Video ID for update:', videoId || 'none (new video)');
    console.log('[ConvertVideo] Audio URL:', audioUrl || 'none (will use sine wave)');

    // OPTION 1: Use CloudConvert API (if API key is set)
    const cloudConvertApiKey = process.env.CLOUDCONVERT_API_KEY;

    console.log('[ConvertVideo] CloudConvert API key available:', cloudConvertApiKey ? 'YES ✅' : 'NO ❌');
    console.log('[ConvertVideo] API key length:', cloudConvertApiKey?.length || 0, 'characters');

    if (cloudConvertApiKey) {
      console.log('[ConvertVideo] Starting CloudConvert conversion...');
      try {
        return await convertViaCloudConvert(videoUrl, cloudConvertApiKey, videoId, audioUrl, user.id);
      } catch (error: any) {
        console.error('[ConvertVideo] ❌ CloudConvert failed:', error.message);
        console.error('[ConvertVideo] Full error:', error);

        // Return the actual CloudConvert error instead of "key missing"
        return NextResponse.json({
          ok: false,
          error: `Échec de la conversion CloudConvert: ${error.message}`,
          details: error.toString(),
          cloudconvertError: true
        }, { status: 500 });
      }
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
 *
 * @param videoId - Optional: If provided, updates my_videos.video_url with converted URL
 * @param audioUrl - Optional: Custom audio URL to merge (instead of sine wave)
 */
async function convertViaCloudConvert(videoUrl: string, apiKey: string, videoId?: string, audioUrl?: string, userId?: string) {
  console.log('[CloudConvert] Starting simple conversion (no audio merge)...');
  console.log('[CloudConvert] Will update video ID:', videoId || 'none');
  console.log('[CloudConvert] Note: Audio merge temporarily disabled due to FFmpeg issues');

  // Simple 1-job conversion without audio merge
  // TikTok requirements: MP4, H.264 (x264), AAC, 9:16 aspect ratio
  const tasks: any = {
    'import-video': {
      operation: 'import/url',
      url: videoUrl,
      filename: 'input-video'
    },
    'convert-video': {
      operation: 'convert',
      input: 'import-video',
      output_format: 'mp4',
      video_codec: 'x264', // CloudConvert uses 'x264' not 'h264'
      audio_codec: 'aac',
      audio_bitrate: 128, // TikTok recommended
      video_bitrate: 5000, // 5 Mbps for good quality
      width: 1080,
      height: 1920,
      fit: 'crop', // Force 9:16 aspect ratio (crop if needed)
      pixel_format: 'yuv420p', // Required for mobile compatibility
      preset: 'medium' // Balance between speed and quality
    },
    'export-video': {
      operation: 'export/url',
      input: 'convert-video'
    }
  };

  const createJobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tasks })
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

        // Note: Audio merge temporarily disabled - using converted video as-is
        if (audioUrl) {
          console.log('[CloudConvert] ⚠️ Audio TTS ignored (merge temporarily disabled)');
        }

        // Download final video and upload to Supabase Storage
        // This ensures the URL is stable and accessible for TikTok
        console.log('[CloudConvert] Downloading converted video...');
        const videoResponse = await fetch(convertedUrl);

        if (!videoResponse.ok) {
          throw new Error(`Failed to download converted video: ${videoResponse.status}`);
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        const videoSize = videoBuffer.byteLength;
        console.log('[CloudConvert] Video downloaded, size:', (videoSize / (1024 * 1024)).toFixed(2), 'MB');

        // Upload to Supabase Storage
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const timestamp = Date.now();
        const fileName = `tiktok-converted-${timestamp}.mp4`;
        const storagePath = `tiktok-converted/${fileName}`;

        console.log('[CloudConvert] Uploading to Supabase Storage:', storagePath);
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('generated-images')
          .upload(storagePath, Buffer.from(videoBuffer), {
            contentType: 'video/mp4',
            upsert: false
          });

        if (uploadError) {
          console.error('[CloudConvert] Supabase upload failed:', uploadError);
          throw new Error(`Failed to upload to Supabase: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('generated-images')
          .getPublicUrl(storagePath);

        const finalUrl = urlData.publicUrl;
        console.log('[CloudConvert] ✅ Video saved to Supabase:', finalUrl);

        // Update my_videos table with converted URL if videoId provided
        if (videoId) {
          console.log('[CloudConvert] Updating my_videos with converted URL for video:', videoId);
          const { error: updateError } = await supabase
            .from('my_videos')
            .update({
              video_url: finalUrl,
              tiktok_converted: true,
              converted_at: new Date().toISOString()
            })
            .eq('id', videoId);

          if (updateError) {
            console.error('[CloudConvert] Failed to update my_videos:', updateError);
            // Don't throw - conversion succeeded, just log the warning
          } else {
            console.log('[CloudConvert] ✅ Updated my_videos.video_url successfully');
          }

          // Create TikTok draft for converted video
          if (userId) {
            console.log('[CloudConvert] Creating TikTok draft for converted video...');

            // Get video details for draft
            const { data: videoData } = await supabase
              .from('my_videos')
              .select('title, thumbnail_url')
              .eq('id', videoId)
              .single();

            const { error: draftError } = await supabase
              .from('tiktok_drafts')
              .insert({
                user_id: userId,
                video_id: videoId,
                media_url: finalUrl,
                media_type: 'video',
                category: 'converted',
                status: 'ready',
                caption: videoData?.title || 'Vidéo convertie pour TikTok'
              });

            if (draftError) {
              console.error('[CloudConvert] Failed to create draft:', draftError);
              // Don't throw - conversion succeeded, draft creation is optional
            } else {
              console.log('[CloudConvert] ✅ Created TikTok draft for converted video');
            }
          }
        }

        return NextResponse.json({
          ok: true,
          convertedUrl: finalUrl,
          originalUrl: videoUrl,
          method: 'cloudconvert',
          usedCloudConvert: true,
          videoSize: videoSize,
          videoUpdated: !!videoId
        });
      }
    }

    if (statusData.data.status === 'error') {
      console.error('[CloudConvert] Job failed, full status:', JSON.stringify(statusData, null, 2));

      // Extract error details from failed tasks
      const failedTasks = Object.values(statusData.data.tasks || {})
        .filter((task: any) => task.status === 'error')
        .map((task: any) => ({
          name: task.name,
          message: task.message || task.error || 'Unknown error',
          code: task.code
        }));

      const errorDetails = failedTasks.length > 0
        ? failedTasks.map(t => `${t.name}: ${t.message}`).join('; ')
        : 'Unknown error from CloudConvert';

      console.error('[CloudConvert] Failed tasks:', failedTasks);

      throw new Error(`CloudConvert: ${errorDetails}`);
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
