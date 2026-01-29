-- Migration: Create my_videos table for dedicated video storage
-- Date: 2026-01-29
-- Description: Separate videos from saved_images for better organization

-- Create my_videos table
CREATE TABLE IF NOT EXISTS my_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Video metadata
  title TEXT,
  video_url TEXT NOT NULL, -- Supabase Storage URL (stable)
  thumbnail_url TEXT, -- Thumbnail/cover image
  duration INTEGER, -- Duration in seconds

  -- Source information
  source_type TEXT DEFAULT 'seedream_i2v', -- 'seedream_i2v', 'upload', 'tiktok_sync'
  original_image_id UUID REFERENCES saved_images(id) ON DELETE SET NULL, -- If converted from image

  -- Video properties
  width INTEGER,
  height INTEGER,
  file_size BIGINT, -- Size in bytes
  format TEXT DEFAULT 'mp4', -- mp4, mov, etc.

  -- Organization
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  is_favorite BOOLEAN DEFAULT FALSE,

  -- TikTok integration
  tiktok_publish_id TEXT, -- TikTok publish ID if published
  published_to_tiktok BOOLEAN DEFAULT FALSE,
  tiktok_published_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_my_videos_user_id
  ON my_videos(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_my_videos_folder_id
  ON my_videos(folder_id)
  WHERE folder_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_my_videos_original_image
  ON my_videos(original_image_id)
  WHERE original_image_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_my_videos_tiktok
  ON my_videos(tiktok_publish_id)
  WHERE tiktok_publish_id IS NOT NULL;

-- Enable RLS
ALTER TABLE my_videos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users view own videos"
  ON my_videos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own videos"
  ON my_videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own videos"
  ON my_videos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own videos"
  ON my_videos FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_my_videos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER my_videos_updated_at
  BEFORE UPDATE ON my_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_my_videos_updated_at();

-- Comments for documentation
COMMENT ON TABLE my_videos IS 'Dedicated table for user videos (Seedream I2V, uploads, TikTok sync)';
COMMENT ON COLUMN my_videos.video_url IS 'Stable URL from Supabase Storage';
COMMENT ON COLUMN my_videos.source_type IS 'How the video was created: seedream_i2v, upload, tiktok_sync';
COMMENT ON COLUMN my_videos.original_image_id IS 'Reference to saved_images if converted from image';
COMMENT ON COLUMN my_videos.tiktok_publish_id IS 'TikTok publish ID if published to TikTok';
