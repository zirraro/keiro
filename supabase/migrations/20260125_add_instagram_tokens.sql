-- Migration pour ajouter les colonnes Instagram/Meta à la table profiles
-- Date: 2026-01-25

-- Ajouter les colonnes pour stocker les informations Instagram Business
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS meta_app_user_id TEXT,
ADD COLUMN IF NOT EXISTS instagram_business_account_id TEXT,
ADD COLUMN IF NOT EXISTS instagram_username TEXT,
ADD COLUMN IF NOT EXISTS instagram_access_token TEXT, -- Sera chiffré côté app
ADD COLUMN IF NOT EXISTS instagram_token_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS facebook_page_id TEXT,
ADD COLUMN IF NOT EXISTS facebook_page_access_token TEXT, -- Sera chiffré côté app
ADD COLUMN IF NOT EXISTS instagram_connected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS instagram_last_sync_at TIMESTAMPTZ;

-- Créer un index pour rechercher rapidement par Instagram account ID
CREATE INDEX IF NOT EXISTS idx_profiles_instagram_account
ON profiles(instagram_business_account_id)
WHERE instagram_business_account_id IS NOT NULL;

-- Créer un index pour vérifier l'expiration des tokens
CREATE INDEX IF NOT EXISTS idx_profiles_instagram_token_expiry
ON profiles(instagram_token_expiry)
WHERE instagram_token_expiry IS NOT NULL;

-- Commentaires pour documentation
COMMENT ON COLUMN profiles.meta_app_user_id IS 'Meta App-scoped User ID from OAuth';
COMMENT ON COLUMN profiles.instagram_business_account_id IS 'Instagram Business Account ID (ig_user_id)';
COMMENT ON COLUMN profiles.instagram_username IS 'Instagram username for display';
COMMENT ON COLUMN profiles.instagram_access_token IS 'Instagram access token (encrypted in app)';
COMMENT ON COLUMN profiles.instagram_token_expiry IS 'When the Instagram access token expires';
COMMENT ON COLUMN profiles.facebook_page_id IS 'Facebook Page ID linked to Instagram Business Account';
COMMENT ON COLUMN profiles.facebook_page_access_token IS 'Facebook Page access token (encrypted in app)';
COMMENT ON COLUMN profiles.instagram_connected_at IS 'When the user first connected their Instagram account';
COMMENT ON COLUMN profiles.instagram_last_sync_at IS 'Last time we synced Instagram data';
