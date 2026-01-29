-- ========================================
-- FIX: Autoriser vidéos MP4 dans bucket generated-images
-- ========================================
-- Exécuter ce script dans Supabase SQL Editor pour résoudre:
-- "mime type video/mp4 is not supported"

-- Mettre à jour le bucket pour accepter les vidéos
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
    'video/x-msvideo'
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

-- ========================================
-- Résultat attendu:
-- ========================================
/*
name: generated-images
public: true
file_size_limit: 104857600
allowed_mime_types: {image/jpeg, image/png, ..., video/mp4, ...}
*/
