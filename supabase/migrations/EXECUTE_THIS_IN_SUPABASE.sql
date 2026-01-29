-- ========================================
-- MIGRATION COMPLÈTE VIDÉOS - EXÉCUTER DANS SUPABASE SQL EDITOR
-- ========================================
-- Date: 2026-01-29
-- IMPORTANT: Exécuter CE FICHIER EN ENTIER (tout sélectionner + Run)

-- ========================================
-- ÉTAPE 1: CRÉER TABLE MY_VIDEOS
-- ========================================

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
  original_image_id UUID, -- If converted from image (references saved_images but no FK to avoid issues)

  -- Video properties
  width INTEGER,
  height INTEGER,
  file_size BIGINT, -- Size in bytes
  format TEXT DEFAULT 'mp4', -- mp4, mov, etc.

  -- Organization
  folder_id UUID, -- References folders but no FK constraint to avoid migration issues
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
DROP POLICY IF EXISTS "Users view own videos" ON my_videos;
CREATE POLICY "Users view own videos"
  ON my_videos FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own videos" ON my_videos;
CREATE POLICY "Users insert own videos"
  ON my_videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own videos" ON my_videos;
CREATE POLICY "Users update own videos"
  ON my_videos FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own videos" ON my_videos;
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

DROP TRIGGER IF EXISTS my_videos_updated_at ON my_videos;
CREATE TRIGGER my_videos_updated_at
  BEFORE UPDATE ON my_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_my_videos_updated_at();

-- Comments for documentation
COMMENT ON TABLE my_videos IS 'Dedicated table for user videos (Seedream I2V, uploads, TikTok sync)';
COMMENT ON COLUMN my_videos.video_url IS 'Stable URL from Supabase Storage';
COMMENT ON COLUMN my_videos.source_type IS 'How the video was created: seedream_i2v, upload, tiktok_sync';
COMMENT ON COLUMN my_videos.tiktok_publish_id IS 'TikTok publish ID if published to TikTok';

-- ========================================
-- ÉTAPE 2: MIGRER VIDÉOS EXISTANTES
-- ========================================

-- Insert existing videos into my_videos table
-- Videos are identified by .mp4, .mov, .webm extensions in image_url
INSERT INTO my_videos (
  user_id,
  title,
  video_url,
  thumbnail_url,
  source_type,
  folder_id,
  is_favorite,
  created_at,
  updated_at
)
SELECT
  user_id,
  title,
  image_url AS video_url,
  thumbnail_url,
  CASE
    WHEN image_url LIKE '%tiktok-videos%' THEN 'seedream_i2v'
    ELSE 'upload'
  END AS source_type,
  folder_id,
  is_favorite,
  created_at,
  created_at AS updated_at
FROM saved_images
WHERE
  LOWER(image_url) LIKE '%.mp4%'
  OR LOWER(image_url) LIKE '%.mov%'
  OR LOWER(image_url) LIKE '%.webm%'
  OR LOWER(image_url) LIKE '%.avi%'
ON CONFLICT DO NOTHING;

-- ========================================
-- ÉTAPE 3: VÉRIFICATION
-- ========================================

-- Count migrated videos
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count FROM my_videos;
  RAISE NOTICE '✅ Migration complete: % videos migrated to my_videos table', migrated_count;
END $$;

-- Show sample of migrated videos
SELECT
  '📊 Sample of migrated videos:' AS info,
  id,
  title,
  source_type,
  created_at
FROM my_videos
ORDER BY created_at DESC
LIMIT 5;

-- Show counts by source
SELECT
  '📈 Videos by source:' AS info,
  source_type,
  COUNT(*) AS count
FROM my_videos
GROUP BY source_type;

-- ========================================
-- RÉSULTAT ATTENDU
-- ========================================

/*
Vous devriez voir:
✅ NOTICE: Migration complete: X videos migrated
✅ Table avec quelques exemples de vidéos
✅ Répartition par source (seedream_i2v, upload)

Si vous voyez ces messages, c'est OK!
Maintenant allez sur votre app et vérifiez l'onglet "Mes vidéos"
*/
