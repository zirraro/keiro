-- =====================================================
-- DIAGNOSTIC : Images Instagram noires
-- =====================================================
-- Copie cette requête dans Supabase SQL Editor pour diagnostiquer

-- 1. Vérifier que cached_media_url existe dans DB
SELECT
  id,
  substring(cached_media_url from 1 for 80) as cached_url_preview,
  substring(original_media_url from 1 for 60) as original_url_preview,
  CASE
    WHEN cached_media_url IS NOT NULL THEN '✅ Cache OK'
    ELSE '❌ Cache manquant'
  END as cache_status,
  posted_at
FROM instagram_posts
ORDER BY posted_at DESC
LIMIT 10;

-- 2. Compter les posts avec/sans cache
SELECT
  COUNT(*) FILTER (WHERE cached_media_url IS NOT NULL) as posts_avec_cache,
  COUNT(*) FILTER (WHERE cached_media_url IS NULL) as posts_sans_cache,
  COUNT(*) as total_posts
FROM instagram_posts;

-- 3. Vérifier les URLs récentes
SELECT
  id,
  media_type,
  cached_media_url,
  created_at
FROM instagram_posts
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- =====================================================
-- RÉSULTAT ATTENDU :
-- Si "posts_sans_cache" > 0 → Lancer la sync Instagram
-- Si "posts_avec_cache" > 0 mais images noires → Problème CORS
-- =====================================================
