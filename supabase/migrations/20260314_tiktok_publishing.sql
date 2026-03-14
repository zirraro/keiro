-- Add TikTok publishing tracking columns to content_calendar
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS tiktok_publish_id TEXT;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS tiktok_permalink TEXT;

-- Index for finding unpublished TikTok posts
CREATE INDEX IF NOT EXISTS idx_content_calendar_tiktok_unpublished
  ON content_calendar (platform, status)
  WHERE platform = 'tiktok' AND status = 'published' AND tiktok_publish_id IS NULL;
