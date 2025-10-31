-- Migration pour créer la table library_items
-- Cette table stocke les visuels générés et les images uploadées par les utilisateurs

-- Créer la table library_items
CREATE TABLE IF NOT EXISTS public.library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiant utilisateur (nullable pour l'instant, avant l'auth)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Type d'item: 'generation' (créé par IA) ou 'upload' (uploadé par l'utilisateur)
  type TEXT NOT NULL CHECK (type IN ('generation', 'upload')),

  -- Informations de l'image
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT, -- Optionnel: URL de la miniature

  -- Métadonnées pour les générations
  news_title TEXT, -- Titre de l'actualité utilisée
  news_url TEXT, -- URL de l'actualité
  business_type TEXT, -- Type de business (ex: "Restaurant bio")

  -- Métadonnées supplémentaires en JSON
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_library_items_user_id ON public.library_items(user_id);
CREATE INDEX IF NOT EXISTS idx_library_items_type ON public.library_items(type);
CREATE INDEX IF NOT EXISTS idx_library_items_created_at ON public.library_items(created_at DESC);

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour updated_at automatiquement
CREATE TRIGGER update_library_items_updated_at
  BEFORE UPDATE ON public.library_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Politique RLS (Row Level Security) - Pour l'instant, accès public
-- À modifier plus tard quand l'authentification sera activée
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;

-- Politique temporaire: tout le monde peut lire et écrire (avant auth)
CREATE POLICY "Public access for library_items" ON public.library_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Commentaires pour documentation
COMMENT ON TABLE public.library_items IS 'Stocke les visuels générés et uploadés par les utilisateurs';
COMMENT ON COLUMN public.library_items.type IS 'Type: generation (créé par IA) ou upload (uploadé par utilisateur)';
COMMENT ON COLUMN public.library_items.metadata IS 'Données JSON supplémentaires (paramètres de génération, tags, etc.)';
