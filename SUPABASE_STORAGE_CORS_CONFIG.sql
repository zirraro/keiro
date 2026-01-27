-- =====================================================
-- CONFIGURATION : CORS pour Supabase Storage
-- =====================================================
-- Copie cette requête dans Supabase SQL Editor pour configurer CORS

-- 1. Vérifier les buckets existants
SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE name IN ('instagram-media', 'tiktok-media');

-- 2. Créer le bucket instagram-media s'il n'existe pas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'instagram-media',
  'instagram-media',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[];

-- 3. Créer le bucket tiktok-media s'il n'existe pas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tiktok-media',
  'tiktok-media',
  true,
  104857600, -- 100MB (vidéos)
  ARRAY['video/mp4', 'video/quicktime', 'image/jpeg', 'image/jpg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['video/mp4', 'video/quicktime', 'image/jpeg', 'image/jpg', 'image/png']::text[];

-- 4. Configurer les policies RLS pour instagram-media
-- Policy: Allow public to SELECT (read) files
DROP POLICY IF EXISTS "Public can read instagram media" ON storage.objects;
CREATE POLICY "Public can read instagram media"
ON storage.objects FOR SELECT
USING (bucket_id = 'instagram-media');

-- Policy: Authenticated users can INSERT files
DROP POLICY IF EXISTS "Authenticated can upload instagram media" ON storage.objects;
CREATE POLICY "Authenticated can upload instagram media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'instagram-media');

-- Policy: Users can UPDATE their own files
DROP POLICY IF EXISTS "Users can update their instagram media" ON storage.objects;
CREATE POLICY "Users can update their instagram media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'instagram-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Users can DELETE their own files
DROP POLICY IF EXISTS "Users can delete their instagram media" ON storage.objects;
CREATE POLICY "Users can delete their instagram media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'instagram-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 5. Configurer les policies RLS pour tiktok-media
-- Policy: Allow public to SELECT (read) files
DROP POLICY IF EXISTS "Public can read tiktok media" ON storage.objects;
CREATE POLICY "Public can read tiktok media"
ON storage.objects FOR SELECT
USING (bucket_id = 'tiktok-media');

-- Policy: Authenticated users can INSERT files
DROP POLICY IF EXISTS "Authenticated can upload tiktok media" ON storage.objects;
CREATE POLICY "Authenticated can upload tiktok media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'tiktok-media');

-- Policy: Users can UPDATE their own files
DROP POLICY IF EXISTS "Users can update their tiktok media" ON storage.objects;
CREATE POLICY "Users can update their tiktok media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'tiktok-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Users can DELETE their own files
DROP POLICY IF EXISTS "Users can delete their tiktok media" ON storage.objects;
CREATE POLICY "Users can delete their tiktok media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'tiktok-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =====================================================
-- CONFIGURATION MANUELLE REQUISE (via Dashboard)
-- =====================================================
-- Les paramètres CORS ne peuvent pas être configurés via SQL.
-- Tu dois les configurer manuellement dans Supabase Dashboard :
--
-- 1. Va dans Storage > Configuration
-- 2. Pour chaque bucket (instagram-media, tiktok-media) :
--    - Allowed Origins: * (ou ton domaine spécifique)
--    - Allowed Methods: GET, HEAD, OPTIONS
--    - Allowed Headers: *
--    - Exposed Headers: Content-Length, Content-Type
--    - Max Age: 3600
--
-- OU via l'interface CLI Supabase :
-- supabase storage update instagram-media --cors-allowed-origins='*'
-- supabase storage update tiktok-media --cors-allowed-origins='*'
--
-- =====================================================

-- 6. Vérification finale
SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets
WHERE name IN ('instagram-media', 'tiktok-media');

-- =====================================================
-- RÉSULTAT ATTENDU :
-- ✅ Deux buckets créés (instagram-media, tiktok-media)
-- ✅ Buckets publics (public = true)
-- ✅ Policies RLS configurées
-- ⚠️  CORS doit être configuré manuellement via Dashboard
-- =====================================================
