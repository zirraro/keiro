# Configuration Supabase - Autoriser Audio & Vidéos

## ⚠️ Étapes OBLIGATOIRES

Vous devez exécuter ces 2 migrations SQL dans Supabase pour que l'application fonctionne correctement.

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

3. **Cliquer on "Run"**

---

**Date**: 2026-02-02
