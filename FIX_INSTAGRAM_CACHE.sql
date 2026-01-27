-- =====================================================
-- RÉPARATION : Cache Instagram manquant
-- =====================================================
-- Copie cette requête dans Supabase SQL Editor pour réparer

-- 1. Identifier les posts sans cache
SELECT
  id,
  substring(id from 1 for 12) as post_id_preview,
  media_type,
  CASE
    WHEN cached_media_url IS NOT NULL THEN '✅ Cache OK'
    WHEN cached_media_url IS NULL AND media_url IS NOT NULL THEN '⚠️ Cache manquant (URL Instagram disponible)'
    ELSE '❌ Aucune URL disponible'
  END as status,
  posted_at
FROM instagram_posts
ORDER BY posted_at DESC
LIMIT 20;

-- 2. Compter les posts à réparer
SELECT
  COUNT(*) FILTER (WHERE cached_media_url IS NULL AND media_url IS NOT NULL) as posts_a_reparer,
  COUNT(*) FILTER (WHERE cached_media_url IS NOT NULL) as posts_ok,
  COUNT(*) as total_posts
FROM instagram_posts;

-- 3. Vérifier les URLs Instagram expirées (si elles existent encore)
-- Note: Cette requête ne peut pas tester la validité HTTP des URLs
-- Tu dois lancer la sync API pour télécharger et cacher les images
SELECT
  id,
  substring(media_url from 1 for 80) as media_url_preview,
  CASE
    WHEN media_url LIKE '%fbcdn.net%' THEN '⚠️ URL Facebook CDN (expire rapidement)'
    WHEN media_url LIKE '%cdninstagram.com%' THEN '⚠️ URL Instagram CDN (expire)'
    ELSE '❓ URL inconnue'
  END as url_type,
  posted_at
FROM instagram_posts
WHERE cached_media_url IS NULL
  AND media_url IS NOT NULL
ORDER BY posted_at DESC
LIMIT 10;

-- =====================================================
-- ACTION REQUISE : Lancer la synchronisation Instagram
-- =====================================================
-- Si tu as des posts sans cache (cached_media_url = NULL),
-- tu dois lancer la synchronisation via l'API :
--
-- Méthode 1 - Via le frontend :
--   1. Va sur /library
--   2. Clique sur le bouton "Sync Instagram" dans InstagramWidget
--
-- Méthode 2 - Via curl (ou Postman) :
--   curl -X POST https://ton-app.vercel.app/api/instagram/sync-media \
--     -H "Authorization: Bearer TON_TOKEN" \
--     -H "Content-Type: application/json"
--
-- Méthode 3 - Via la console navigateur (sur /library) :
--   fetch('/api/instagram/sync-media', { method: 'POST' })
--     .then(r => r.json())
--     .then(console.log)
--
-- =====================================================

-- 4. (OPTIONNEL) Nettoyer les anciennes URLs Instagram si cache existe
-- Cette requête supprime les anciennes URLs Instagram (media_url, thumbnail_url)
-- et garde uniquement cached_media_url (URLs Supabase Storage stables)
-- ⚠️  NE LANCE CETTE REQUÊTE QUE SI TU ES SÛR QUE TOUS LES POSTS ONT UN CACHE !

-- UPDATE instagram_posts
-- SET
--   media_url = NULL,
--   thumbnail_url = NULL
-- WHERE cached_media_url IS NOT NULL;

-- 5. Vérification finale après sync
SELECT
  COUNT(*) FILTER (WHERE cached_media_url IS NOT NULL) as posts_avec_cache,
  COUNT(*) FILTER (WHERE cached_media_url IS NULL) as posts_sans_cache,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE cached_media_url IS NOT NULL) / COUNT(*),
    1
  ) as pourcentage_cache,
  COUNT(*) as total_posts
FROM instagram_posts;

-- =====================================================
-- RÉSULTAT ATTENDU APRÈS SYNC :
-- ✅ posts_avec_cache = 100% (ou presque)
-- ✅ posts_sans_cache = 0
-- ✅ Images Instagram s'affichent correctement dans InstagramWidget
-- =====================================================
