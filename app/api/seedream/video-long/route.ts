export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min max per request

import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { decomposePromptIntoScenes, calculateSegments } from '@/lib/video-scenes';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';
import { getVideoCreditCost } from '@/lib/credits/constants';
import { enhanceVideoPrompt } from '@/lib/video-prompt-enhancer';
import { writeFile, unlink, mkdir, readFile, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';

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
    const { prompt, duration, aspectRatio = '16:9', imageUrl, mode, segments: advancedSegments } = body;

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

    // 5. Enhance prompt with cinematic motion directives
    let enhancedPrompt = prompt;
    try {
      console.log(`[video-long] Enhancing prompt with cinematic directives...`);
      enhancedPrompt = await enhanceVideoPrompt(prompt, {
        duration,
        aspectRatio,
        renderStyle: body.renderStyle,
        tone: body.tone,
        visualStyle: body.visualStyle,
      });
      console.log(`[video-long] Enhanced prompt: ${enhancedPrompt.substring(0, 200)}...`);
    } catch (enhanceError: any) {
      console.warn('[video-long] Prompt enhancement failed, using raw prompt:', enhanceError.message);
    }

    // 5b. If advanced segments are provided, use them directly (skip decomposition)
    if (advancedSegments && Array.isArray(advancedSegments) && advancedSegments.length > 0) {
      console.log(`[video-long] Using ${advancedSegments.length} pre-configured advanced segments`);

      const cameraMap: Record<string, string> = {
        dolly_in: 'Slow cinematic dolly in',
        pan_left: 'Smooth panoramic pan from right to left',
        pan_right: 'Smooth panoramic pan from left to right',
        tracking: 'Dynamic tracking shot following the subject',
        crane: 'Elegant crane shot rising upward',
        steadicam: 'Fluid steadicam following movement',
        static: 'Locked-off static shot with subject movement',
        tilt_up: 'Gradual tilt upward revealing the scene',
        tilt_down: 'Slow tilt downward from sky to ground level',
      };

      const transitionMap: Record<string, string> = {
        smooth: 'Seamlessly flowing into the next shot',
        cut: 'Clean precise cut',
        fade: 'Gentle fade transition',
        zoom: 'Dynamic zoom transition',
      };

      const jobSegments: JobSegment[] = advancedSegments.map((seg: any, i: number) => {
        const camera = cameraMap[seg.cameraMovement] || 'Smooth cinematic camera movement';
        const transition = i < advancedSegments.length - 1 ? (transitionMap[seg.transition] || '') : '';
        const segPrompt = `${seg.prompt || enhancedPrompt}. ${camera}. ${transition} ABSOLUTELY ZERO text, words, letters, watermarks.`.trim();

        return {
          index: i,
          duration: seg.duration || 10,
          prompt: segPrompt,
          type: (i === 0 ? 'text_to_video' : 'image_to_video') as 'text_to_video' | 'image_to_video',
          taskId: null,
          videoUrl: null,
          status: 'pending' as const,
          provider: null,
        };
      });

      // Skip to segment 0 start (jump past scene decomposition)
      // Start generating segment 0
      let firstTaskId: string;
      let firstProvider: 's' | 'k';

      try {
        if (imageUrl && typeof imageUrl === 'string') {
          const result = await startSeedanceI2V(jobSegments[0].prompt, jobSegments[0].duration, imageUrl);
          firstTaskId = result.taskId;
          firstProvider = result.provider;
        } else {
          const result = await startSeedanceT2V(jobSegments[0].prompt, jobSegments[0].duration, aspectRatio);
          firstTaskId = result.taskId;
          firstProvider = result.provider;
        }
      } catch (startError: any) {
        console.error('[video-long] Failed to start advanced segment 0:', startError.message);
        return Response.json({
          ok: false,
          error: 'Impossible de démarrer la génération vidéo. Aucun crédit déduit.',
        }, { status: 500 });
      }

      // Deduct credits
      let newBalance: number | undefined;
      if (!isAdminUser) {
        const totalDuration = jobSegments.reduce((sum, s) => sum + s.duration, 0);
        const creditResult = await deductCredits(user.id, 'video_t2v', `Vidéo ${totalDuration}s (${jobSegments.length} segments avancés)`, totalDuration);
        newBalance = creditResult.newBalance;
      }

      jobSegments[0].taskId = firstTaskId;
      jobSegments[0].status = 'generating';
      jobSegments[0].provider = firstProvider;

      const totalDuration = jobSegments.reduce((sum, s) => sum + s.duration, 0);

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
          duration: totalDuration,
          aspect_ratio: aspectRatio,
        })
        .select('id')
        .single();

      if (insertError || !job) {
        console.error('[video-long] Failed to create advanced job:', insertError);
        return Response.json({
          ok: false,
          error: `Erreur création job: ${insertError?.message || 'Réponse vide'}`,
        }, { status: 500 });
      }

      return Response.json({
        ok: true,
        jobId: job.id,
        totalSegments: jobSegments.length,
        status: 'generating',
        newBalance,
        creditCost: getVideoCreditCost(totalDuration),
      });
    }

    // 6. Decompose prompt into scenes via Claude Haiku (with full style context)
    console.log(`[video-long] Decomposing prompt into scenes for ${duration}s video...`);
    let scenes;
    try {
      scenes = await decomposePromptIntoScenes(enhancedPrompt, duration, {
        aspectRatio,
        renderStyle: body.renderStyle,
        characterStyle: body.characterStyle,
        tone: body.tone,
        visualStyle: body.visualStyle,
      });
      console.log(`[video-long] Decomposed into ${scenes.length} scenes:`, scenes.map(s => `[${s.index}] ${s.duration}s ${s.type}`));
    } catch (decomposeError: any) {
      console.error('[video-long] Scene decomposition failed:', decomposeError.message);
      // Fallback: manual segment calculation
      const segments = calculateSegments(duration);
      scenes = segments.map((seg, i) => ({
        index: i,
        duration: seg.duration,
        prompt: i === 0 ? enhancedPrompt : `Continue the previous scene: ${enhancedPrompt}. Focus on details and movement.`,
        type: i === 0 ? 'text_to_video' as const : 'image_to_video' as const,
      }));
      console.log(`[video-long] Fallback: ${scenes.length} segments from calculateSegments`);
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

    // 8. Start generating segment 0 FIRST (before deducting credits)
    let firstTaskId: string;
    let firstProvider: 's' | 'k';
    const firstScene = scenes[0];

    try {
      if (imageUrl && typeof imageUrl === 'string') {
        console.log('[video-long] Starting segment 0 as I2V with provided image...');
        const result = await startSeedanceI2V(firstScene.prompt, firstScene.duration, imageUrl);
        firstTaskId = result.taskId;
        firstProvider = result.provider;
      } else {
        console.log('[video-long] Starting segment 0 as T2V...');
        const result = await startSeedanceT2V(firstScene.prompt, firstScene.duration, aspectRatio);
        firstTaskId = result.taskId;
        firstProvider = result.provider;
      }
    } catch (startError: any) {
      console.error('[video-long] Failed to start segment 0:', startError.message);
      // NO credits deducted — segment never started, user is not charged
      return Response.json({
        ok: false,
        error: 'Impossible de démarrer la génération vidéo. Aucun crédit déduit.',
      }, { status: 500 });
    }

    // 9. Deduct credits AFTER successful segment 0 start (user gets charged only if generation begins)
    let newBalance: number | undefined;
    if (!isAdminUser) {
      const creditResult = await deductCredits(user.id, 'video_t2v', `Vidéo ${duration}s (${scenes.length} segments)`, duration);
      newBalance = creditResult.newBalance;
      console.log(`[video-long] Credits deducted after segment 0 start. newBalance=${newBalance}`);
    }

    // Update segment 0 with the task info
    jobSegments[0].taskId = firstTaskId;
    jobSegments[0].status = 'generating';
    jobSegments[0].provider = firstProvider;

    // 10. Create the job in DB
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

      // If schema cache issue, try to reload and retry once
      if (insertError?.message?.includes('schema cache')) {
        console.log('[video-long] Schema cache issue detected, retrying insert...');
        try {
          // Force schema reload via direct SQL
          try { await supabaseAdmin.rpc('reload_schema_cache'); } catch (_) { /* ignore */ }
          // Wait 1s for cache to refresh
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Retry insert
          const { data: retryJob, error: retryError } = await supabaseAdmin
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

          if (!retryError && retryJob) {
            console.log(`[video-long] Retry succeeded! Job created: ${retryJob.id}`);
            return Response.json({
              ok: true,
              jobId: retryJob.id,
              totalSegments: jobSegments.length,
              status: 'generating',
              newBalance,
              creditCost: getVideoCreditCost(duration),
            });
          }
          console.error('[video-long] Retry also failed:', retryError);
        } catch (retryErr: any) {
          console.error('[video-long] Schema reload failed:', retryErr.message);
        }
      }

      return Response.json({
        ok: false,
        error: `Erreur création job: ${insertError?.message || insertError?.code || 'Réponse vide'}. Vérifiez que la table video_generation_jobs existe et exécutez NOTIFY pgrst, 'reload schema' dans Supabase SQL Editor.`,
      }, { status: 500 });
    }

    console.log(`[video-long] Job created: ${job.id}, ${jobSegments.length} segments, first taskId=${firstTaskId}`);

    // 11. Return job info to the client
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
        completedSegments: job.total_segments, totalSegments: job.total_segments,
        segments: job.segments,
        finalVideoUrl: job.final_video_url,
      });
    }

    if (job.status === 'failed') {
      return Response.json({
        ok: false,
        status: 'failed',
        error: job.error || 'La génération a échoué',
        completedSegments: job.completed_segments, totalSegments: job.total_segments,
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
          completedSegments: job.completed_segments, totalSegments: job.total_segments,
        });
      }

      const currentSegment = segments[currentSegmentIndex];
      console.log(`[video-long] GET: polling segment ${currentSegmentIndex}/${segments.length}, taskId=${currentSegment.taskId}`);

      // Race condition guard: capture updated_at to use as optimistic lock
      const jobUpdatedAt = job.updated_at;

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

          // Race condition guard: optimistic lock via updated_at
          // Only the first polling request to reach this point will win the update.
          // If another request already changed updated_at, this update matches 0 rows.
          const lockTimestamp = new Date().toISOString();
          const { data: lockRows, error: lockError } = await supabaseAdmin
            .from('video_generation_jobs')
            .update({ updated_at: lockTimestamp })
            .eq('id', jobId)
            .eq('updated_at', jobUpdatedAt)
            .select('id');

          if (lockError || !lockRows || lockRows.length === 0) {
            // Another polling request already advanced the pipeline — return current state
            console.log(`[video-long] GET: race condition detected for job ${jobId}, returning stale-safe response`);
            const { data: freshJob } = await supabaseAdmin
              .from('video_generation_jobs')
              .select('*')
              .eq('id', jobId)
              .single();
            return Response.json({
              ok: true,
              status: freshJob?.status || 'generating',
              completedSegments: freshJob?.completed_segments ?? job.completed_segments,
              totalSegments: freshJob?.total_segments ?? job.total_segments,
              segments: freshJob?.segments ?? segments,
              finalVideoUrl: freshJob?.final_video_url || undefined,
            });
          }

          segments[currentSegmentIndex].status = 'completed';
          segments[currentSegmentIndex].videoUrl = taskStatus.videoUrl;
          const newCompletedCount = job.completed_segments + 1;

          // Check if more segments remain
          const nextSegmentIndex = currentSegmentIndex + 1;

          if (nextSegmentIndex < segments.length) {
            // ─── Start next segment ───
            console.log(`[video-long] Starting segment ${nextSegmentIndex}/${segments.length}...`);

            try {
              const nextScene = segments[nextSegmentIndex];
              let result: { taskId: string; provider: 's' | 'k' };

              // Extract last frame from completed video for I2V continuity
              const previousVideoUrl = taskStatus.videoUrl!;
              let lastFrameUrl: string | null = null;

              try {
                console.log(`[video-long] Extracting last frame from segment ${currentSegmentIndex}...`);
                lastFrameUrl = await extractLastFrame(previousVideoUrl, job.user_id);
                console.log(`[video-long] Last frame extracted: ${lastFrameUrl}`);
              } catch (extractError: any) {
                console.warn(`[video-long] Frame extraction failed, falling back to T2V:`, extractError.message);
              }

              if (lastFrameUrl) {
                // I2V with last frame for visual continuity
                console.log(`[video-long] Segment ${nextSegmentIndex}: I2V with last frame`);
                result = await startSeedanceI2V(nextScene.prompt, nextScene.duration, lastFrameUrl);
              } else {
                // Fallback: T2V with continuation prompt
                console.log(`[video-long] Segment ${nextSegmentIndex}: T2V fallback`);
                result = await startSeedanceT2V(nextScene.prompt, nextScene.duration, job.aspect_ratio || '16:9');
              }

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
                completedSegments: newCompletedCount,
                totalSegments: segments.length,
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
                completedSegments: newCompletedCount, totalSegments: segments.length,
                segments,
              });
            }
          } else {
            // ─── All segments completed — trigger merge ───
            console.log(`[video-long] All ${segments.length} segments completed! Starting merge...`);

            const allVideoUrls = segments
              .filter(s => s.videoUrl)
              .map(s => s.videoUrl);

            if (segments.length === 1) {
              // Single segment — no merge needed
              await supabaseAdmin
                .from('video_generation_jobs')
                .update({
                  status: 'completed',
                  completed_segments: newCompletedCount,
                  segments,
                  final_video_url: allVideoUrls[0] || null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', jobId);

              return Response.json({
                ok: true,
                status: 'completed',
                completedSegments: newCompletedCount,
                totalSegments: segments.length,
                segments,
                finalVideoUrl: allVideoUrls[0] || null,
              });
            }

            // Multiple segments — merge directly (inline FFmpeg, no HTTP call)
            console.log(`[video-long] All segments done. Merging ${allVideoUrls.length} segments inline...`);

            await supabaseAdmin
              .from('video_generation_jobs')
              .update({
                status: 'merging',
                completed_segments: newCompletedCount,
                segments,
                updated_at: new Date().toISOString(),
              })
              .eq('id', jobId);

            try {
              const mergedUrl = await mergeSegments(allVideoUrls as string[], job.user_id, jobId);
              // mergeSegments already updates job to 'completed' in DB
              return Response.json({
                ok: true,
                status: 'completed',
                completedSegments: newCompletedCount,
                totalSegments: segments.length,
                segments,
                finalVideoUrl: mergedUrl,
              });
            } catch (mergeError: any) {
              console.error(`[video-long] Merge failed:`, mergeError.message);
              // mergeSegments already updates job to 'failed' in DB
              return Response.json({
                ok: false,
                status: 'failed',
                error: `Fusion échouée: ${mergeError.message}`,
                completedSegments: newCompletedCount,
                totalSegments: segments.length,
                segments,
              });
            }
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
            completedSegments: job.completed_segments, totalSegments: segments.length,
            segments,
          });
        } else {
          // ─── Segment still processing ───
          return Response.json({
            ok: true,
            status: 'generating',
            completedSegments: job.completed_segments, totalSegments: segments.length,
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
          completedSegments: job.completed_segments, totalSegments: segments.length,
          segments,
          currentSegment: currentSegmentIndex,
          pollError: pollError.message,
        });
      }
    }

    // 5. Job is 'merging' — check if merge is done (by checking if final_video_url is set)
    if (job.status === 'merging') {
      // Re-fetch to check if merge completed (the merge route updates the job)
      const { data: freshJob } = await supabaseAdmin
        .from('video_generation_jobs')
        .select('status, final_video_url, error')
        .eq('id', jobId)
        .single();

      if (freshJob?.status === 'completed' && freshJob.final_video_url) {
        return Response.json({
          ok: true,
          status: 'completed',
          completedSegments: job.total_segments,
          totalSegments: job.total_segments,
          segments: job.segments,
          finalVideoUrl: freshJob.final_video_url,
        });
      }

      if (freshJob?.status === 'failed') {
        return Response.json({
          ok: false,
          status: 'failed',
          error: freshJob.error || 'Merge failed',
          segments: job.segments,
        });
      }

      // Still merging
      return Response.json({
        ok: true,
        status: 'merging',
        completedSegments: job.completed_segments,
        totalSegments: job.total_segments,
        segments: job.segments,
      });
    }

    // Fallback for unexpected statuses
    return Response.json({
      ok: true,
      status: job.status,
      completedSegments: job.completed_segments, totalSegments: job.total_segments,
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
    // Retry Seedance once before falling back to Kling (avoid provider mixing)
    console.warn('[video-long] T2V Seedance failed, retrying once...', seedanceError.message);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
      const retryResponse = await fetch(SEEDANCE_API_URL, {
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

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        const retrySeedanceId = retryData.id || retryData.task_id || retryData.data?.id || retryData.data?.task_id;
        if (retrySeedanceId) {
          console.log('[video-long] T2V Seedance retry succeeded:', retrySeedanceId);
          return { taskId: `seedream_${retrySeedanceId}`, provider: 's' };
        }
      }
    } catch (retryError: any) {
      console.warn('[video-long] T2V Seedance retry also failed:', retryError.message);
    }

    // Final fallback: Kling T2V
    console.warn('[video-long] T2V falling back to Kling after Seedance retry failed');
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
  // Enrich I2V prompt with continuity instructions
  const continuityPrefix = 'Seamlessly continue from this exact frame. Maintain identical lighting, color grading, and atmosphere.';
  const textPrompt = prompt && prompt.trim()
    ? `${continuityPrefix} ${prompt} Smooth natural camera movement continuing the previous shot. --duration ${duration} --camerafixed false`
    : `${continuityPrefix} Animate this image with smooth cinematic camera movement, maintaining exact visual consistency. --duration ${duration} --camerafixed false`;

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
    // Retry Seedance once before falling back to Kling (avoid provider mixing)
    console.warn('[video-long] I2V Seedance failed, retrying once...', seedanceError.message);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const retryContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: 'text', text: textPrompt },
        { type: 'image_url', image_url: { url: imageUrl } },
      ];
      const retryResponse = await fetch(SEEDANCE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SEEDANCE_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'seedance-1-5-pro-251215',
          content: retryContent,
        }),
      });

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        const retrySeedanceId = retryData.id || retryData.task_id || retryData.data?.id || retryData.data?.task_id;
        if (retrySeedanceId) {
          console.log('[video-long] I2V Seedance retry succeeded:', retrySeedanceId);
          return { taskId: `seedream_${retrySeedanceId}`, provider: 's' };
        }
      }
    } catch (retryError: any) {
      console.warn('[video-long] I2V Seedance retry also failed:', retryError.message);
    }

    // Final fallback: Kling I2V
    console.warn('[video-long] I2V falling back to Kling after Seedance retry failed');
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

// ══════════════════════════════════════════════════════════════════════════════
// FFmpeg helpers — inline to avoid HTTP auth issues with internal API calls
// ══════════════════════════════════════════════════════════════════════════════

const FFMPEG_PATH = join(tmpdir(), 'ffmpeg');

async function ensureFFmpeg(): Promise<string> {
  if (existsSync(FFMPEG_PATH)) return FFMPEG_PATH;

  try {
    const npmPath = require('ffmpeg-static') as string;
    if (npmPath && existsSync(npmPath)) return npmPath;
  } catch {}

  const manualPaths = [
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    '/var/task/node_modules/ffmpeg-static/ffmpeg',
  ];
  for (const p of manualPaths) {
    if (existsSync(p)) return p;
  }

  const urls = [
    'https://github.com/shaka-project/static-ffmpeg-binaries/releases/latest/download/ffmpeg-linux-x64',
    'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/linux-x64',
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(FFMPEG_PATH, buffer);
      await chmod(FFMPEG_PATH, '755');
      break;
    } catch {}
  }

  if (!existsSync(FFMPEG_PATH)) throw new Error('Cannot download FFmpeg');

  try {
    execSync(`"${FFMPEG_PATH}" -version`, { timeout: 5000 });
  } catch {
    const gzPath = FFMPEG_PATH + '.gz';
    const { renameSync } = require('fs');
    renameSync(FFMPEG_PATH, gzPath);
    execSync(`gunzip -f "${gzPath}"`);
    await chmod(FFMPEG_PATH, '755');
    execSync(`"${FFMPEG_PATH}" -version`, { timeout: 5000 });
  }
  return FFMPEG_PATH;
}

/**
 * Extract last frame from a video as lossless PNG. Returns the Supabase public URL.
 * Runs inline — no HTTP call, no auth needed.
 */
async function extractLastFrame(videoUrl: string, userId: string): Promise<string> {
  const id = randomUUID().slice(0, 8);
  const tmpDir = join(tmpdir(), `extract-frame-${id}`);

  try {
    await mkdir(tmpDir, { recursive: true });
    const ffmpegBin = await ensureFFmpeg();

    const videoPath = join(tmpDir, 'input.mp4');
    const framePath = join(tmpDir, 'last_frame.png');

    // Download video
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`Download failed: ${videoRes.status}`);
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    await writeFile(videoPath, videoBuffer);

    // Extract last frame as lossless PNG
    const cmd = `"${ffmpegBin}" -sseof -0.04 -i "${videoPath}" -frames:v 1 -y "${framePath}"`;
    execSync(cmd, { timeout: 30000 });

    if (!existsSync(framePath)) throw new Error('Frame extraction failed');

    const frameBuffer = await readFile(framePath);
    console.log(`[video-long] Frame extracted: ${(frameBuffer.byteLength / 1024).toFixed(0)} KB`);

    // Upload to Supabase
    const supabaseAdmin = getSupabaseAdmin();
    const fileName = `video-frames/${userId}/${Date.now()}_lastframe.png`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('generated-images')
      .upload(fileName, frameBuffer, { contentType: 'image/png', upsert: false });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('generated-images')
      .getPublicUrl(fileName);

    // Cleanup
    await unlink(videoPath).catch(() => {});
    await unlink(framePath).catch(() => {});

    return publicUrl;
  } catch (error: any) {
    // Cleanup on error
    try {
      if (existsSync(tmpDir)) {
        const { readdirSync } = require('fs');
        for (const f of readdirSync(tmpDir)) await unlink(join(tmpDir, f)).catch(() => {});
      }
    } catch {}
    throw error;
  }
}

/**
 * Merge multiple video segments into one using FFmpeg.
 * Re-encodes for seamless transitions. Returns the Supabase public URL.
 * Runs inline — no HTTP call, no auth needed.
 */
async function mergeSegments(segmentUrls: string[], userId: string, jobId: string): Promise<string> {
  const id = randomUUID().slice(0, 8);
  const tmpDir = join(tmpdir(), `merge-segments-${id}`);
  const supabaseAdmin = getSupabaseAdmin();

  try {
    await mkdir(tmpDir, { recursive: true });
    const ffmpegBin = await ensureFFmpeg();

    // Download all segments in parallel
    console.log(`[video-long] Downloading ${segmentUrls.length} segments for merge...`);
    const segmentPaths = await Promise.all(
      segmentUrls.map(async (url, idx) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Download segment ${idx + 1} failed: ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const segPath = join(tmpDir, `segment_${idx}.mp4`);
        await writeFile(segPath, buffer);
        return segPath;
      })
    );

    // Create concat list
    const concatListPath = join(tmpDir, 'concat_list.txt');
    await writeFile(concatListPath, segmentPaths.map(p => `file '${p}'`).join('\n'));

    const outputPath = join(tmpDir, 'merged.mp4');

    // Re-encode for seamless transitions (CRF 18, 24fps, uniform codec)
    console.log(`[video-long] Re-encoding ${segmentUrls.length} segments...`);
    const mergeCmd = `"${ffmpegBin}" -f concat -safe 0 -i "${concatListPath}" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 24 -c:a aac -b:a 192k -movflags +faststart -y "${outputPath}"`;
    execSync(mergeCmd, { timeout: 300000 }); // 5 min for long videos

    const mergedBuffer = await readFile(outputPath);
    console.log(`[video-long] Merged: ${(mergedBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    // Upload to Supabase
    const fileName = `long-videos/${userId}/${Date.now()}.mp4`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('generated-images')
      .upload(fileName, mergedBuffer, { contentType: 'video/mp4', upsert: false });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('generated-images')
      .getPublicUrl(fileName);

    // Update job
    await supabaseAdmin
      .from('video_generation_jobs')
      .update({
        status: 'completed',
        final_video_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    console.log(`[video-long] Merge complete: ${publicUrl}`);

    // Cleanup
    for (const p of segmentPaths) await unlink(p).catch(() => {});
    await unlink(concatListPath).catch(() => {});
    await unlink(outputPath).catch(() => {});

    return publicUrl;
  } catch (error: any) {
    // Mark job as failed
    await supabaseAdmin
      .from('video_generation_jobs')
      .update({
        status: 'failed',
        error: `Fusion échouée: ${error.message}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    // Cleanup
    try {
      if (existsSync(tmpDir)) {
        const { readdirSync } = require('fs');
        for (const f of readdirSync(tmpDir)) await unlink(join(tmpDir, f)).catch(() => {});
      }
    } catch {}
    throw error;
  }
}
