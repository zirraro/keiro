import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';

/**
 * POST /api/convert-video-instagram
 * Convert video to Instagram Reels-compatible format using CloudConvert API
 *
 * Instagram Reels Specifications:
 * - Format: MP4
 * - Codec: H.264 (BASELINE profile - important!)
 * - Audio: AAC, 44.1kHz, stereo
 * - Resolution: 1080x1920 (9:16 strict)
 * - Duration: 3-90 seconds
 * - Max size: 1GB
 * - Frame rate: 30fps
 *
 * FREE TIER: 25 conversions/day
 *
 * Body:
 * - videoUrl: URL of video to convert
 * - videoId: Optional ID to update my_videos table
 * - audioUrl: Optional audio URL to merge with video
 *
 * Returns:
 * - convertedUrl: URL of Instagram Reels-ready video (H.264 baseline + AAC)
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

    console.log('[ConvertVideoInstagram] User ID:', user.id);
    console.log('[ConvertVideoInstagram] Converting video to Instagram Reels format:', videoUrl);
    console.log('[ConvertVideoInstagram] Video ID for update:', videoId || 'none (new video)');
    console.log('[ConvertVideoInstagram] Audio URL:', audioUrl || 'none (will use sine wave)');

    // Use CloudConvert API (if API key is set)
    const cloudConvertApiKey = process.env.CLOUDCONVERT_API_KEY;

    console.log('[ConvertVideoInstagram] CloudConvert API key available:', cloudConvertApiKey ? 'YES ✅' : 'NO ❌');

    if (cloudConvertApiKey) {
      console.log('[ConvertVideoInstagram] Starting CloudConvert conversion for Instagram Reels...');
      try {
        return await convertViaCloudConvert(videoUrl, cloudConvertApiKey, videoId, audioUrl, user.id);
      } catch (error: any) {
        console.error('[ConvertVideoInstagram] ❌ CloudConvert failed:', error.message);
        console.error('[ConvertVideoInstagram] Full error:', error);

        return NextResponse.json({
          ok: false,
          error: `Échec de la conversion CloudConvert: ${error.message}`,
          details: error.toString(),
          cloudconvertError: true
        }, { status: 500 });
      }
    }

    // Return error - CloudConvert API key not configured
    console.log('[ConvertVideoInstagram] ⚠️ Conversion automatique non disponible - clé API CloudConvert manquante');

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
    console.error('[ConvertVideoInstagram] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la conversion' },
      { status: 500 }
    );
  }
}

/**
 * Convert video using CloudConvert API for Instagram Reels
 * Free tier: 25 conversions/day
 * https://cloudconvert.com/api/v2
 *
 * Key differences from TikTok:
 * - video_codec_profile: 'baseline' (Instagram requirement)
 * - fit: 'crop' (strict 9:16 aspect ratio)
 * - fps: 30 (Instagram recommendation)
 *
 * @param videoId - Optional: If provided, updates my_videos.video_url with converted URL
 * @param audioUrl - Optional: Custom audio URL to merge (instead of sine wave)
 */
async function convertViaCloudConvert(videoUrl: string, apiKey: string, videoId?: string, audioUrl?: string, userId?: string) {
  console.log('[CloudConvert] Starting simple Instagram Reels conversion (no audio merge)...');
  console.log('[CloudConvert] Will update video ID:', videoId || 'none');
  console.log('[CloudConvert] Note: Audio merge temporarily disabled due to FFmpeg issues');

  // Simple 1-job conversion without audio merge
  // Instagram Reels requirements: MP4, H.264 baseline, AAC, 9:16, 30fps
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
      profile: 'baseline', // Instagram requires baseline profile
      audio_codec: 'aac',
      audio_bitrate: 128, // Instagram recommended
      video_bitrate: 5000, // 5 Mbps for good quality
      width: 1080,
      height: 1920,
      fit: 'crop', // Strict 9:16 aspect ratio
      pixel_format: 'yuv420p', // Required for mobile compatibility
      fps: 30
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
        // This ensures the URL is stable and accessible for Instagram
        console.log('[CloudConvert] Downloading final video...');
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
        const fileName = `instagram-reel-converted-${timestamp}.mp4`;
        const storagePath = `instagram-converted/${fileName}`;

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
              instagram_converted: true,
              converted_at: new Date().toISOString()
            })
            .eq('id', videoId);

          if (updateError) {
            console.error('[CloudConvert] Failed to update my_videos:', updateError);
            // Don't throw - conversion succeeded, just log the warning
          } else {
            console.log('[CloudConvert] ✅ Updated my_videos.video_url successfully');
          }

          // Create Instagram draft for converted video
          if (userId) {
            console.log('[CloudConvert] Creating Instagram draft for converted Reel...');

            // Get video details for draft
            const { data: videoData } = await supabase
              .from('my_videos')
              .select('title, thumbnail_url')
              .eq('id', videoId)
              .single();

            const { error: draftError } = await supabase
              .from('instagram_drafts')
              .insert({
                user_id: userId,
                video_id: videoId,
                media_url: finalUrl,
                media_type: 'video',
                category: 'draft', // Instagram uses 'draft' (not 'converted' like TikTok)
                status: 'ready',
                caption: videoData?.title || 'Reel Instagram converti'
              });

            if (draftError) {
              console.error('[CloudConvert] Failed to create draft:', draftError);
              // Don't throw - conversion succeeded, draft creation is optional
            } else {
              console.log('[CloudConvert] ✅ Created Instagram draft for converted Reel');
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
          videoUpdated: !!videoId,
          platform: 'instagram-reels'
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
 *
 * Instagram Reels Requirements:
 * - H.264 codec with BASELINE profile (not main/high)
 * - 9:16 aspect ratio strict (1080x1920)
 * - AAC audio, 44.1kHz, stereo
 * - 30fps frame rate
 * - 3-90 seconds duration
 * - Max 1GB file size
 */
