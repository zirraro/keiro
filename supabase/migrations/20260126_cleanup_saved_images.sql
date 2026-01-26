-- Nettoyage de saved_images : supprimer les colonnes Instagram inutiles
-- Ces colonnes ne sont plus utilisées car les posts Instagram sont maintenant dans instagram_posts

ALTER TABLE saved_images
DROP COLUMN IF EXISTS cached_instagram_url,
DROP COLUMN IF EXISTS instagram_media_cached_at;

-- Commentaire pour clarifier
COMMENT ON TABLE saved_images IS 'Images générées par Keiro AI (NE CONTIENT PAS les posts Instagram)';
