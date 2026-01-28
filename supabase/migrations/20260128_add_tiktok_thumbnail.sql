-- Migration: Ajouter cached_thumbnail_url et share_url à tiktok_posts
-- Date: 2026-01-28

-- 1. Ajouter la colonne cached_thumbnail_url pour les miniatures
ALTER TABLE public.tiktok_posts
ADD COLUMN IF NOT EXISTS cached_thumbnail_url TEXT;

-- 2. Ajouter la colonne share_url (alias de permalink pour compatibilité)
ALTER TABLE public.tiktok_posts
ADD COLUMN IF NOT EXISTS share_url TEXT;

-- 3. Ajouter des colonnes de statistiques pour le widget
ALTER TABLE public.tiktok_posts
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

ALTER TABLE public.tiktok_posts
ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;

ALTER TABLE public.tiktok_posts
ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;

ALTER TABLE public.tiktok_posts
ADD COLUMN IF NOT EXISTS share_count INTEGER DEFAULT 0;

-- 4. Mettre cached_video_url nullable (car on peut utiliser cover_image_url)
ALTER TABLE public.tiktok_posts
ALTER COLUMN cached_video_url DROP NOT NULL;

-- ✅ RÉSULTAT:
-- - cached_thumbnail_url ajouté pour stocker miniatures
-- - share_url ajouté pour URL de partage
-- - Statistiques ajoutées pour le widget
-- - cached_video_url peut être NULL
