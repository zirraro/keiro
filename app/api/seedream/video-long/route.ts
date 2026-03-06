export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min max per request

import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { decomposePromptIntoScenes, calculateSegments } from '@/lib/video-scenes';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';
import { getVideoCreditCost } from '@/lib/credits/constants';

// SeedAnce API config (same as t2v/i2v routes)
const SEEDANCE_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDANCE_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

// Valid long-video durations
const VALID_DURATIONS = [15, 30, 45, 60, 90] as const;
type ValidDuration = typeof VALID_DURATIONS[number];

// Supabase admin client for DB operations (bypasses RLS)
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── Segment types for job tracking ───
interface JobSegment {
  index: number;
  duration: number;
  prompt: string;
  type: 'text_to_video' | 'image_to_video';
  taskId: string | null;
  videoUrl: string | null;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  provider: 's' | 'k' | null;
  error?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/seedream/video-long — Create a new multi-segment video generation job
// ══════════════════════════════════════════════════════════════════════════════
export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const { user } = await getAuthUser();
    if (!user) {
      console.log('[video-long] POST rejected: no authenticated user');
      return Response.json({
        ok: false,
        blocked: true,
        reason: 'requires_account',
        cta: true,
      }, { status: 403 });
    }

    // 2. Parse request body
    const body = await request.json();
    const { prompt, duration, aspectRatio = '16:9', imageUrl, mode } = body;

    // 3. Validate duration
    if (!duration || !VALID_DURATIONS.includes(duration as ValidDuration)) {
      console.log('[video-long] POST rejected: invalid duration', duration);
      return Response.json({
        ok: false,
        error: `Durée invalide. Valeurs acceptées: ${VALID_DURATIONS.join(', ')}s`,
      }, { status: 400 });
    }

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return Response.json({
        ok: false,
        error: 'Le prompt est requis',
      }, { status: 400 });
    }

    console.log(`[video-long] POST: user=${user.id}, duration=${duration}s, aspectRatio=${aspectRatio}, hasImage=${!!imageUrl}`);

    // 4. Check credits — use total duration for cost calculation
    const isAdminUser = await isAdmin(user.id);
    if (!isAdminUser) {
      const check = await checkCredits(user.id, 'video_t2v', duration);
      if (!check.allowed) {
        console.log(`[video-long] POST rejected: insufficient credits. cost=${check.cost}, balance=${check.balance}`);
        return Response.json({
          ok: false,
          error: 'Crédits insuffisants',
          insufficientCredits: true,
          cost: check.cost,
          balance: check.balance,
        }, { status: 402 });
      }
    }

    // 5. Decompose prompt into scenes via Claude Haiku
    console.log(`[video-long] Decomposing prompt into scenes for ${duration}s video...`);
    let scenes;
    try {
      scenes = await decomposePromptIntoScenes(prompt, duration, { aspectRatio });
      console.log(`[video-long] Decomposed into ${scenes.length} scenes:`, scenes.map(s => `[${s.index}] ${s.duration}s ${s.type}`));
    } catch (decomposeError: any) {
      console.error('[video-long] Scene decomposition failed:', decomposeError.message);
      // Fallback: manual segment calculation
      const segments = calculateSegments(duration);
      scenes = segments.map((seg, i) => ({
        index: i,
        duration: seg.duration,
        prompt: i === 0 ? prompt : `Continue the previous scene: ${prompt}. Focus on details and movement.`,
        type: i === 0 ? 'text_to_video' as const : 'image_to_video' as const,
      }));
      console.log(`[video-long] Fallback: ${scenes.length} segments from calculateSegments`);
    }

    // 6. Deduct credits upfront
    let newBalance: number | undefined;
    if (!isAdminUser) {
      const creditResult = await deductCredits(user.id, 'video_t2v', `Vidéo ${duration}s (${scenes.length} segments)`, duration);
      newBalance = creditResult.newBalance;
      console.log(`[video-long] Credits deducted. newBalance=${newBalance}`);
    }

    // 7. Build segments array for the job
    const jobSegments: JobSegment[] = scenes.map((scene) => ({
      index: scene.index,
      duration: scene.duration,
      prompt: scene.prompt,
      type: scene.type,
      taskId: null,
      videoUrl: null,
      status: 'pending' as const,
      provider: null,
    }));

    // 8. Start generating segment 0 (first segment)
    let firstTaskId: string;
    let firstProvider: 's' | 'k';
    const firstScene = scenes[0];

    try {
      if (imageUrl && typeof imageUrl === 'string') {
        // First segment with an image → I2V
        console.log('[video-long] Starting segment 0 as I2V with provided image...');
        const result = await startSeedanceI2V(firstScene.prompt, firstScene.duration, imageUrl);
        firstTaskId = result.taskId;
        firstProvider = result.provider;
      } else {
        // First segment without image → T2V
        console.log('[video-long] Starting segment 0 as T2V...');
        const result = await startSeedanceT2V(firstScene.prompt, firstScene.duration, aspectRatio);
        firstTaskId = result.taskId;
        firstProvider = result.provider;
      }
    } catch (startError: any) {
      console.error('[video-long] Failed to start segment 0:', startError.message);
      // Create the job in failed state so credits can be tracked
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.from('video_generation_jobs').insert({
        user_id: user.id,
        status: 'failed',
        total_segments: jobSegments.length,
        completed_segments: 0,
        segments: jobSegments,
        prompt,
        duration,
        aspect_ratio: aspectRatio,
        error: `Échec du démarrage: ${startError.message}`,
      });
      return Response.json({
        ok: false,
        error: 'Impossible de démarrer la génération vidéo',
      }, { status: 500 });
    }

    // Update segment 0 with the task info
    jobSegments[0].taskId = firstTaskId;
    jobSegments[0].status = 'generating';
    jobSegments[0].provider = firstProvider;

    // 9. Create the job in DB
    const supabaseAdmin = getSupabaseAdmin();
    const { data: job, error: insertError } = await supabaseAdmin
      .from('video_generation_jobs')
      .insert({
        user_id: user.id,
        status: 'generating',
        total_segments: jobSegments.length,
        completed_segments: 0,
        current_segment_task_id: firstTaskId,
        segments: jobSegments,
        prompt,
        duration,
        aspect_ratio: aspectRatio,
      })
      .select('id')
      .single();

    if (insertError || !job) {
      console.error('[video-long] Failed to create job in DB:', insertError);
      return Response.json({
        ok: false,
        error: 'Erreur interne: impossible de créer le job',
      }, { status: 500 });
    }

    console.log(`[video-long] Job created: ${job.id}, ${jobSegments.length} segments, first taskId=${firstTaskId}`);

    // 10. Return job info to the client
    return Response.json({
      ok: true,
      jobId: job.id,
      totalSegments: jobSegments.length,
      status: 'generating',
      newBalance,
      creditCost: getVideoCreditCost(duration),
    });

  } catch (error: any) {
    console.error('[video-long] POST unexpected error:', error);
    return Response.json({
      ok: false,
      error: error.message || 'Erreur interne du serveur',
    }, { status: 500 });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/seedream/video-long?jobId=xxx — Poll job status & advance segments
// ══════════════════════════════════════════════════════════════════════════════
export async function GET(request: Request) {
  try {
    // 1. Get jobId from query params
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return Response.json({ ok: false, error: 'jobId est requis' }, { status: 400 });
    }

    // 2. Authenticate user
    const { user } = await getAuthUser();
    if (!user) {
      return Response.json({
        ok: false,
        blocked: true,
        reason: 'requires_account',
      }, { status: 403 });
    }

    // 3. Fetch the job from DB
    const supabaseAdmin = getSupabaseAdmin();
    const { data: job, error: fetchError } = await supabaseAdmin
      .from('video_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !job) {
      console.log(`[video-long] GET: job not found. jobId=${jobId}, user=${user.id}`);
      return Response.json({ ok: false, error: 'Job non trouvé' }, { status: 404 });
    }

    // If job is already completed or failed, return immediately
    if (job.status === 'completed') {
      return Response.json({
        ok: true,
        status: 'completed',
        progress: { completed: job.total_segments, total: job.total_segments },
        segments: job.segments,
        finalVideoUrl: job.final_video_url,
      });
    }

    if (job.status === 'failed') {
      return Response.json({
        ok: false,
        status: 'failed',
        error: job.error || 'La génération a échoué',
        progress: { completed: job.completed_segments, total: job.total_segments },
        segments: job.segments,
      });
    }

    // 4. Job is 'generating' — check current segment's task
    if (job.status === 'generating') {
      const segments: JobSegment[] = job.segments;
      const currentSegmentIndex = segments.findIndex(s => s.status === 'generating');

      if (currentSegmentIndex === -1) {
        console.error(`[video-long] GET: no generating segment found for job ${jobId}`);
        await updateJobStatus(supabaseAdmin, jobId, 'failed', 'Aucun segment en cours de génération');
        return Response.json({
          ok: false,
          status: 'failed',
          error: 'État incohérent: aucun segment en cours',
          progress: { completed: job.completed_segments, total: job.total_segments },
        });
      }

      const currentSegment = segments[currentSegmentIndex];
      console.log(`[video-long] GET: polling segment ${currentSegmentIndex}/${segments.length}, taskId=${currentSegment.taskId}`);

      if (!currentSegment.taskId) {
        console.error(`[video-long] GET: segment ${currentSegmentIndex} has no taskId`);
        await updateJobStatus(supabaseAdmin, jobId, 'failed', `Segment ${currentSegmentIndex} sans taskId`);
        return Response.json({
          ok: false,
          status: 'failed',
          error: `Segment ${currentSegmentIndex} sans identifiant de tâche`,
        });
      }

      // 4a. Poll the SeedAnce/Kling API for this task's status
      try {
        const taskStatus = await checkTaskStatus(currentSegment.taskId, currentSegment.provider || 's');

        if (taskStatus.status === 'completed' && taskStatus.videoUrl) {
          // ─── Segment completed ───
          console.log(`[video-long] Segment ${currentSegmentIndex} completed: ${taskStatus.videoUrl}`);

          segments[currentSegmentIndex].status = 'completed';
          segments[currentSegmentIndex].videoUrl = taskStatus.videoUrl;
          const newCompletedCount = job.completed_segments + 1;

          // Check if more segments remain
          const nextSegmentIndex = currentSegmentIndex + 1;

          if (nextSegmentIndex < segments.length) {
            // ─── Start next segment ───
            console.log(`[video-long] Starting segment ${nextSegmentIndex}/${segments.length}...`);

            try {
              // Next segments are always I2V (using last frame of previous video)
              // TODO: Extract last frame from completed video using FFmpeg
              // For now, use the video URL as reference and generate as T2V with continuation prompt
              const nextScene = segments[nextSegmentIndex];
              let result: { taskId: string; provider: 's' | 'k' };

              // Try I2V approach: the previous video URL could be used for frame extraction
              // For now, fall back to T2V with the scene prompt since frame extraction requires FFmpeg
              // TODO: Implement frame extraction → i2v pipeline
              console.log(`[video-long] Segment ${nextSegmentIndex}: generating as T2V (frame extraction TODO)`);
              result = await startSeedanceT2V(nextScene.prompt, nextScene.duration, job.aspect_ratio || '16:9');

              segments[nextSegmentIndex].taskId = result.taskId;
              segments[nextSegmentIndex].status = 'generating';
              segments[nextSegmentIndex].provider = result.provider;

              await supabaseAdmin
                .from('video_generation_jobs')
                .update({
                  completed_segments: newCompletedCount,
                  current_segment_task_id: result.taskId,
                  segments,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', jobId);

              return Response.json({
                ok: true,
                status: 'generating',
                progress: { completed: newCompletedCount, total: segments.length },
                segments,
                currentSegment: nextSegmentIndex,
              });
            } catch (nextError: any) {
              console.error(`[video-long] Failed to start segment ${nextSegmentIndex}:`, nextError.message);
              segments[nextSegmentIndex].status = 'failed';
              segments[nextSegmentIndex].error = nextError.message;

              await supabaseAdmin
                .from('video_generation_jobs')
                .update({
                  status: 'failed',
                  completed_segments: newCompletedCount,
                  segments,
                  error: `Échec du segment ${nextSegmentIndex}: ${nextError.message}`,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', jobId);

              return Response.json({
                ok: false,
                status: 'failed',
                error: `Échec du segment ${nextSegmentIndex}`,
                progress: { completed: newCompletedCount, total: segments.length },
                segments,
              });
            }
          } else {
            // ─── All segments completed ───
            console.log(`[video-long] All ${segments.length} segments completed!`);

            // TODO: Trigger FFmpeg merge of all segment video URLs
            // For now, mark as completed and store segment URLs (merge in follow-up)
            const allVideoUrls = segments
              .filter(s => s.videoUrl)
              .map(s => s.videoUrl);

            // If only one segment had a video, use it as the final; otherwise await merge
            const finalStatus = segments.length === 1 ? 'completed' : 'merging';
            const finalVideoUrl = segments.length === 1 ? allVideoUrls[0] : null;

            // For now, skip the merge step and mark as completed with all segment URLs
            // The client can display individual segments or trigger a merge later
            await supabaseAdmin
              .from('video_generation_jobs')
              .update({
                status: 'completed',
                completed_segments: newCompletedCount,
                segments,
                final_video_url: finalVideoUrl || null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', jobId);

            return Response.json({
              ok: true,
              status: 'completed',
              progress: { completed: newCompletedCount, total: segments.length },
              segments,
              finalVideoUrl: finalVideoUrl || null,
              segmentUrls: allVideoUrls,
            });
          }
        } else if (taskStatus.status === 'failed') {
          // ─── Current segment failed ───
          console.error(`[video-long] Segment ${currentSegmentIndex} failed: ${taskStatus.error}`);
          segments[currentSegmentIndex].status = 'failed';
          segments[currentSegmentIndex].error = taskStatus.error || 'Generation failed';

          await supabaseAdmin
            .from('video_generation_jobs')
            .update({
              status: 'failed',
              segments,
              error: `Segment ${currentSegmentIndex} échoué: ${taskStatus.error || 'Erreur inconnue'}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', jobId);

          return Response.json({
            ok: false,
            status: 'failed',
            error: `Segment ${currentSegmentIndex + 1}/${segments.length} a échoué`,
            progress: { completed: job.completed_segments, total: segments.length },
            segments,
          });
        } else {
          // ─── Segment still processing ───
          return Response.json({
            ok: true,
            status: 'generating',
            progress: { completed: job.completed_segments, total: segments.length },
            segments,
            currentSegment: currentSegmentIndex,
            taskStatus: taskStatus.status,
          });
        }
      } catch (pollError: any) {
        console.error(`[video-long] Error polling segment ${currentSegmentIndex}:`, pollError.message);
        return Response.json({
          ok: true,
          status: 'generating',
          progress: { completed: job.completed_segments, total: segments.length },
          segments,
          currentSegment: currentSegmentIndex,
          pollError: pollError.message,
        });
      }
    }

    // 5. Job is 'merging' — check merge status
    if (job.status === 'merging') {
      // TODO: Implement merge status polling
      // For now, return merging status with segment URLs
      const segmentUrls = (job.segments as JobSegment[])
        .filter(s => s.videoUrl)
        .map(s => s.videoUrl);

      return Response.json({
        ok: true,
        status: 'merging',
        progress: { completed: job.completed_segments, total: job.total_segments },
        segments: job.segments,
        segmentUrls,
      });
    }

    // Fallback for unexpected statuses
    return Response.json({
      ok: true,
      status: job.status,
      progress: { completed: job.completed_segments, total: job.total_segments },
      segments: job.segments,
    });

  } catch (error: any) {
    console.error('[video-long] GET unexpected error:', error);
    return Response.json({
      ok: false,
      error: error.message || 'Erreur interne du serveur',
    }, { status: 500 });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Helper: Start a SeedAnce T2V task (with Kling fallback)
// ══════════════════════════════════════════════════════════════════════════════
async function startSeedanceT2V(
  prompt: string,
  duration: number,
  aspectRatio: string
): Promise<{ taskId: string; provider: 's' | 'k' }> {
  const ratioFlag = aspectRatio ? ` --ratio ${aspectRatio}` : '';
  const formattedPrompt = `${prompt} --duration ${duration}${ratioFlag} --camerafixed false`;

  try {
    console.log('[video-long] T2V: trying Seedance 1.5 Pro...');
    const response = await fetch(SEEDANCE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDANCE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'seedance-1-5-pro-251215',
        content: [{ type: 'text', text: formattedPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[video-long] T2V Seedance failed:', response.status, errorText);
      throw new Error(`Seedance HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const seedanceId = data.id || data.task_id || data.data?.id || data.data?.task_id;
    if (!seedanceId) {
      console.error('[video-long] T2V Seedance no task ID:', data);
      throw new Error('Seedance returned no task ID');
    }

    console.log('[video-long] T2V Seedance task created:', seedanceId);
    return { taskId: `seedream_${seedanceId}`, provider: 's' };
  } catch (seedanceError: any) {
    console.warn('[video-long] T2V Seedance failed, falling back to Kling:', seedanceError.message);

    // Fallback: Kling T2V
    const { createT2VTask } = await import('@/lib/kling');
    const klingTaskId = await createT2VTask({
      prompt,
      duration: String(duration),
      aspect_ratio: aspectRatio || '16:9',
    });

    console.log('[video-long] T2V Kling fallback task created:', klingTaskId);
    return { taskId: klingTaskId, provider: 'k' };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Helper: Start a SeedAnce I2V task (with Kling fallback)
// ══════════════════════════════════════════════════════════════════════════════
async function startSeedanceI2V(
  prompt: string,
  duration: number,
  imageUrl: string
): Promise<{ taskId: string; provider: 's' | 'k' }> {
  const textPrompt = prompt && prompt.trim()
    ? `${prompt} --duration ${duration} --camerafixed false`
    : `Animate this image with smooth cinematic camera movement --duration ${duration} --camerafixed false`;

  try {
    console.log('[video-long] I2V: trying Seedance 1.5 Pro...');
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: textPrompt },
      { type: 'image_url', image_url: { url: imageUrl } },
    ];

    const response = await fetch(SEEDANCE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDANCE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'seedance-1-5-pro-251215',
        content,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[video-long] I2V Seedance failed:', response.status, errorText);
      throw new Error(`Seedance HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const seedanceId = data.id || data.task_id || data.data?.id || data.data?.task_id;
    if (!seedanceId) {
      console.error('[video-long] I2V Seedance no task ID:', data);
      throw new Error('Seedance returned no task ID');
    }

    console.log('[video-long] I2V Seedance task created:', seedanceId);
    return { taskId: `seedream_${seedanceId}`, provider: 's' };
  } catch (seedanceError: any) {
    console.warn('[video-long] I2V Seedance failed, falling back to Kling:', seedanceError.message);

    // Fallback: Kling I2V
    // Convert URL to base64 for Kling
    let imageBase64 = imageUrl;
    if (imageUrl.startsWith('http')) {
      try {
        const imageResponse = await fetch(imageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (imageResponse.ok) {
          const imageBuffer = await imageResponse.arrayBuffer();
          const base64 = Buffer.from(imageBuffer).toString('base64');
          const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
          imageBase64 = `data:${contentType};base64,${base64}`;
        }
      } catch (e: any) {
        console.warn('[video-long] I2V base64 conversion failed:', e.message);
      }
    }

    const { createI2VTask } = await import('@/lib/kling');
    const klingTaskId = await createI2VTask({
      image: imageBase64,
      prompt: prompt || 'Animate this image with smooth cinematic camera movement',
      duration: String(duration),
    });

    console.log('[video-long] I2V Kling fallback task created:', klingTaskId);
    return { taskId: klingTaskId, provider: 'k' };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Helper: Check task status (SeedAnce or Kling, based on taskId prefix)
// ══════════════════════════════════════════════════════════════════════════════
async function checkTaskStatus(
  taskId: string,
  provider: 's' | 'k'
): Promise<{ status: string; videoUrl?: string; error?: string }> {
  if (taskId.startsWith('seedream_')) {
    return checkSeedanceTaskStatus(taskId.replace('seedream_', ''));
  }

  // Kling task — determine T2V or I2V based on provider
  // Since we use taskId without prefix for Kling, check both endpoints
  const { checkT2VTask, checkI2VTask } = await import('@/lib/kling');

  try {
    const result = await checkT2VTask(taskId);
    return result;
  } catch {
    // If T2V check fails, try I2V
    try {
      const result = await checkI2VTask(taskId);
      return result;
    } catch (error: any) {
      return { status: 'failed', error: error.message };
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Helper: Check SeedAnce task status (same logic as t2v/i2v routes)
// ══════════════════════════════════════════════════════════════════════════════
async function checkSeedanceTaskStatus(
  taskId: string
): Promise<{ status: string; videoUrl?: string; error?: string }> {
  const response = await fetch(`${SEEDANCE_API_URL}/${taskId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${SEEDANCE_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Seedance status error: ${response.status}`);
  }

  const data = await response.json();
  const status = data.status || data.data?.status || data.state || data.data?.state;

  if (status === 'succeeded' || status === 'completed' || status === 'success' || status === 'done') {
    let videoUrl: string | null = null;

    // Search for video URL in different response formats
    if (data.content && typeof data.content === 'object' && !Array.isArray(data.content)) {
      videoUrl = data.content.video_url;
    }
    if (!videoUrl && data.content && Array.isArray(data.content)) {
      for (const item of data.content) {
        if (item.type === 'video_url' && item.video_url?.url) { videoUrl = item.video_url.url; break; }
        if (item.type === 'video' && item.url) { videoUrl = item.url; break; }
        if (item.video_url) { videoUrl = typeof item.video_url === 'string' ? item.video_url : item.video_url.url; break; }
      }
    }
    if (!videoUrl) {
      videoUrl = data.output?.video_url || data.output?.url ||
        data.result?.video_url || data.result?.url ||
        data.video_url || data.url || data.data?.video_url;
    }

    if (videoUrl) {
      return { status: 'completed', videoUrl };
    }
    return { status: 'completed', error: 'Video completed but URL not found' };
  }

  if (status === 'failed' || status === 'error' || status === 'cancelled') {
    return { status: 'failed', error: data.error || 'Video generation failed' };
  }

  return { status: status || 'processing' };
}

// ══════════════════════════════════════════════════════════════════════════════
// Helper: Update job status in DB
// ══════════════════════════════════════════════════════════════════════════════
async function updateJobStatus(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  jobId: string,
  status: string,
  error?: string
) {
  const update: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (error) {
    update.error = error;
  }

  await supabaseAdmin
    .from('video_generation_jobs')
    .update(update)
    .eq('id', jobId);

  console.log(`[video-long] Job ${jobId} status updated to: ${status}${error ? ` (${error})` : ''}`);
}
