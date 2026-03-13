-- Add analytics columns to instagram_posts (TikTok already has them)
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS impressions INTEGER DEFAULT 0;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS saved INTEGER DEFAULT 0;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS analytics_synced_at TIMESTAMP WITH TIME ZONE;

-- Add index for analytics sync
CREATE INDEX IF NOT EXISTS idx_instagram_posts_analytics_sync
  ON instagram_posts(analytics_synced_at)
  WHERE analytics_synced_at IS NOT NULL;

-- Add publication_analytics table for cross-platform pattern tracking
CREATE TABLE IF NOT EXISTS publication_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok')),
  post_id TEXT NOT NULL UNIQUE,
  caption TEXT,
  media_type TEXT,
  posted_at TIMESTAMP WITH TIME ZONE,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  view_count BIGINT DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  saved INTEGER DEFAULT 0,
  engagement_rate NUMERIC(5,2) DEFAULT 0,
  hashtags TEXT[],
  content_category TEXT,
  ai_analysis JSONB,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publication_analytics_user
  ON publication_analytics(user_id, platform, posted_at DESC);

ALTER TABLE publication_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own publication analytics"
  ON publication_analytics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages publication analytics"
  ON publication_analytics FOR ALL
  USING (true)
  WITH CHECK (true);
