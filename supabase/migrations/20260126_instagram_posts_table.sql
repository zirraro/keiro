-- Table dédiée pour les posts Instagram (séparée de saved_images)
-- Stocke les posts Instagram avec leurs URLs cachées depuis Supabase Storage

CREATE TABLE IF NOT EXISTS instagram_posts (
  id TEXT PRIMARY KEY, -- ID du post Instagram (ex: 18070854790915903)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Données Instagram
  caption TEXT,
  permalink TEXT NOT NULL, -- Lien vers le post Instagram original
  media_type TEXT, -- IMAGE, VIDEO, CAROUSEL_ALBUM
  posted_at TIMESTAMP WITH TIME ZONE,

  -- URLs
  original_media_url TEXT, -- URL Instagram originale (peut expirer)
  cached_media_url TEXT NOT NULL, -- URL Supabase Storage (stable)

  -- Métadonnées
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_instagram_posts_user_id
  ON instagram_posts(user_id, posted_at DESC);

-- RLS Policies
ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;

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

-- Commentaires
COMMENT ON TABLE instagram_posts IS 'Posts Instagram de l''utilisateur avec URLs cachées dans Supabase Storage';
COMMENT ON COLUMN instagram_posts.cached_media_url IS 'URL stable depuis Supabase Storage - ne jamais expirer';
COMMENT ON COLUMN instagram_posts.original_media_url IS 'URL Instagram originale - peut expirer';
