-- =====================================================
-- RÉINITIALISATION COMPLÈTE INSTAGRAM + STORAGE
-- =====================================================
-- Ce script supprime TOUT et recrée proprement
-- Copie-colle dans Supabase SQL Editor et exécute

-- 1. SUPPRIMER L'ANCIENNE TABLE
DROP TABLE IF EXISTS instagram_posts CASCADE;

-- 2. SUPPRIMER TOUTES LES POLICIES DU BUCKET (si elles existent)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

-- 3. SUPPRIMER TOUS LES FICHIERS DU BUCKET D'ABORD
DELETE FROM storage.objects WHERE bucket_id = 'instagram-media';

-- 4. MAINTENANT SUPPRIMER LE BUCKET
DELETE FROM storage.buckets WHERE name = 'instagram-media';

-- 4. CRÉER LE BUCKET EN PUBLIC
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'instagram-media',
  'instagram-media',
  true, -- IMPORTANT: PUBLIC = TRUE
  10485760, -- 10MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
);

-- 5. CRÉER LA POLICY D'ACCÈS PUBLIC POUR LECTURE
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'instagram-media' );

-- 6. POLICIES POUR UPLOAD/UPDATE/DELETE (users seulement dans leur dossier)
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'instagram-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'instagram-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'instagram-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 7. CRÉER LA TABLE INSTAGRAM_POSTS
CREATE TABLE instagram_posts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  caption TEXT,
  permalink TEXT NOT NULL,
  media_type TEXT,
  posted_at TIMESTAMP WITH TIME ZONE,

  original_media_url TEXT,
  cached_media_url TEXT NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. INDEX POUR PERFORMANCE
CREATE INDEX idx_instagram_posts_user_id
  ON instagram_posts(user_id, posted_at DESC);

-- 9. ACTIVER RLS
ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;

-- 10. POLICIES RLS
CREATE POLICY "Users view own Instagram posts"
  ON instagram_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own Instagram posts"
  ON instagram_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own Instagram posts"
  ON instagram_posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own Instagram posts"
  ON instagram_posts FOR DELETE
  USING (auth.uid() = user_id);

-- 11. COMMENTAIRES
COMMENT ON TABLE instagram_posts IS 'Posts Instagram avec URLs cachées dans Supabase Storage PUBLIC';
COMMENT ON COLUMN instagram_posts.cached_media_url IS 'URL stable depuis Supabase Storage - bucket PUBLIC';

-- =====================================================
-- ✅ TERMINÉ !
-- =====================================================
-- Maintenant:
-- 1. Recharge ton app Keiro
-- 2. Attends 5 secondes (sync auto)
-- 3. Les images devraient s'afficher correctement
-- =====================================================
