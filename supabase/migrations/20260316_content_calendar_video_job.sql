-- Add video_job_id column to content_calendar for async long video generation
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS video_job_id UUID;

COMMENT ON COLUMN content_calendar.video_job_id IS 'Links to video_generation_jobs for async long video generation (30s+)';

-- Index for polling pending video jobs
CREATE INDEX IF NOT EXISTS idx_content_calendar_video_job ON content_calendar(video_job_id) WHERE video_job_id IS NOT NULL;

-- Add 'video_generating' status to content_calendar check constraint
-- Drop old constraint and recreate with new value
ALTER TABLE content_calendar DROP CONSTRAINT IF EXISTS content_calendar_status_check;
ALTER TABLE content_calendar ADD CONSTRAINT content_calendar_status_check
  CHECK (status IN ('draft', 'approved', 'published', 'skipped', 'video_generating'));
