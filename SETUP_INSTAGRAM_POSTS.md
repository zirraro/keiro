# Setup Instagram Posts - À EXÉCUTER MAINTENANT

## Problème
La table `instagram_posts` n'existe pas encore en production sur Supabase.
Les posts Instagram ne s'affichent pas dans le widget.

## Solution - EXÉCUTE CE SQL DANS SUPABASE DASHBOARD

### 1. Ouvre Supabase Dashboard
- Va sur https://supabase.com/dashboard
- Sélectionne ton projet Keiro
- Va dans "SQL Editor"

### 2. Copie-colle et EXÉCUTE ce SQL :

```sql
-- 1. CRÉER LA TABLE INSTAGRAM_POSTS
CREATE TABLE IF NOT EXISTS instagram_posts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  caption TEXT,
  permalink TEXT NOT NULL,
  media_type TEXT,
  timestamp TIMESTAMP WITH TIME ZONE,

  original_media_url TEXT,
  cached_media_url TEXT NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. INDEX POUR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_instagram_posts_user_id
  ON instagram_posts(user_id, timestamp DESC);

-- 3. ACTIVER RLS (ROW LEVEL SECURITY)
ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES RLS
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

-- 5. COMMENTAIRES
COMMENT ON TABLE instagram_posts IS 'Posts Instagram avec URLs cachées dans Supabase Storage';
COMMENT ON COLUMN instagram_posts.cached_media_url IS 'URL stable depuis Supabase Storage';
COMMENT ON COLUMN instagram_posts.original_media_url IS 'URL Instagram originale (peut expirer)';
```

### 3. Clique sur "RUN" ou Ctrl+Enter

### 4. Vérifie que ça a marché
- Va dans "Table Editor"
- Tu devrais voir la table `instagram_posts`

### 5. Recharge ton app Keiro
- Le widget Instagram va automatiquement :
  1. Synchroniser tes 8 derniers posts Instagram
  2. Les télécharger dans Supabase Storage
  3. Les afficher dans le widget

## C'est fait !
Une fois cette table créée, tes posts Instagram s'afficheront automatiquement.
