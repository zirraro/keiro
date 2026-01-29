-- ========================================
-- 🔧 FIX + MIGRATION COMPLÈTE - EXÉCUTER CE FICHIER
-- ========================================
-- Ce script nettoie les erreurs précédentes et recommence proprement
-- Date: 2026-01-29
-- IMPORTANT: Copiez TOUT ce fichier et exécutez-le dans Supabase SQL Editor

-- ========================================
-- ÉTAPE 0: NETTOYAGE (si erreurs précédentes)
-- ========================================

-- Supprimer my_videos si elle existe (pour recommencer proprement)
DROP TABLE IF EXISTS my_videos CASCADE;

-- Supprimer la fonction trigger si elle existe
DROP FUNCTION IF EXISTS update_my_videos_updated_at() CASCADE;

-- ========================================
-- ÉTAPE 1: CRÉER TABLE FOLDERS (si elle n'existe pas)
-- ========================================

-- Créer table folders si elle n'existe pas déjà
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on folders
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- RLS policies for folders (if not exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'Users view own folders'
  ) THEN
    CREATE POLICY "Users view own folders"
      ON folders FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'Users insert own folders'
  ) THEN
    CREATE POLICY "Users insert own folders"
      ON folders FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'Users update own folders'
  ) THEN
    CREATE POLICY "Users update own folders"
      ON folders FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'Users delete own folders'
  ) THEN
    CREATE POLICY "Users delete own folders"
      ON folders FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ========================================
-- ÉTAPE 2: CRÉER TABLE MY_VIDEOS (SANS FK CONSTRAINTS PROBLÉMATIQUES)
-- ========================================

CREATE TABLE my_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Video metadata
  title TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration INTEGER,

  -- Source information
  source_type TEXT DEFAULT 'seedream_i2v',
  original_image_id UUID, -- NO FK constraint to avoid issues

  -- Video properties
  width INTEGER,
  height INTEGER,
  file_size BIGINT,
  format TEXT DEFAULT 'mp4',

  -- Organization
  folder_id UUID, -- NO FK constraint to avoid issues
  is_favorite BOOLEAN DEFAULT FALSE,

  -- TikTok integration
  tiktok_publish_id TEXT,
  published_to_tiktok BOOLEAN DEFAULT FALSE,
  tiktok_published_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_my_videos_user_id ON my_videos(user_id, created_at DESC);
CREATE INDEX idx_my_videos_folder_id ON my_videos(folder_id) WHERE folder_id IS NOT NULL;
CREATE INDEX idx_my_videos_tiktok ON my_videos(tiktok_publish_id) WHERE tiktok_publish_id IS NOT NULL;

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

-- Trigger for updated_at
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

-- Comments
COMMENT ON TABLE my_videos IS 'User videos from Seedream I2V, uploads, TikTok';
COMMENT ON COLUMN my_videos.video_url IS 'Supabase Storage URL';
COMMENT ON COLUMN my_videos.source_type IS 'seedream_i2v, upload, or tiktok_sync';

-- ========================================
-- ÉTAPE 3: MIGRER VIDÉOS EXISTANTES
-- ========================================

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
-- ÉTAPE 4: VÉRIFICATION
-- ========================================

DO $$
DECLARE
  video_count INTEGER;
  folder_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO video_count FROM my_videos;
  SELECT COUNT(*) INTO folder_count FROM folders;

  RAISE NOTICE '===================================';
  RAISE NOTICE '✅ MIGRATION RÉUSSIE!';
  RAISE NOTICE '===================================';
  RAISE NOTICE 'Vidéos migrées: %', video_count;
  RAISE NOTICE 'Dossiers existants: %', folder_count;
  RAISE NOTICE '===================================';
  RAISE NOTICE 'Vous pouvez maintenant aller sur votre app!';
END $$;

-- Afficher quelques vidéos migrées
SELECT
  '📊 Exemples de vidéos migrées:' AS info,
  id,
  title,
  source_type,
  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created
FROM my_videos
ORDER BY created_at DESC
LIMIT 5;

-- Statistiques
SELECT
  '📈 Statistiques par source:' AS info,
  source_type,
  COUNT(*) AS nombre
FROM my_videos
GROUP BY source_type
ORDER BY COUNT(*) DESC;

-- ========================================
-- ✅ TERMINÉ!
-- ========================================
/*
Si vous voyez "✅ MIGRATION RÉUSSIE!" ci-dessus, c'est bon!

Maintenant:
1. Allez sur https://keiroai.com/library
2. Cliquez sur l'onglet "🎬 Mes vidéos"
3. Vos vidéos devraient apparaître!

Si l'onglet est vide, c'est normal si vous n'avez pas encore de vidéos.
Générez-en une avec Seedream I2V pour tester.
*/
