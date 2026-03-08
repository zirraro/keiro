export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min max per request

import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { decomposePromptIntoScenes, calculateSegments } from '@/lib/video-scenes';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';
import { getVideoCreditCost } from '@/lib/credits/constants';
import { createVideoJob, getVideoJob, updateVideoJob } from '@/lib/video-jobs-db';
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
    const { prompt, duration, aspectRatio = '16:9', imageUrl, mode, segments: advancedSegments, dryRun } = body;

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

    // 5. For video-long, we skip enhanceVideoPrompt — the scene decomposition
    // does both jobs in a single Claude call (creative analysis + short scene prompts).
    // The raw prompt from the client contains the full creative brief (business + news context).
    const enhancedPrompt = prompt;
    console.log(`[video-long] Using raw creative brief for decomposition (${prompt.length} chars)`);

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

      // Short fallback if user didn't write a custom prompt for a segment
      const shortFallback = prompt.substring(0, 100).replace(/["\n]/g, ' ').trim();

      const jobSegments: JobSegment[] = advancedSegments.map((seg: any, i: number) => {
        const camera = cameraMap[seg.cameraMovement] || 'Smooth cinematic camera movement';
        const transition = i < advancedSegments.length - 1 ? (transitionMap[seg.transition] || '') : '';
        const basePrompt = seg.prompt || shortFallback;
        const segPrompt = `${camera}, ${basePrompt}. ${transition}`.trim();

        return {
          index: i,
          duration: seg.duration || 10,
          prompt: segPrompt,
          type: 'text_to_video' as 'text_to_video' | 'image_to_video',
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
      const job = await createVideoJob(supabaseAdmin, {
        user_id: user.id,
        status: 'generating',
        total_segments: jobSegments.length,
        completed_segments: 0,
        current_segment_task_id: firstTaskId,
        segments: jobSegments,
        prompt,
        duration: totalDuration,
        aspect_ratio: aspectRatio,
      });

      if (!job) {
        console.error('[video-long] Failed to create advanced job via RPC');
        return Response.json({
          ok: false,
          error: 'Erreur création job vidéo',
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
      // decomposePromptIntoScenes now does BOTH jobs in one Claude call:
      // 1. Analyzes the creative brief (business + news connection)
      // 2. Outputs SHORT purely visual scene prompts (max 200 chars each)
      scenes = await decomposePromptIntoScenes(enhancedPrompt, duration, {
        aspectRatio,
        renderStyle: body.renderStyle,
        characterStyle: body.characterStyle,
        tone: body.tone,
        visualStyle: body.visualStyle,
      });
      console.log(`[video-long] Decomposed into ${scenes.length} scenes:`, scenes.map(s => `[${s.index}] ${s.duration}s (${s.prompt.length}chars)`));
    } catch (decomposeError: any) {
      console.error('[video-long] Scene decomposition failed completely:', decomposeError.message);
      // Emergency fallback: basic visual prompts
      const segments = calculateSegments(duration);
      const shortPrompt = prompt.substring(0, 120).replace(/["\n]/g, ' ').trim();
      scenes = segments.map((seg, i) => ({
        index: i,
        duration: seg.duration,
        prompt: i === 0
          ? `Slow crane descent into ${shortPrompt}, warm golden hour light, cinematic depth of field`
          : `Smooth tracking continuation of ${shortPrompt}, soft ambient lighting, shallow focus`,
        type: 'text_to_video' as const,
      }));
      console.log(`[video-long] Emergency fallback: ${scenes.length} segments`);
    }

    // Validate total duration matches requested
    const expectedSegments = calculateSegments(duration);
    while (scenes.length < expectedSegments.length) {
      const idx = scenes.length;
      scenes.push({
        index: idx,
        duration: expectedSegments[idx].duration,
        prompt: scenes[scenes.length - 1].prompt,
        type: 'text_to_video' as const,
      });
      console.warn(`[video-long] Padded scene ${idx} to reach ${expectedSegments.length} segments`);
    }
    const totalDur = scenes.reduce((sum, s) => sum + s.duration, 0);
    console.log(`[video-long] Final: ${scenes.length} segments, ${totalDur}s total for requested ${duration}s`);

    // ── DRY RUN: return what WOULD be sent to Seedance without calling API or deducting credits ──
    if (dryRun) {
      const ratioFlag = aspectRatio ? ` --ratio ${aspectRatio}` : '';
      const dryRunSegments = scenes.map((scene, i) => {
        const cleanPrompt = scene.prompt
          .replace(/ABSOLUTELY ZERO[^.]*\./gi, '')
          .replace(/Pure visual storytelling[^.]*\./gi, '')
          .replace(/NO text[^.]*\./gi, '')
          .trim();
        const shortPrompt = cleanPrompt.length > 200 ? cleanPrompt.substring(0, 200) : cleanPrompt;
        const segDuration = scene.duration >= 10 ? 10 : 5;
        const formattedPrompt = `${shortPrompt} --camerafixed false${ratioFlag} --duration ${segDuration}`;
        return {
          index: i,
          duration: scene.duration,
          seedanceDuration: segDuration,
          promptLength: formattedPrompt.length,
          promptEnd: formattedPrompt.slice(-60),
          fullPrompt: formattedPrompt,
        };
      });

      return Response.json({
        ok: true,
        dryRun: true,
        requestedDuration: duration,
        totalSegmentDuration: totalDur,
        segmentCount: scenes.length,
        segments: dryRunSegments,
        message: `${scenes.length} segments × ${scenes[0]?.duration}s = ${totalDur}s. Each prompt ends with "--duration ${scenes[0]?.duration >= 10 ? 10 : 5}". No API called, no credits deducted.`,
      });
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

    // 10. Create the job in DB via RPC (bypasses schema cache)
    const supabaseAdmin = getSupabaseAdmin();
    const job = await createVideoJob(supabaseAdmin, {
      user_id: user.id,
      status: 'generating',
      total_segments: jobSegments.length,
      completed_segments: 0,
      current_segment_task_id: firstTaskId,
      segments: jobSegments,
      prompt,
      duration,
      aspect_ratio: aspectRatio,
    });

    if (!job) {
      console.error('[video-long] Failed to create job via RPC');
      return Response.json({
        ok: false,
        error: 'Erreur création job vidéo',
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

    // 3. Fetch the job from DB via RPC
    const supabaseAdmin = getSupabaseAdmin();
    const job = await getVideoJob(supabaseAdmin, jobId);

    if (!job || job.user_id !== user.id) {
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

          // Race condition guard: simplified with RPC
          // Note: Since we're using RPC, the optimistic lock is skipped for now
          // The RPC update will still be atomic at the DB level

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

              // ALL segments use T2V (text-to-video) — guaranteed 10s per segment
              // Seedance I2V caps at 5s regardless of --duration flag, so T2V is the only
              // way to get 10s per segment. Visual continuity is ensured by Claude's scene
              // decomposition: each scene prompt describes the EXACT visual state that matches
              // the previous scene's ending (same palette, lighting, camera direction, subject).
              console.log(`[video-long] Segment ${nextSegmentIndex}: T2V (guaranteed 10s, continuity via prompt)`);
              result = await startSeedanceT2V(nextScene.prompt, nextScene.duration, job.aspect_ratio || '16:9');

              segments[nextSegmentIndex].taskId = result.taskId;
              segments[nextSegmentIndex].status = 'generating';
              segments[nextSegmentIndex].provider = result.provider;

              await updateVideoJob(supabaseAdmin, jobId, {
                completed_segments: newCompletedCount,
                current_segment_task_id: result.taskId,
                segments,
              });

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

              await updateVideoJob(supabaseAdmin, jobId, {
                status: 'failed',
                completed_segments: newCompletedCount,
                segments,
                error: `Échec du segment ${nextSegmentIndex}: ${nextError.message}`,
              });

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

            console.log(`[video-long] Segments with video: ${allVideoUrls.length}/${segments.length}, target duration: ${job.duration}s`);

            if (segments.length === 1) {
              // Single segment — no merge needed
              await updateVideoJob(supabaseAdmin, jobId, {
                status: 'completed',
                completed_segments: newCompletedCount,
                segments,
                final_video_url: allVideoUrls[0] || undefined,
              });

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

            await updateVideoJob(supabaseAdmin, jobId, {
              status: 'merging',
              completed_segments: newCompletedCount,
              segments,
            });

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
              // Fallback: try merge via the dedicated merge route (different serverless function = fresh FFmpeg)
              console.log(`[video-long] Inline merge failed, trying merge via /api/seedream/video-long/merge...`);
              try {
                const mergeRouteUrl = new URL('/api/seedream/video-long/merge', request.url);
                const mergeRetryRes = await fetch(mergeRouteUrl.toString(), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ segmentUrls: allVideoUrls, jobId, userId: job.user_id }),
                });
                const mergeRetryData = await mergeRetryRes.json();
                if (mergeRetryData.ok && mergeRetryData.mergedUrl) {
                  console.log(`[video-long] Merge route fallback succeeded: ${mergeRetryData.mergedUrl}`);
                  await updateVideoJob(supabaseAdmin, jobId, {
                    status: 'completed',
                    final_video_url: mergeRetryData.mergedUrl,
                  });
                  return Response.json({
                    ok: true,
                    status: 'completed',
                    completedSegments: newCompletedCount,
                    totalSegments: segments.length,
                    segments,
                    finalVideoUrl: mergeRetryData.mergedUrl,
                  });
                }
              } catch (retryMergeErr: any) {
                console.warn(`[video-long] Merge route fallback also failed:`, retryMergeErr.message);
              }

              // Last resort: return all segment URLs for client-side sequential playback
              const allUrls = allVideoUrls.filter(Boolean) as string[];
              if (allUrls.length > 0) {
                console.log(`[video-long] All merge attempts failed, returning ${allUrls.length} segment URLs for client playback`);
                await updateVideoJob(supabaseAdmin, jobId, {
                  status: 'completed',
                  final_video_url: allUrls[0],
                });
                return Response.json({
                  ok: true,
                  status: 'completed',
                  completedSegments: newCompletedCount,
                  totalSegments: segments.length,
                  segments,
                  finalVideoUrl: allUrls[0],
                  segmentUrls: allUrls,
                  mergeSkipped: true,
                });
              }
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

          await updateVideoJob(supabaseAdmin, jobId, {
            status: 'failed',
            segments,
            error: `Segment ${currentSegmentIndex} échoué: ${taskStatus.error || 'Erreur inconnue'}`,
          });

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
      const freshJob = await getVideoJob(supabaseAdmin, jobId);

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
// Helper: Extract last frame from a video inline (for I2V continuation)
// ══════════════════════════════════════════════════════════════════════════════

const FFMPEG_PATH_CACHED = join(tmpdir(), 'ffmpeg');

async function ensureFFmpegAvailable(): Promise<string> {
  if (existsSync(FFMPEG_PATH_CACHED)) return FFMPEG_PATH_CACHED;

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
      await writeFile(FFMPEG_PATH_CACHED, buffer);
      await chmod(FFMPEG_PATH_CACHED, '755');
      break;
    } catch {}
  }

  if (!existsSync(FFMPEG_PATH_CACHED)) {
    throw new Error('Cannot find or download FFmpeg');
  }

  try {
    execSync(`"${FFMPEG_PATH_CACHED}" -version`, { timeout: 5000 });
  } catch {
    const gzPath = FFMPEG_PATH_CACHED + '.gz';
    const { renameSync } = require('fs');
    renameSync(FFMPEG_PATH_CACHED, gzPath);
    execSync(`gunzip -f "${gzPath}"`);
    await chmod(FFMPEG_PATH_CACHED, '755');
    execSync(`"${FFMPEG_PATH_CACHED}" -version`, { timeout: 5000 });
  }
  return FFMPEG_PATH_CACHED;
}

/**
 * Extract last frame from a video URL, upload to Supabase, return public URL.
 * Used inline during segment transitions for I2V continuity.
 */
async function extractLastFrameInline(videoUrl: string, userId: string): Promise<string> {
  const id = randomUUID().slice(0, 8);
  const tmpDir = join(tmpdir(), `frame-${id}`);
  await mkdir(tmpDir, { recursive: true });

  const videoPath = join(tmpDir, 'input.mp4');
  const framePath = join(tmpDir, 'last_frame.png');

  try {
    // Download video
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`Video download failed: ${videoRes.status}`);
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    await writeFile(videoPath, videoBuffer);

    // Get FFmpeg
    const ffmpegBin = await ensureFFmpegAvailable();

    // Extract last frame (1 frame at 25fps = -0.04s from end)
    const cmd = `"${ffmpegBin}" -sseof -0.04 -i "${videoPath}" -frames:v 1 -y "${framePath}"`;
    execSync(cmd, { timeout: 15000 });

    if (!existsSync(framePath)) {
      throw new Error('Frame extraction produced no output');
    }

    // Read and upload to Supabase
    const frameBuffer = await readFile(framePath);
    const supabase = getSupabaseAdmin();
    const fileName = `video-frames/${userId}/${Date.now()}_lastframe.png`;

    const { error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(fileName, frameBuffer, { contentType: 'image/png', upsert: false });

    if (uploadError) throw new Error(`Frame upload failed: ${uploadError.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from('generated-images')
      .getPublicUrl(fileName);

    console.log(`[extractFrame-${id}] Done: ${(frameBuffer.byteLength / 1024).toFixed(0)} KB → ${publicUrl}`);
    return publicUrl;
  } finally {
    // Cleanup temp files
    await unlink(videoPath).catch(() => {});
    await unlink(framePath).catch(() => {});
    try { const { rmdirSync } = require('fs'); rmdirSync(tmpDir); } catch {}
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
  // Scene prompts are already short (80-200 chars from decomposePromptIntoScenes).
  // Strip leftover meta-instructions.
  const cleanPrompt = prompt
    .replace(/ABSOLUTELY ZERO[^.]*\./gi, '')
    .replace(/Pure visual storytelling[^.]*\./gi, '')
    .replace(/NO text[^.]*\./gi, '')
    .trim();
  // Hard limit 200 chars for the visual description so flags at end aren't truncated
  const shortPrompt = cleanPrompt.length > 200 ? cleanPrompt.substring(0, 200) : cleanPrompt;
  // --duration MUST be the VERY LAST flag — Seedance parses from the end of the prompt
  // Force duration to 10 for all segments (Seedance max), ensures each segment = 10s
  const segDuration = duration >= 10 ? 10 : 5;
  const formattedPrompt = `${shortPrompt} --camerafixed false${ratioFlag} --duration ${segDuration}`;

  try {
    console.log(`[video-long] T2V Seedance: requested=${duration}s, segDuration=${segDuration}s, promptLen=${formattedPrompt.length}chars`);
    console.log(`[video-long] T2V prompt (last 80 chars): "...${formattedPrompt.slice(-80)}"`);;
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
  // Clean and shorten the prompt — --duration MUST be LAST flag for Seedance
  const cleanPrompt = (prompt || '').replace(/ABSOLUTELY ZERO[^.]*\./gi, '').trim();
  const shortPrompt = cleanPrompt.length > 200 ? cleanPrompt.substring(0, 200) : cleanPrompt;
  const segDuration = duration >= 10 ? 10 : 5;
  const textPrompt = shortPrompt
    ? `Seamless continuation, same lighting. ${shortPrompt} --camerafixed false --duration ${segDuration}`
    : `Animate with smooth cinematic camera movement, consistent lighting --camerafixed false --duration ${segDuration}`;

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
// Helper: Update job status in DB (uses RPC)
// ══════════════════════════════════════════════════════════════════════════════
async function updateJobStatus(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  jobId: string,
  status: string,
  error?: string
) {
  const updates: Record<string, any> = { status };
  if (error) {
    updates.error = error;
  }

  await updateVideoJob(supabaseAdmin, jobId, updates);

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

    // Log each segment's actual duration before merging
    for (let i = 0; i < segmentPaths.length; i++) {
      try {
        const probeCmd = `"${ffmpegBin}" -i "${segmentPaths[i]}" -hide_banner 2>&1 | grep -i duration || echo "unknown"`;
        const probeResult = execSync(probeCmd, { timeout: 10000 }).toString().trim();
        console.log(`[video-long] Segment ${i} duration: ${probeResult}`);
      } catch { console.log(`[video-long] Segment ${i} duration: probe failed`); }
    }

    // Re-encode merge (most reliable — ensures all segments have matching codec/fps/resolution)
    // This prevents silent truncation from codec mismatches between segments
    console.log(`[video-long] Merging ${segmentPaths.length} segments with re-encode...`);
    const reencodeCmd = `"${ffmpegBin}" -f concat -safe 0 -i "${concatListPath}" -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -r 24 -an -movflags +faststart -y "${outputPath}"`;
    execSync(reencodeCmd, { timeout: 300000 }); // 5 min for re-encode
    console.log(`[video-long] Re-encode merge succeeded`);

    // Verify merged output duration
    try {
      const durationProbe = `"${ffmpegBin}" -i "${outputPath}" -hide_banner 2>&1 | grep -i duration || echo "unknown"`;
      const mergedDuration = execSync(durationProbe, { timeout: 10000 }).toString().trim();
      console.log(`[video-long] MERGED VIDEO DURATION: ${mergedDuration}`);
    } catch { console.log(`[video-long] Could not probe merged duration`); }

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
    await updateVideoJob(supabaseAdmin, jobId, {
      status: 'completed',
      final_video_url: publicUrl,
    });

    console.log(`[video-long] Merge complete: ${publicUrl}`);

    // Cleanup
    for (const p of segmentPaths) await unlink(p).catch(() => {});
    await unlink(concatListPath).catch(() => {});
    await unlink(outputPath).catch(() => {});

    return publicUrl;
  } catch (error: any) {
    // Mark job as failed
    await updateVideoJob(supabaseAdmin, jobId, {
      status: 'failed',
      error: `Fusion échouée: ${error.message}`,
    });

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
