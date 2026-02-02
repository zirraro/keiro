# Configuration Supabase - Autoriser Audio & Vidéos

## ⚠️ Étapes OBLIGATOIRES

Vous devez exécuter ces 3 migrations SQL dans Supabase pour que l'application fonctionne correctement.

---

## 1️⃣ Autoriser audio MP3 et vidéos MP4 dans le bucket

### Problème résolu:
- ❌ "mime type audio/mpeg is not supported"
- ❌ "mime type video/mp4 is not supported"

### Étapes:

1. **Ouvrir Supabase Dashboard**
   - https://supabase.com/dashboard
   - Sélectionnez votre projet

2. **Aller dans SQL Editor**
   - Menu de gauche → **SQL Editor**
   - Cliquez sur **New query**

3. **Copier-coller ce code SQL:**

```sql
-- Autoriser vidéos MP4 ET audio MP3 dans bucket generated-images
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav'
  ],
  file_size_limit = 104857600  -- 100MB
WHERE name = 'generated-images';

-- Vérifier la configuration
SELECT
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE name = 'generated-images';
```

4. **Cliquer sur "Run"** (ou Ctrl+Enter)

---

## 2️⃣ Ajouter colonnes de tracking de conversion TikTok

### Étapes:

1. **Toujours dans SQL Editor** → **New query**

2. **Copier-coller ce code SQL:**

```sql
-- Ajouter colonnes de tracking de conversion TikTok
ALTER TABLE my_videos
  ADD COLUMN IF NOT EXISTS tiktok_converted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- Ajouter index pour performance
CREATE INDEX IF NOT EXISTS idx_my_videos_tiktok_converted
  ON my_videos(tiktok_converted, converted_at DESC)
  WHERE tiktok_converted = TRUE;
```

3. **Cliquer sur "Run"**

---

## 3️⃣ Ajouter support vidéos dans brouillons TikTok

### Problème résolu:
- ❌ Impossible de sauvegarder les vidéos converties dans les brouillons
- ❌ Pas de catégorie "TIKTOK PUBLIÉS"

### Étapes:

1. **Toujours dans SQL Editor** → **New query**

2. **Copier-coller TOUT le contenu du fichier ci-dessous:**

📄 **Fichier**: `supabase/migrations/20260202_add_video_support_to_tiktok_drafts_SAFE.sql`

**OU copiez directement ce code** (version sécurisée qui vérifie si les colonnes existent déjà):

```sql
-- Migration SAFE: Add video support and category to tiktok_drafts
DO $$
BEGIN
  -- Add video_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'video_id'
  ) THEN
    ALTER TABLE public.tiktok_drafts
      ADD COLUMN video_id UUID REFERENCES public.my_videos(id) ON DELETE SET NULL;
  END IF;

  -- Add media_type if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'media_type'
  ) THEN
    ALTER TABLE public.tiktok_drafts
      ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video'));
  END IF;

  -- Add category if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'category'
  ) THEN
    ALTER TABLE public.tiktok_drafts
      ADD COLUMN category TEXT DEFAULT 'draft' CHECK (category IN ('draft', 'converted', 'published'));
  END IF;
END $$;

-- Rename image_url to media_url (only if image_url exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'image_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'media_url'
  ) THEN
    ALTER TABLE public.tiktok_drafts RENAME COLUMN image_url TO media_url;
  END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_tiktok_drafts_video_id
  ON public.tiktok_drafts(video_id)
  WHERE video_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tiktok_drafts_category
  ON public.tiktok_drafts(user_id, category, created_at DESC);
```

3. **Cliquer sur "Run"**

⚠️ **Si vous avez une erreur**: Ouvrez le fichier complet `20260202_add_video_support_to_tiktok_drafts_SAFE.sql` et copiez-collez TOUT le contenu.

---

**Date**: 2026-02-02
