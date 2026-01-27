-- Migration: Add TikTok OAuth columns to profiles table
-- Date: 2026-01-27
-- Description: Adds TikTok authentication and user data fields

-- Add columns for TikTok integration
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tiktok_user_id TEXT,
ADD COLUMN IF NOT EXISTS tiktok_username TEXT,
ADD COLUMN IF NOT EXISTS tiktok_display_name TEXT,
ADD COLUMN IF NOT EXISTS tiktok_avatar_url TEXT,
ADD COLUMN IF NOT EXISTS tiktok_access_token TEXT,
ADD COLUMN IF NOT EXISTS tiktok_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS tiktok_token_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tiktok_refresh_token_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tiktok_connected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tiktok_last_sync_at TIMESTAMPTZ;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_tiktok_user_id
  ON profiles(tiktok_user_id)
  WHERE tiktok_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_tiktok_token_expiry
  ON profiles(tiktok_token_expiry)
  WHERE tiktok_token_expiry IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN profiles.tiktok_user_id IS 'TikTok user ID from OAuth (open_id)';
COMMENT ON COLUMN profiles.tiktok_username IS 'TikTok username (@handle)';
COMMENT ON COLUMN profiles.tiktok_access_token IS 'TikTok access token (encrypted at app level, expires in 24h)';
COMMENT ON COLUMN profiles.tiktok_refresh_token IS 'TikTok refresh token (encrypted at app level, valid for 365 days)';
COMMENT ON COLUMN profiles.tiktok_token_expiry IS 'When the access token expires';
COMMENT ON COLUMN profiles.tiktok_refresh_token_expiry IS 'When the refresh token expires';
