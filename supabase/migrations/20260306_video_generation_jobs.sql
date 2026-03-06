-- Video Generation Jobs table for multi-segment video fusion
-- Each job tracks the generation of multiple video segments that are merged into one final video

CREATE TABLE IF NOT EXISTS video_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  -- Status values: pending, generating, merging, completed, failed
  total_segments INT NOT NULL,
  completed_segments INT NOT NULL DEFAULT 0,
  current_segment_task_id TEXT,
  -- Each segment: {index, taskId, videoUrl, status, prompt, duration, provider}
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_video_url TEXT,
  prompt TEXT NOT NULL,
  duration INT NOT NULL,
  aspect_ratio TEXT DEFAULT '16:9',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for user lookups
CREATE INDEX idx_video_jobs_user ON video_generation_jobs(user_id);
-- Index for active jobs (for polling)
CREATE INDEX idx_video_jobs_active ON video_generation_jobs(status) WHERE status IN ('pending', 'generating', 'merging');

-- RLS policies
ALTER TABLE video_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own jobs
CREATE POLICY "Users can view own video jobs" ON video_generation_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own jobs
CREATE POLICY "Users can create own video jobs" ON video_generation_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own jobs
CREATE POLICY "Users can update own video jobs" ON video_generation_jobs
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role can do everything (for API routes)
CREATE POLICY "Service role full access video jobs" ON video_generation_jobs
  FOR ALL USING (auth.role() = 'service_role');
