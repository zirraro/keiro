-- Add publish_error column to track failed publications per post
-- Add publish_failed and video_generating to status constraint

ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS publish_error TEXT;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS publish_diagnostic JSONB;

-- Extend status constraint to include publish_failed and video_generating
ALTER TABLE content_calendar DROP CONSTRAINT IF EXISTS content_calendar_status_check;
ALTER TABLE content_calendar ADD CONSTRAINT content_calendar_status_check
  CHECK (status IN ('draft', 'approved', 'published', 'skipped', 'publish_failed', 'video_generating'));
