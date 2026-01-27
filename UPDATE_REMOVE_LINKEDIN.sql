-- =====================================================
-- MISE À JOUR: Retirer LinkedIn des plateformes
-- =====================================================
-- LinkedIn est trop corporate/B2B pour cette app
-- Focus sur: Instagram, TikTok, Facebook, Twitter

-- Update platform constraint (retirer linkedin)
ALTER TABLE scheduled_posts DROP CONSTRAINT IF EXISTS check_platform;
ALTER TABLE scheduled_posts ADD CONSTRAINT check_platform
  CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'twitter'));

-- =====================================================
-- ✅ TERMINÉ !
-- =====================================================
