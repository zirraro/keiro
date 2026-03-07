import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Video Jobs DB helper — uses PostgreSQL RPC functions to bypass PostgREST schema cache.
 * This solves the "Could not find table 'video_generation_jobs' in the schema cache" issue.
 */

export type VideoJob = {
  id: string;
  user_id: string;
  status: string;
  total_segments: number;
  completed_segments: number;
  current_segment_task_id: string | null;
  segments: any[];
  final_video_url: string | null;
  prompt: string | null;
  duration: number | null;
  aspect_ratio: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Create a video generation job via RPC function.
 * Returns the job ID.
 */
export async function createVideoJob(
  supabase: SupabaseClient,
  params: {
    user_id: string;
    status: string;
    total_segments: number;
    completed_segments: number;
    current_segment_task_id: string;
    segments: any[];
    prompt: string;
    duration: number;
    aspect_ratio: string;
  }
): Promise<{ id: string } | null> {
  const { data, error } = await supabase.rpc('create_video_job', {
    p_user_id: params.user_id,
    p_status: params.status,
    p_total_segments: params.total_segments,
    p_completed_segments: params.completed_segments,
    p_current_segment_task_id: params.current_segment_task_id,
    p_segments: params.segments,
    p_prompt: params.prompt,
    p_duration: params.duration,
    p_aspect_ratio: params.aspect_ratio,
  });

  if (error) {
    console.error('[video-jobs-db] create_video_job RPC error:', error);
    return null;
  }

  // RPC returns the UUID directly
  return { id: data as string };
}

/**
 * Get a video generation job by ID via RPC function.
 */
export async function getVideoJob(
  supabase: SupabaseClient,
  jobId: string
): Promise<VideoJob | null> {
  const { data, error } = await supabase.rpc('get_video_job', {
    p_job_id: jobId,
  });

  if (error) {
    console.error('[video-jobs-db] get_video_job RPC error:', error);
    return null;
  }

  // RPC returns an array, take first row
  const rows = data as VideoJob[];
  return rows && rows.length > 0 ? rows[0] : null;
}

/**
 * Update a video generation job via RPC function.
 */
export async function updateVideoJob(
  supabase: SupabaseClient,
  jobId: string,
  updates: {
    status?: string;
    completed_segments?: number;
    current_segment_task_id?: string;
    segments?: any[];
    final_video_url?: string;
    error?: string;
  }
): Promise<boolean> {
  const { error } = await supabase.rpc('update_video_job', {
    p_job_id: jobId,
    p_status: updates.status ?? null,
    p_completed_segments: updates.completed_segments ?? null,
    p_current_segment_task_id: updates.current_segment_task_id ?? null,
    p_segments: updates.segments ?? null,
    p_final_video_url: updates.final_video_url ?? null,
    p_error: updates.error ?? null,
  });

  if (error) {
    console.error('[video-jobs-db] update_video_job RPC error:', error);
    return false;
  }

  return true;
}
