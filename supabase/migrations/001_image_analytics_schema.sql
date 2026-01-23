-- Migration: Image Analytics Table
-- Description: Track engagement metrics for saved images
-- Created: 2026-01-23

-- Create image_analytics table
CREATE TABLE IF NOT EXISTS image_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_image_id UUID NOT NULL REFERENCES saved_images(id) ON DELETE CASCADE,

  -- Engagement metrics
  views INT DEFAULT 0,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  saves INT DEFAULT 0,

  -- Calculated metrics
  engagement_rate DECIMAL(5, 2) DEFAULT 0.00, -- (likes + comments + shares) / views * 100

  -- Post metadata
  posted_at TIMESTAMP WITH TIME ZONE,
  platform VARCHAR(50) DEFAULT 'instagram', -- instagram, facebook, linkedin, etc.
  post_url TEXT,

  -- Template/strategy used
  template_name VARCHAR(100),
  marketing_strategy VARCHAR(100), -- inspirant, expert, urgent, conversationnel
  visual_style VARCHAR(100),
  category VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Indexes for performance
  CONSTRAINT unique_saved_image_analytics UNIQUE (saved_image_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_image_analytics_user_id ON image_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_image_analytics_posted_at ON image_analytics(posted_at);
CREATE INDEX IF NOT EXISTS idx_image_analytics_category ON image_analytics(category);
CREATE INDEX IF NOT EXISTS idx_image_analytics_engagement_rate ON image_analytics(engagement_rate);

-- Enable RLS (Row Level Security)
ALTER TABLE image_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own analytics
CREATE POLICY "Users can view own analytics"
  ON image_analytics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analytics"
  ON image_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analytics"
  ON image_analytics FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own analytics"
  ON image_analytics FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_image_analytics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_image_analytics_timestamp
  BEFORE UPDATE ON image_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_image_analytics_updated_at();

-- Sample seed data for testing (optional)
-- INSERT INTO image_analytics (user_id, saved_image_id, views, likes, comments, shares, engagement_rate, posted_at, category, marketing_strategy)
-- SELECT
--   user_id,
--   id,
--   FLOOR(RANDOM() * 1000 + 100)::INT,
--   FLOOR(RANDOM() * 100 + 10)::INT,
--   FLOOR(RANDOM() * 20 + 2)::INT,
--   FLOOR(RANDOM() * 30 + 5)::INT,
--   ROUND((RANDOM() * 10 + 2)::NUMERIC, 2),
--   NOW() - (RANDOM() * INTERVAL '30 days'),
--   news_category,
--   tone
-- FROM saved_images
-- WHERE created_at > NOW() - INTERVAL '60 days'
-- LIMIT 50;
