-- Migration: Scheduled Posts Table
-- Description: Track scheduled publications for images
-- Created: 2026-01-24

-- Create scheduled_posts table
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_image_id UUID NOT NULL REFERENCES saved_images(id) ON DELETE CASCADE,

  -- Platform & scheduling
  platform VARCHAR(50) NOT NULL DEFAULT 'instagram', -- instagram, facebook, linkedin, twitter
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Content
  caption TEXT,
  hashtags TEXT[], -- Array de hashtags

  -- Status
  status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, published, failed, cancelled

  -- Publication result (when published)
  published_at TIMESTAMP WITH TIME ZONE,
  post_url TEXT,
  error_message TEXT,

  -- Collaboration (Business plan)
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approval_status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  comments TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_id ON scheduled_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_for ON scheduled_posts(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_platform ON scheduled_posts(platform);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_approval_status ON scheduled_posts(approval_status);

-- Enable RLS (Row Level Security)
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own scheduled posts
CREATE POLICY "Users can view own scheduled posts"
  ON scheduled_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scheduled posts"
  ON scheduled_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled posts"
  ON scheduled_posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled posts"
  ON scheduled_posts FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_scheduled_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_scheduled_posts_timestamp
  BEFORE UPDATE ON scheduled_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_posts_updated_at();
