-- =====================================================
-- INTÉGRATION TIKTOK COMPLÈTE - SQL À COPIER-COLLER
-- =====================================================
-- Copie tout ce fichier dans Supabase SQL Editor et exécute

-- 1. AJOUTER COLONNES TIKTOK À PROFILES
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tiktok_user_id TEXT,
ADD COLUMN IF NOT EXISTS tiktok_username TEXT,
ADD COLUMN IF NOT EXISTS tiktok_display_name TEXT,
ADD COLUMN IF NOT EXISTS tiktok_avatar_url TEXT,
ADD COLUMN IF NOT EXISTS tiktok_access_token TEXT,
ADD COLUMN IF NOT EXISTS tiktok_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS tiktok_token_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tiktok_refresh_token_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tiktok_connected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tiktok_last_sync_at TIMESTAMPTZ;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_profiles_tiktok_user_id
  ON profiles(tiktok_user_id)
  WHERE tiktok_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_tiktok_token_expiry
  ON profiles(tiktok_token_expiry)
  WHERE tiktok_token_expiry IS NOT NULL;

-- 2. CRÉER TABLE TIKTOK_POSTS
CREATE TABLE IF NOT EXISTS tiktok_posts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- TikTok post data
  title TEXT,
  video_description TEXT,
  duration INTEGER,
  cover_image_url TEXT,
  share_url TEXT NOT NULL,
  embed_link TEXT,

  -- Media URLs
  original_video_url TEXT,
  cached_video_url TEXT,
  cached_thumbnail_url TEXT,

  -- Post metadata
  media_type TEXT DEFAULT 'VIDEO',
  photo_count INTEGER,
  posted_at TIMESTAMP WITH TIME ZONE,

  -- Analytics
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

-- Index
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_user_id
  ON tiktok_posts(user_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_tiktok_posts_analytics_sync
  ON tiktok_posts(analytics_synced_at)
  WHERE analytics_synced_at IS NOT NULL;

-- RLS
ALTER TABLE tiktok_posts ENABLE ROW LEVEL SECURITY;

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

-- 3. ÉTENDRE SCHEDULED_POSTS POUR TIKTOK
ALTER TABLE scheduled_posts
ADD COLUMN IF NOT EXISTS tiktok_publish_id TEXT,
ADD COLUMN IF NOT EXISTS tiktok_video_url TEXT,
ADD COLUMN IF NOT EXISTS privacy_level VARCHAR(20) DEFAULT 'PUBLIC_TO_EVERYONE',
ADD COLUMN IF NOT EXISTS disable_duet BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS disable_stitch BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS disable_comment BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS video_cover_timestamp DECIMAL;

-- Update platform constraint (focus sur social media créatif, pas LinkedIn)
ALTER TABLE scheduled_posts DROP CONSTRAINT IF EXISTS check_platform;
ALTER TABLE scheduled_posts ADD CONSTRAINT check_platform
  CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'twitter'));

-- Index
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_tiktok_publish_id
  ON scheduled_posts(tiktok_publish_id)
  WHERE tiktok_publish_id IS NOT NULL;

-- =====================================================
-- ✅ TERMINÉ !
-- =====================================================
-- Maintenant tu peux connecter TikTok dans l'app
