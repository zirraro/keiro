-- Migration: Add TikTok support to scheduled_posts table
-- Date: 2026-01-27
-- Description: Extends scheduled_posts to support TikTok platform and TikTok-specific fields

-- Add TikTok-specific fields to scheduled_posts table
ALTER TABLE scheduled_posts
ADD COLUMN IF NOT EXISTS tiktok_publish_id TEXT,
ADD COLUMN IF NOT EXISTS tiktok_video_url TEXT,
ADD COLUMN IF NOT EXISTS privacy_level VARCHAR(20) DEFAULT 'PUBLIC_TO_EVERYONE',
ADD COLUMN IF NOT EXISTS disable_duet BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS disable_stitch BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS disable_comment BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS video_cover_timestamp DECIMAL;

-- Update CHECK constraint for platform to include 'tiktok'
ALTER TABLE scheduled_posts DROP CONSTRAINT IF EXISTS check_platform;
ALTER TABLE scheduled_posts ADD CONSTRAINT check_platform
  CHECK (platform IN ('instagram', 'facebook', 'linkedin', 'twitter', 'tiktok'));

-- Index for TikTok publish workflow
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_tiktok_publish_id
  ON scheduled_posts(tiktok_publish_id)
  WHERE tiktok_publish_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN scheduled_posts.tiktok_publish_id IS 'TikTok publish_id for tracking multi-step upload status';
COMMENT ON COLUMN scheduled_posts.tiktok_video_url IS 'URL of converted video (if post started as image)';
COMMENT ON COLUMN scheduled_posts.privacy_level IS 'TikTok privacy setting: PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY';
COMMENT ON COLUMN scheduled_posts.disable_duet IS 'TikTok: disable duet feature for this video';
COMMENT ON COLUMN scheduled_posts.disable_stitch IS 'TikTok: disable stitch feature for this video';
COMMENT ON COLUMN scheduled_posts.video_cover_timestamp IS 'TikTok: timestamp (ms) for selecting video thumbnail';
