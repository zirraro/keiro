-- Table pour tracker les générations d'images et vidéos par utilisateur
CREATE TABLE IF NOT EXISTS public.generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image', 'video')),
  prompt TEXT NOT NULL,
  result_url TEXT,
  result_urls TEXT[],
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherches rapides par utilisateur
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON public.generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON public.generations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_user_created ON public.generations(user_id, created_at DESC);

-- RLS (Row Level Security) pour que les utilisateurs ne voient que leurs propres générations
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

-- Policy: Les utilisateurs peuvent lire leurs propres générations
CREATE POLICY "Users can view own generations"
  ON public.generations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Les utilisateurs peuvent créer leurs propres générations
CREATE POLICY "Users can create own generations"
  ON public.generations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Les utilisateurs peuvent mettre à jour leurs propres générations
CREATE POLICY "Users can update own generations"
  ON public.generations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Les utilisateurs peuvent supprimer leurs propres générations
CREATE POLICY "Users can delete own generations"
  ON public.generations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_generations_updated_at
  BEFORE UPDATE ON public.generations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Commentaires pour documentation
COMMENT ON TABLE public.generations IS 'Stocke toutes les générations d''images et vidéos par utilisateur';
COMMENT ON COLUMN public.generations.user_id IS 'ID de l''utilisateur qui a créé la génération';
COMMENT ON COLUMN public.generations.type IS 'Type de génération: image ou video';
COMMENT ON COLUMN public.generations.prompt IS 'Prompt utilisé pour la génération';
COMMENT ON COLUMN public.generations.result_url IS 'URL du résultat principal (première image/vidéo)';
COMMENT ON COLUMN public.generations.result_urls IS 'Tableau de toutes les URLs de résultats (pour les variantes)';
COMMENT ON COLUMN public.generations.error IS 'Message d''erreur si la génération a échoué';
