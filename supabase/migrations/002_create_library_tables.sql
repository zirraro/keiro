-- ============================================
-- MIGRATION: Système de Librairie avec Workspace Instagram
-- ============================================
-- Ce fichier crée les tables pour :
-- 1. Organiser les images en dossiers
-- 2. Sauvegarder les images générées
-- 3. Préparer les posts Instagram (description + hashtags)
-- ============================================

-- =============================================
-- TABLE 1: library_folders
-- Dossiers pour organiser les images
-- =============================================
CREATE TABLE IF NOT EXISTS public.library_folders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6', -- Couleur du dossier (hex)
  icon TEXT DEFAULT '📁', -- Emoji pour le dossier
  parent_folder_id UUID REFERENCES public.library_folders(id) ON DELETE CASCADE, -- Pour sous-dossiers
  position INTEGER DEFAULT 0, -- Ordre d'affichage
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherches rapides
CREATE INDEX IF NOT EXISTS idx_library_folders_user_id ON public.library_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_library_folders_parent ON public.library_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_library_folders_position ON public.library_folders(user_id, position);

-- RLS pour library_folders
ALTER TABLE public.library_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own folders"
  ON public.library_folders
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own folders"
  ON public.library_folders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own folders"
  ON public.library_folders
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own folders"
  ON public.library_folders
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger pour updated_at
CREATE TRIGGER update_library_folders_updated_at
  BEFORE UPDATE ON public.library_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Commentaires
COMMENT ON TABLE public.library_folders IS 'Dossiers pour organiser les images de la librairie';
COMMENT ON COLUMN public.library_folders.parent_folder_id IS 'ID du dossier parent (NULL si dossier racine)';
COMMENT ON COLUMN public.library_folders.position IS 'Ordre d''affichage dans l''interface';


-- =============================================
-- TABLE 2: saved_images
-- Images sauvegardées avec métadonnées complètes
-- =============================================
CREATE TABLE IF NOT EXISTS public.saved_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.library_folders(id) ON DELETE SET NULL, -- NULL = racine

  -- Image data
  image_url TEXT NOT NULL, -- URL de l'image (Vercel Blob ou Supabase Storage)
  thumbnail_url TEXT, -- URL de la miniature pour performance

  -- Métadonnées de génération
  news_title TEXT, -- Titre de l'actualité utilisée
  news_description TEXT, -- Description de l'actu
  news_category TEXT, -- Catégorie (Tech, Business, etc.)
  news_source TEXT, -- Source de l'actu

  business_type TEXT, -- Type de business utilisé
  business_description TEXT,

  text_overlay TEXT, -- Texte ajouté sur l'image
  visual_style TEXT, -- Style visuel utilisé
  tone TEXT, -- Ton de communication

  -- Prompt et IA
  generation_prompt TEXT, -- Prompt complet utilisé
  ai_model TEXT DEFAULT 'seedream', -- Modèle IA utilisé

  -- Organisation
  title TEXT, -- Titre personnalisé par l'utilisateur
  tags TEXT[], -- Tags pour recherche
  is_favorite BOOLEAN DEFAULT false,

  -- Stats
  download_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_saved_images_user_id ON public.saved_images(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_images_folder_id ON public.saved_images(folder_id);
CREATE INDEX IF NOT EXISTS idx_saved_images_created_at ON public.saved_images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_images_user_created ON public.saved_images(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_images_favorites ON public.saved_images(user_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_saved_images_tags ON public.saved_images USING GIN(tags); -- Index GIN pour recherche dans array

-- RLS pour saved_images
ALTER TABLE public.saved_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved images"
  ON public.saved_images
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own saved images"
  ON public.saved_images
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved images"
  ON public.saved_images
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved images"
  ON public.saved_images
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger pour updated_at
CREATE TRIGGER update_saved_images_updated_at
  BEFORE UPDATE ON public.saved_images
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Commentaires
COMMENT ON TABLE public.saved_images IS 'Images sauvegardées dans la librairie avec métadonnées complètes';
COMMENT ON COLUMN public.saved_images.folder_id IS 'Dossier contenant l''image (NULL = racine)';
COMMENT ON COLUMN public.saved_images.tags IS 'Tags pour recherche et organisation';
COMMENT ON COLUMN public.saved_images.is_favorite IS 'Image marquée comme favorite';


-- =============================================
-- TABLE 3: instagram_posts
-- Workspace pour préparer les posts Instagram
-- =============================================
CREATE TABLE IF NOT EXISTS public.instagram_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_image_id UUID NOT NULL REFERENCES public.saved_images(id) ON DELETE CASCADE,

  -- Contenu du post
  caption TEXT, -- Description/légende du post Instagram
  hashtags TEXT[], -- Liste de hashtags

  -- État de publication
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published')),
  scheduled_for TIMESTAMP WITH TIME ZONE, -- Date/heure de publication prévue
  published_at TIMESTAMP WITH TIME ZONE, -- Date/heure de publication réelle

  -- Données Instagram (après publication)
  instagram_post_id TEXT, -- ID du post sur Instagram
  instagram_permalink TEXT, -- URL du post

  -- Stats (après publication)
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_instagram_posts_user_id ON public.instagram_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_image_id ON public.instagram_posts(saved_image_id);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_status ON public.instagram_posts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_scheduled ON public.instagram_posts(scheduled_for) WHERE status = 'scheduled';

-- RLS pour instagram_posts
ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own instagram posts"
  ON public.instagram_posts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own instagram posts"
  ON public.instagram_posts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own instagram posts"
  ON public.instagram_posts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own instagram posts"
  ON public.instagram_posts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger pour updated_at
CREATE TRIGGER update_instagram_posts_updated_at
  BEFORE UPDATE ON public.instagram_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Commentaires
COMMENT ON TABLE public.instagram_posts IS 'Workspace pour préparer et publier les posts Instagram';
COMMENT ON COLUMN public.instagram_posts.status IS 'État: draft (brouillon), scheduled (programmé), published (publié)';
COMMENT ON COLUMN public.instagram_posts.caption IS 'Légende/description du post';
COMMENT ON COLUMN public.instagram_posts.hashtags IS 'Liste de hashtags pour le post';


-- =============================================
-- FONCTION HELPER: Compter les images par dossier
-- =============================================
CREATE OR REPLACE FUNCTION count_images_in_folder(folder_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.saved_images
  WHERE folder_id = folder_uuid;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION count_images_in_folder IS 'Compte le nombre d''images dans un dossier';


-- =============================================
-- FONCTION HELPER: Statistiques librairie par utilisateur
-- =============================================
CREATE OR REPLACE FUNCTION get_library_stats(user_uuid UUID)
RETURNS TABLE (
  total_images INTEGER,
  total_folders INTEGER,
  total_favorites INTEGER,
  total_instagram_drafts INTEGER,
  total_size_mb NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM public.saved_images WHERE user_id = user_uuid),
    (SELECT COUNT(*)::INTEGER FROM public.library_folders WHERE user_id = user_uuid),
    (SELECT COUNT(*)::INTEGER FROM public.saved_images WHERE user_id = user_uuid AND is_favorite = true),
    (SELECT COUNT(*)::INTEGER FROM public.instagram_posts WHERE user_id = user_uuid AND status = 'draft'),
    0::NUMERIC -- TODO: Calculer taille réelle via Supabase Storage
  ;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_library_stats IS 'Retourne les statistiques de la librairie d''un utilisateur';


-- =============================================
-- INDEX FULL-TEXT SEARCH (optionnel mais utile)
-- =============================================
-- Index pour recherche texte dans saved_images
CREATE INDEX IF NOT EXISTS idx_saved_images_search
  ON public.saved_images
  USING GIN(to_tsvector('french', COALESCE(title, '') || ' ' || COALESCE(news_title, '') || ' ' || COALESCE(text_overlay, '')));

COMMENT ON INDEX idx_saved_images_search IS 'Index pour recherche full-text en français';
