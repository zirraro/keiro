import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getVideoJob, updateVideoJob } from '@/lib/video-jobs-db';
import { publishTikTokVideoViaFileUpload, refreshTikTokToken } from '@/lib/tiktok';
import { publishReelToInstagram } from '@/lib/meta';

export const runtime = 'nodejs';
export const maxDuration = 300;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * GET /api/cron/video-poll
 *
 * Polls active video generation jobs linked to content_calendar entries.
 * For each active job, calls the video-long GET endpoint to advance segments.
 * When a job completes, updates the content_calendar entry and publishes.
 *
 * Auth: CRON_SECRET required.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const results: Array<{ postId: string; jobId: string; status: string; action?: string; error?: string }> = [];

  try {
    // Find all content_calendar entries with pending video jobs
    const { data: pendingPosts, error: fetchErr } = await supabase
      .from('content_calendar')
      .select('id, platform, format, caption, hashtags, visual_url, video_url, video_job_id, status')
      .not('video_job_id', 'is', null)
      .in('status', ['draft', 'approved', 'video_generating'])
      .limit(10);

    if (fetchErr) {
      console.error('[video-poll] Error fetching pending posts:', fetchErr);
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }

    if (!pendingPosts || pendingPosts.length === 0) {
      console.log('[video-poll] No pending video jobs found');
      return NextResponse.json({ ok: true, message: 'No pending video jobs', polled: 0 });
    }

    console.log(`[video-poll] Found ${pendingPosts.length} posts with pending video jobs`);

    for (const post of pendingPosts) {
      const jobId = post.video_job_id;
      if (!jobId) continue;

      try {
        // Fetch the video job directly via RPC
        const job = await getVideoJob(supabase, jobId);

        if (!job) {
          console.warn(`[video-poll] Job ${jobId} not found for post ${post.id}`);
          results.push({ postId: post.id, jobId, status: 'not_found', error: 'Job not found' });
          // Clear the broken reference
          await supabase.from('content_calendar').update({
            video_job_id: null,
            status: 'draft',
            updated_at: new Date().toISOString(),
          }).eq('id', post.id);
          continue;
        }

        if (job.status === 'completed' && job.final_video_url) {
          // Job is done — update content_calendar and publish
          console.log(`[video-poll] Job ${jobId} completed! Video: ${job.final_video_url.substring(0, 80)}`);

          // Cache video to Supabase Storage for permanent URL
          const cachedUrl = await cacheVideoToStorage(supabase, job.final_video_url, `content-long-${Date.now()}`);
          const finalVideoUrl = cachedUrl || job.final_video_url;

          const updateData: Record<string, any> = {
            video_url: finalVideoUrl,
            status: 'published',
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Publish to platform
          let publishResult: string | undefined;
          let publishError: string | undefined;

          if (post.platform === 'tiktok') {
            const ttResult = await publishToTikTok(post, finalVideoUrl, supabase);
            if (ttResult.success) {
              publishResult = ttResult.publish_id;
              if (ttResult.publish_id) updateData.tiktok_publish_id = ttResult.publish_id;
            } else {
              publishError = ttResult.error;
              console.warn(`[video-poll] TikTok publish failed for post ${post.id}: ${ttResult.error}`);
            }
          } else if (post.platform === 'instagram') {
            const igResult = await publishToInstagramReel(post, finalVideoUrl, supabase);
            if (igResult.success) {
              publishResult = igResult.permalink;
              if (igResult.permalink) updateData.instagram_permalink = igResult.permalink;
            } else {
              publishError = igResult.error;
              console.warn(`[video-poll] Instagram publish failed for post ${post.id}: ${igResult.error}`);
            }
          }

          await supabase.from('content_calendar').update(updateData).eq('id', post.id);

          // Log success
          await supabase.from('agent_logs').insert({
            agent: 'content',
            action: 'video_long_published',
            data: {
              postId: post.id,
              jobId,
              platform: post.platform,
              videoUrl: finalVideoUrl.substring(0, 100),
              publishResult,
              publishError,
            },
            status: publishError ? 'warning' : 'success',
            created_at: new Date().toISOString(),
          });

          results.push({ postId: post.id, jobId, status: 'published', action: publishError ? `published_with_error: ${publishError}` : 'published' });

        } else if (job.status === 'failed') {
          console.error(`[video-poll] Job ${jobId} failed: ${job.error}`);

          // Mark post as failed, reset to draft so content agent can retry with short video
          await supabase.from('content_calendar').update({
            status: 'draft',
            video_job_id: null,
            updated_at: new Date().toISOString(),
          }).eq('id', post.id);

          results.push({ postId: post.id, jobId, status: 'failed', error: job.error || 'Unknown error' });

        } else if (job.status === 'generating' || job.status === 'merging') {
          // Job is still in progress — advance it by calling the video-long GET endpoint
          console.log(`[video-poll] Job ${jobId} is ${job.status} (${job.completed_segments}/${job.total_segments} segments)`);

          // Call video-long GET to advance the pipeline
          const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || null;
          const baseUrl = siteUrl || vercelUrl || 'http://localhost:3000';

          try {
            const pollRes = await fetch(`${baseUrl}/api/seedream/video-long?jobId=${jobId}`, {
              headers: { 'Authorization': `Bearer ${cronSecret}` },
            });
            const pollData = await pollRes.json();
            console.log(`[video-poll] Advanced job ${jobId}: status=${pollData.status}, segments=${pollData.completedSegments}/${pollData.totalSegments}`);

            // Update content_calendar status to track progress
            if (post.status !== 'video_generating') {
              await supabase.from('content_calendar').update({
                status: 'video_generating',
                updated_at: new Date().toISOString(),
              }).eq('id', post.id);
            }

            results.push({
              postId: post.id,
              jobId,
              status: pollData.status || 'generating',
              action: `segments: ${pollData.completedSegments}/${pollData.totalSegments}`,
            });
          } catch (pollErr: any) {
            console.error(`[video-poll] Failed to advance job ${jobId}:`, pollErr.message);
            results.push({ postId: post.id, jobId, status: 'poll_error', error: pollErr.message });
          }
        } else {
          results.push({ postId: post.id, jobId, status: job.status });
        }
      } catch (err: any) {
        console.error(`[video-poll] Error processing post ${post.id}:`, err.message);
        results.push({ postId: post.id, jobId, status: 'error', error: err.message });
      }
    }

    const published = results.filter(r => r.status === 'published').length;
    const generating = results.filter(r => r.status === 'generating').length;
    const failed = results.filter(r => r.status === 'failed').length;

    console.log(`[video-poll] Done: ${published} published, ${generating} generating, ${failed} failed`);

    return NextResponse.json({
      ok: true,
      polled: pendingPosts.length,
      published,
      generating,
      failed,
      results,
    });
  } catch (error: any) {
    console.error('[video-poll] Unexpected error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function cacheVideoToStorage(supabase: any, tempUrl: string, videoId: string): Promise<string | null> {
  try {
    const videoResponse = await fetch(tempUrl);
    if (!videoResponse.ok) return null;
    const buffer = await videoResponse.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
    const fileName = `content/videos/${videoId}.mp4`;
    const blob = new Blob([buffer], { type: contentType });
    const { error: uploadError } = await supabase.storage
      .from('generated-images').upload(fileName, blob, { contentType, upsert: false });
    if (uploadError) {
      console.error('[video-poll] Video cache upload error:', uploadError.message);
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from('generated-images').getPublicUrl(fileName);
    return publicUrl || null;
  } catch (e: any) {
    console.error('[video-poll] Video caching failed:', e.message);
    return null;
  }
}

async function publishToTikTok(
  post: any,
  videoUrl: string,
  supabase: any
): Promise<{ success: boolean; publish_id?: string; error?: string }> {
  try {
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry, tiktok_user_id')
      .eq('is_admin', true)
      .not('tiktok_access_token', 'is', null)
      .limit(1)
      .single();

    if (!adminProfile?.tiktok_access_token) {
      return { success: false, error: 'No TikTok admin tokens found' };
    }

    let accessToken = adminProfile.tiktok_access_token;
    const tokenExpiry = adminProfile.tiktok_token_expiry ? new Date(adminProfile.tiktok_token_expiry) : null;
    if (tokenExpiry && tokenExpiry < new Date()) {
      console.log('[video-poll] TikTok token expired, refreshing...');
      const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
      const refreshResult = await refreshTikTokToken(adminProfile.tiktok_refresh_token, clientKey);
      if (refreshResult?.access_token) {
        accessToken = refreshResult.access_token;
        await supabase.from('profiles').update({
          tiktok_access_token: refreshResult.access_token,
          tiktok_refresh_token: refreshResult.refresh_token || adminProfile.tiktok_refresh_token,
          tiktok_token_expiry: new Date(Date.now() + (refreshResult.expires_in || 86400) * 1000).toISOString(),
        }).eq('is_admin', true);
      }
    }

    const fullCaption = [
      post.caption || '',
      ...(post.hashtags || []).map((h: string) => h.startsWith('#') ? h : `#${h}`),
    ].join(' ').trim().substring(0, 2200);

    const result = await publishTikTokVideoViaFileUpload(
      accessToken,
      videoUrl,
      fullCaption,
      { privacy_level: 'PUBLIC_TO_EVERYONE' }
    );

    return { success: true, publish_id: result?.publish_id || 'ok' };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function publishToInstagramReel(
  post: any,
  videoUrl: string,
  supabase: any
): Promise<{ success: boolean; permalink?: string; error?: string }> {
  try {
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('instagram_user_id, instagram_page_token')
      .eq('is_admin', true)
      .not('instagram_user_id', 'is', null)
      .limit(1)
      .single();

    if (!adminProfile?.instagram_user_id || !adminProfile?.instagram_page_token) {
      return { success: false, error: 'No Instagram admin tokens found' };
    }

    const fullCaption = [
      post.caption || '',
      ...(post.hashtags || []).map((h: string) => h.startsWith('#') ? h : `#${h}`),
    ].join('\n').trim();

    const result = await publishReelToInstagram(
      adminProfile.instagram_user_id,
      adminProfile.instagram_page_token,
      videoUrl,
      fullCaption
    );

    return { success: !!result, permalink: result?.permalink };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
