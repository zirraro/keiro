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
  console.log('[CloudConvert] Starting conversion...');
  console.log('[CloudConvert] Will update video ID:', videoId || 'none');
  console.log('[CloudConvert] Custom audio:', audioUrl ? '✅ YES' : '❌ NO (sine wave)');

  // Step 1: Create job with tasks
  const tasks: any = {
    'import-video': {
      operation: 'import/url',
      url: videoUrl,
      filename: 'input.mp4'
    }
  };

  // Convert video to TikTok format - CloudConvert will preserve/generate audio track
  console.log('[CloudConvert] Step 1/2: Converting video to TikTok format (H.264 + AAC)');

  tasks['convert-video'] = {
    operation: 'convert',
    input: 'import-video',
    output_format: 'mp4',
    video_codec: 'h264',
    audio_codec: 'aac',
    audio_bitrate: 128,
    audio_frequency: 44100,
    preset: 'medium',
    crf: 23,
    width: 1080,
    height: 1920,
    fit: 'max',
    strip_metadata: false
  };

  tasks['export-video'] = {
    operation: 'export/url',
    input: 'convert-video'
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
        let convertedUrl = exportTask.result.files[0].url;
        console.log('[CloudConvert] ✅ Step 1/2 completed:', convertedUrl);

        // Step 2: Merge audio if provided
        if (audioUrl) {
          console.log('[CloudConvert] Step 2/2: Merging audio with video...');
          console.log('[CloudConvert] Audio URL:', audioUrl);

          // Create second job to merge audio
          const mergeJobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              tasks: {
                'import-video': {
                  operation: 'import/url',
                  url: convertedUrl, // Use converted video from Step 1
                  filename: 'converted.mp4'
                },
                'import-audio': {
                  operation: 'import/url',
                  url: audioUrl,
                  filename: 'narration.mp3'
                },
                'merge': {
                  operation: 'command',
                  engine: 'ffmpeg',
                  command: '-i converted.mp4 -i narration.mp3 -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest output.mp4',
                  input: ['import-video', 'import-audio'],
                  output_format: 'mp4'
                },
                'export-merged': {
                  operation: 'export/url',
                  input: 'merge'
                }
              }
            })
          });

          const mergeJobData = await mergeJobResponse.json();

          if (!mergeJobResponse.ok) {
            console.error('[CloudConvert] Audio merge job creation failed:', mergeJobData);
            console.log('[CloudConvert] ⚠️ Falling back to video without custom audio');
          } else {
            console.log('[CloudConvert] Audio merge job created:', mergeJobData.data.id);

            // Wait for merge job completion
            const mergeJobId = mergeJobData.data.id;
            let mergeAttempts = 0;
            const maxMergeAttempts = 30; // 60 seconds max

            while (mergeAttempts < maxMergeAttempts) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

              const mergeStatusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${mergeJobId}`, {
                headers: {
                  'Authorization': `Bearer ${apiKey}`
                }
              });

              const mergeStatusData = await mergeStatusResponse.json();
              console.log('[CloudConvert] Audio merge job status:', mergeStatusData.data.status);

              if (mergeStatusData.data.status === 'finished') {
                const mergeExportTask = Object.values(mergeStatusData.data.tasks).find(
                  (task: any) => task.name === 'export-merged'
                ) as any;

                if (mergeExportTask?.result?.files?.[0]?.url) {
                  convertedUrl = mergeExportTask.result.files[0].url;
                  console.log('[CloudConvert] ✅ Audio merge completed:', convertedUrl);
                  break;
                }
              }

              if (mergeStatusData.data.status === 'error') {
                console.error('[CloudConvert] Audio merge job failed');
                console.log('[CloudConvert] ⚠️ Using video without custom audio');
                break;
              }

              mergeAttempts++;
            }

            if (mergeAttempts >= maxMergeAttempts) {
              console.log('[CloudConvert] ⚠️ Audio merge timeout, using video without custom audio');
            }
          }
        } else {
          console.log('[CloudConvert] No custom audio provided, using video as-is');
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
