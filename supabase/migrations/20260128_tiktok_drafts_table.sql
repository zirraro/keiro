-- Migration: Créer la table tiktok_drafts pour les brouillons TikTok
-- Date: 2026-01-28

-- 1. Créer la table tiktok_drafts
CREATE TABLE IF NOT EXISTS public.tiktok_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_image_id UUID REFERENCES public.saved_images(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  caption TEXT,
  hashtags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ
);

-- 2. Créer les index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_tiktok_drafts_user_id ON public.tiktok_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_drafts_status ON public.tiktok_drafts(status);
CREATE INDEX IF NOT EXISTS idx_tiktok_drafts_created_at ON public.tiktok_drafts(created_at DESC);

-- 3. Activer Row Level Security (RLS)
ALTER TABLE public.tiktok_drafts ENABLE ROW LEVEL SECURITY;

-- 4. Politique RLS: Les utilisateurs peuvent voir leurs propres brouillons
DROP POLICY IF EXISTS "Users can view own tiktok drafts" ON public.tiktok_drafts;
CREATE POLICY "Users can view own tiktok drafts"
  ON public.tiktok_drafts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. Politique RLS: Les utilisateurs peuvent insérer leurs propres brouillons
DROP POLICY IF EXISTS "Users can insert own tiktok drafts" ON public.tiktok_drafts;
CREATE POLICY "Users can insert own tiktok drafts"
  ON public.tiktok_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 6. Politique RLS: Les utilisateurs peuvent mettre à jour leurs propres brouillons
DROP POLICY IF EXISTS "Users can update own tiktok drafts" ON public.tiktok_drafts;
CREATE POLICY "Users can update own tiktok drafts"
  ON public.tiktok_drafts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. Politique RLS: Les utilisateurs peuvent supprimer leurs propres brouillons
DROP POLICY IF EXISTS "Users can delete own tiktok drafts" ON public.tiktok_drafts;
CREATE POLICY "Users can delete own tiktok drafts"
  ON public.tiktok_drafts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 8. Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_tiktok_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Trigger pour updated_at
DROP TRIGGER IF EXISTS trigger_tiktok_drafts_updated_at ON public.tiktok_drafts;
CREATE TRIGGER trigger_tiktok_drafts_updated_at
  BEFORE UPDATE ON public.tiktok_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_tiktok_drafts_updated_at();

-- ✅ RÉSULTAT:
-- Table tiktok_drafts créée avec RLS activée
-- Les utilisateurs peuvent gérer (CRUD) uniquement leurs propres brouillons
