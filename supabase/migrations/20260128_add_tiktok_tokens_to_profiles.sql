-- Migration: Ajouter les colonnes TikTok au tableau profiles
-- Date: 2026-01-28

-- Ajouter les colonnes pour stocker les tokens et infos TikTok
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tiktok_user_id TEXT,
ADD COLUMN IF NOT EXISTS tiktok_username TEXT,
ADD COLUMN IF NOT EXISTS tiktok_access_token TEXT,
ADD COLUMN IF NOT EXISTS tiktok_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS tiktok_token_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tiktok_connected_at TIMESTAMPTZ;

-- Créer un index pour recherches par tiktok_user_id
CREATE INDEX IF NOT EXISTS idx_profiles_tiktok_user_id ON public.profiles(tiktok_user_id);

-- ✅ RÉSULTAT:
-- Colonnes TikTok ajoutées au tableau profiles
-- Les tokens d'accès et refresh TikTok peuvent maintenant être stockés
