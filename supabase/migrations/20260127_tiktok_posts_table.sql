-- Migration: Create tiktok_posts table
-- Date: 2026-01-27
-- Description: Table for TikTok posts synced from TikTok API (similar to instagram_posts)

CREATE TABLE IF NOT EXISTS tiktok_posts (
  id TEXT PRIMARY KEY, -- TikTok video ID
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- TikTok post data
  title TEXT,
  video_description TEXT,
  duration INTEGER, -- Video duration in seconds
  cover_image_url TEXT, -- Thumbnail from TikTok
  share_url TEXT NOT NULL, -- Public TikTok URL
  embed_link TEXT, -- Embed iframe URL

  -- Media URLs
  original_video_url TEXT, -- TikTok CDN URL (may expire)
  cached_video_url TEXT, -- Supabase Storage URL (stable, but videos too large to cache usually)
  cached_thumbnail_url TEXT, -- Cached thumbnail in Supabase Storage

  -- Post metadata
  media_type TEXT DEFAULT 'VIDEO', -- VIDEO or PHOTO (for carousel posts)
  photo_count INTEGER, -- For carousel posts
  posted_at TIMESTAMP WITH TIME ZONE,

  -- Analytics (synced periodically from TikTok API)
  view_count BIGINT DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  analytics_synced_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_user_id
  ON tiktok_posts(user_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_tiktok_posts_analytics_sync
  ON tiktok_posts(analytics_synced_at)
  WHERE analytics_synced_at IS NOT NULL;

-- Enable RLS
ALTER TABLE tiktok_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users view own TikTok posts"
  ON tiktok_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own TikTok posts"
  ON tiktok_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own TikTok posts"
  ON tiktok_posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own TikTok posts"
  ON tiktok_posts FOR DELETE
  USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE tiktok_posts IS 'TikTok posts synced from user account with analytics';
COMMENT ON COLUMN tiktok_posts.cached_thumbnail_url IS 'Stable URL from Supabase Storage for thumbnail';
COMMENT ON COLUMN tiktok_posts.original_video_url IS 'TikTok CDN URL (may expire)';
COMMENT ON COLUMN tiktok_posts.view_count IS 'Total views (from TikTok API)';
