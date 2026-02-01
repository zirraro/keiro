-- Migration: Add TikTok conversion tracking to my_videos
-- Date: 2026-02-01
-- Description: Track which videos have been converted to TikTok-compatible format

-- Add columns to track TikTok conversion
ALTER TABLE my_videos
  ADD COLUMN IF NOT EXISTS tiktok_converted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- Add index for converted videos
CREATE INDEX IF NOT EXISTS idx_my_videos_tiktok_converted
  ON my_videos(tiktok_converted, converted_at DESC)
  WHERE tiktok_converted = TRUE;

-- Comments
COMMENT ON COLUMN my_videos.tiktok_converted IS 'Whether video has been converted to TikTok-compatible format (H.264 + AAC)';
COMMENT ON COLUMN my_videos.converted_at IS 'Timestamp when video was converted for TikTok';
