-- Script de vérification des RLS policies pour tiktok_posts
-- Exécute ce script dans Supabase SQL Editor

-- 1. Vérifier si RLS est activé
SELECT
  schemaname,
  tablename,
  rowsecurity AS "RLS Enabled"
FROM pg_tables
WHERE tablename = 'tiktok_posts';

-- 2. Lister toutes les policies existantes
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'tiktok_posts';

-- 3. Compter les vidéos dans la table
SELECT COUNT(*) as total_videos, user_id
FROM tiktok_posts
GROUP BY user_id;

-- 4. Tester la policy SELECT (simule une requête client)
-- IMPORTANT : Remplace 'USER_ID_ICI' par ton user_id : 9bbcc8f2-e19a-4568-8b6c-cefc67e6b766
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "9bbcc8f2-e19a-4568-8b6c-cefc67e6b766"}';

SELECT COUNT(*) as videos_visible_avec_rls
FROM tiktok_posts
WHERE user_id = '9bbcc8f2-e19a-4568-8b6c-cefc67e6b766';

-- 5. Réinitialiser le role
RESET role;
