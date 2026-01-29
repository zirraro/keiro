-- ========================================
-- SCRIPT DE VÉRIFICATION SUPABASE - TIKTOK
-- ========================================
-- Exécuter ce script dans Supabase SQL Editor
-- pour vérifier que tout est correctement configuré

-- 1. Vérifier colonnes TikTok dans profiles
SELECT
  'profiles - TikTok columns' AS check_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name LIKE 'tiktok_%'
ORDER BY column_name;

-- 2. Vérifier table tiktok_posts existe
SELECT
  'tiktok_posts - Table exists' AS check_name,
  table_name,
  table_type
FROM information_schema.tables
WHERE table_name = 'tiktok_posts';

-- 3. Vérifier colonnes tiktok_posts
SELECT
  'tiktok_posts - Columns' AS check_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'tiktok_posts'
ORDER BY ordinal_position;

-- 4. Vérifier RLS policies sur tiktok_posts
SELECT
  'tiktok_posts - RLS Policies' AS check_name,
  policyname AS policy_name,
  cmd AS command,
  qual AS using_expression
FROM pg_policies
WHERE tablename = 'tiktok_posts';

-- 5. Vérifier RLS activé
SELECT
  'tiktok_posts - RLS Enabled' AS check_name,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename = 'tiktok_posts';

-- 6. Vérifier storage bucket generated-images
SELECT
  'Storage - generated-images bucket' AS check_name,
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE name = 'generated-images';

-- 7. Vérifier policies storage
SELECT
  'Storage - RLS Policies' AS check_name,
  policyname AS policy_name,
  cmd AS command
FROM pg_policies
WHERE schemaname = 'storage'
AND tablename = 'objects';

-- 8. Test complet: Vérifier connexion TikTok d'un utilisateur (remplacer USER_ID)
-- IMPORTANT: Remplacer 'USER_ID_HERE' par l'ID réel de l'utilisateur
/*
SELECT
  'User TikTok Connection' AS check_name,
  id,
  tiktok_user_id,
  tiktok_username,
  tiktok_display_name,
  tiktok_token_expiry,
  tiktok_connected_at,
  CASE
    WHEN tiktok_user_id IS NULL THEN '❌ Non connecté'
    WHEN tiktok_token_expiry < NOW() THEN '⚠️ Token expiré'
    ELSE '✅ Connecté'
  END AS status
FROM profiles
WHERE id = 'USER_ID_HERE';
*/

-- 9. Compter posts TikTok par utilisateur
SELECT
  'TikTok Posts Count' AS check_name,
  user_id,
  COUNT(*) AS total_posts,
  MAX(posted_at) AS last_post_date,
  MAX(synced_at) AS last_sync_date
FROM tiktok_posts
GROUP BY user_id
ORDER BY total_posts DESC;

-- 10. Vérifier indexes
SELECT
  'Indexes' AS check_name,
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('profiles', 'tiktok_posts')
AND indexname LIKE '%tiktok%'
ORDER BY tablename, indexname;

-- ========================================
-- RÉSULTATS ATTENDUS
-- ========================================

/*
1. profiles - TikTok columns:
   - tiktok_user_id (TEXT, YES)
   - tiktok_username (TEXT, YES)
   - tiktok_display_name (TEXT, YES)
   - tiktok_avatar_url (TEXT, YES)
   - tiktok_access_token (TEXT, YES)
   - tiktok_refresh_token (TEXT, YES)
   - tiktok_token_expiry (TIMESTAMPTZ, YES)
   - tiktok_refresh_token_expiry (TIMESTAMPTZ, YES)
   - tiktok_connected_at (TIMESTAMPTZ, YES)
   - tiktok_last_sync_at (TIMESTAMPTZ, YES)

2. tiktok_posts - Table exists:
   - table_name: tiktok_posts
   - table_type: BASE TABLE

3. tiktok_posts - Colonnes principales:
   - id (TEXT, NO) - PRIMARY KEY
   - user_id (UUID, NO) - FOREIGN KEY
   - video_description, duration, cover_image_url
   - cached_video_url, share_url
   - view_count, like_count, comment_count, share_count
   - posted_at, synced_at

4. tiktok_posts - RLS Policies:
   - Users view own TikTok posts (SELECT)
   - Users insert own TikTok posts (INSERT)
   - Users update own TikTok posts (UPDATE)
   - Users delete own TikTok posts (DELETE)

5. tiktok_posts - RLS Enabled:
   - rls_enabled: true

6. Storage - generated-images bucket:
   - public: true
   - file_size_limit: 104857600 (100MB)
   - allowed_mime_types: {video/mp4, video/quicktime, image/jpeg, image/png}

7. Storage - RLS Policies:
   - Users upload own content (INSERT)
   - Public read access (SELECT)
*/

-- ========================================
-- CORRECTIONS SI NÉCESSAIRE
-- ========================================

-- Si table tiktok_posts manquante, exécuter:
-- \i supabase/migrations/20260127_tiktok_posts_table.sql

-- Si colonnes profiles manquantes, exécuter:
-- \i supabase/migrations/20260127_add_tiktok_tokens.sql

-- Si bucket manquant, créer avec:
/*
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-images',
  'generated-images',
  true,
  104857600,
  ARRAY['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
);
*/

-- Si RLS policies manquantes, exécuter les CREATE POLICY depuis les migrations
