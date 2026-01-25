-- Migration pour caching des media Instagram dans Supabase Storage
-- Résout les problèmes d'images noires dues aux CORS et expiration des URLs Instagram

-- Ajouter colonnes pour caching media
ALTER TABLE saved_images
ADD COLUMN IF NOT EXISTS cached_instagram_url TEXT,
ADD COLUMN IF NOT EXISTS instagram_media_cached_at TIMESTAMP WITH TIME ZONE;

-- Index pour refresh automatique (images > 7 jours)
CREATE INDEX IF NOT EXISTS idx_instagram_cache_expiry
  ON saved_images(instagram_media_cached_at)
  WHERE cached_instagram_url IS NOT NULL;

-- Commentaires pour documentation
COMMENT ON COLUMN saved_images.cached_instagram_url IS 'URL publique Supabase Storage pour image Instagram cachée';
COMMENT ON COLUMN saved_images.instagram_media_cached_at IS 'Date de mise en cache - refresh si > 7 jours';
