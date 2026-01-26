# Setup Instagram Posts - SQL À EXÉCUTER DANS SUPABASE

## ⚠️ IMPORTANT
Si tu as déjà tenté de créer la table avant, elle existe peut-être avec des erreurs.
Le SQL ci-dessous va la SUPPRIMER et la recréer proprement.

## 📋 Instructions

### 1. Ouvre Supabase Dashboard
- Va sur https://supabase.com/dashboard
- Sélectionne ton projet Keiro
- Va dans "SQL Editor" (menu gauche)

### 2. Copie-colle et EXÉCUTE ce SQL :

```sql
-- 1. SUPPRIMER LA TABLE SI ELLE EXISTE (nettoyage complet)
DROP TABLE IF EXISTS instagram_posts CASCADE;

-- 2. CRÉER LA TABLE INSTAGRAM_POSTS (version corrigée)
CREATE TABLE instagram_posts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  caption TEXT,
  permalink TEXT NOT NULL,
  media_type TEXT,
  posted_at TIMESTAMP WITH TIME ZONE,

  original_media_url TEXT,
  cached_media_url TEXT NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. INDEX POUR PERFORMANCE
CREATE INDEX idx_instagram_posts_user_id
  ON instagram_posts(user_id, posted_at DESC);

-- 4. ACTIVER RLS (ROW LEVEL SECURITY)
ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;

-- 5. POLICIES RLS
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

-- 6. COMMENTAIRES
COMMENT ON TABLE instagram_posts IS 'Posts Instagram avec URLs cachées dans Supabase Storage';
COMMENT ON COLUMN instagram_posts.cached_media_url IS 'URL stable depuis Supabase Storage';
COMMENT ON COLUMN instagram_posts.original_media_url IS 'URL Instagram originale (peut expirer)';
```

### 3. Clique sur "RUN" (ou Ctrl+Enter)

Tu devrais voir : **"Success. No rows returned"**

### 4. Vérifie dans "Table Editor"
- Va dans "Table Editor" (menu gauche)
- Tu devrais voir la table `instagram_posts`
- Elle sera vide pour l'instant (c'est normal)

### 5. Recharge ton app Keiro

Le widget Instagram va automatiquement :
1. ✅ Synchroniser tes 8 derniers posts Instagram
2. ✅ Les télécharger dans Supabase Storage
3. ✅ Les afficher dans le widget

**Attends 3-5 secondes** après le chargement de la page pour que la sync se fasse.

## ✨ Nouveautés

Une fois la table créée, tu pourras :
- Voir tes 8 derniers posts Instagram dans le widget
- Utiliser la suggestion IA avec **Vision Claude** qui analyse vraiment l'image
- Choisir l'angle de ton post (informatif, émotionnel, inspirant, etc.)

## 🔧 Troubleshooting

**Si le widget reste vide :**
1. Ouvre la console navigateur (F12)
2. Regarde les logs `[InstagramWidget]`
3. Vérifie que la sync s'est bien déclenchée

**Si tu as une erreur SQL :**
- Assure-toi de copier TOUT le SQL (du DROP jusqu'aux COMMENT)
- Vérifie qu'il n'y a pas de caractères bizarres
