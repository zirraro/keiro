-- Migration: Créer la table tiktok_posts pour les vidéos TikTok synchronisées
-- Date: 2026-01-28

-- 1. Créer la table tiktok_posts
CREATE TABLE IF NOT EXISTS public.tiktok_posts (
  id TEXT PRIMARY KEY, -- TikTok video ID
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_description TEXT,
  duration INTEGER, -- Durée en secondes
  cover_image_url TEXT,
  permalink TEXT, -- URL de partage TikTok
  posted_at TIMESTAMPTZ,
  cached_video_url TEXT NOT NULL, -- URL stable (Supabase Storage ou cover)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Créer les index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_user_id ON public.tiktok_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_posted_at ON public.tiktok_posts(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_synced_at ON public.tiktok_posts(synced_at DESC);

-- 3. Activer Row Level Security (RLS)
ALTER TABLE public.tiktok_posts ENABLE ROW LEVEL SECURITY;

-- 4. Politique RLS: Les utilisateurs peuvent voir leurs propres vidéos
DROP POLICY IF EXISTS "Users can view own tiktok posts" ON public.tiktok_posts;
CREATE POLICY "Users can view own tiktok posts"
  ON public.tiktok_posts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. Politique RLS: Les utilisateurs peuvent insérer leurs propres vidéos
DROP POLICY IF EXISTS "Users can insert own tiktok posts" ON public.tiktok_posts;
CREATE POLICY "Users can insert own tiktok posts"
  ON public.tiktok_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 6. Politique RLS: Les utilisateurs peuvent mettre à jour leurs propres vidéos
DROP POLICY IF EXISTS "Users can update own tiktok posts" ON public.tiktok_posts;
CREATE POLICY "Users can update own tiktok posts"
  ON public.tiktok_posts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. Politique RLS: Les utilisateurs peuvent supprimer leurs propres vidéos
DROP POLICY IF EXISTS "Users can delete own tiktok posts" ON public.tiktok_posts;
CREATE POLICY "Users can delete own tiktok posts"
  ON public.tiktok_posts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 8. Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_tiktok_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Trigger pour updated_at
DROP TRIGGER IF EXISTS trigger_tiktok_posts_updated_at ON public.tiktok_posts;
CREATE TRIGGER trigger_tiktok_posts_updated_at
  BEFORE UPDATE ON public.tiktok_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_tiktok_posts_updated_at();

-- ✅ RÉSULTAT:
-- Table tiktok_posts créée avec RLS activée
-- Les utilisateurs peuvent gérer (CRUD) uniquement leurs propres vidéos TikTok
