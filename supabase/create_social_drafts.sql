-- Tables brouillons LinkedIn et Twitter/X
-- À exécuter dans Supabase SQL Editor

-- LinkedIn Drafts
CREATE TABLE IF NOT EXISTS linkedin_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  saved_image_id UUID,
  video_id UUID,
  media_url TEXT NOT NULL,
  media_type TEXT DEFAULT 'image',
  caption TEXT DEFAULT '',
  hashtags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  category TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ
);

-- Twitter/X Drafts
CREATE TABLE IF NOT EXISTS twitter_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  saved_image_id UUID,
  video_id UUID,
  media_url TEXT NOT NULL,
  media_type TEXT DEFAULT 'image',
  caption TEXT DEFAULT '',
  hashtags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  category TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ
);

-- RLS
ALTER TABLE linkedin_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitter_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own linkedin drafts" ON linkedin_drafts
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own twitter drafts" ON twitter_drafts
  FOR ALL USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_linkedin_drafts_user ON linkedin_drafts(user_id);
CREATE INDEX idx_twitter_drafts_user ON twitter_drafts(user_id);

-- Colonnes futures dans profiles (pour OAuth LinkedIn/Twitter)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_user_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS twitter_user_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS twitter_username TEXT;
