-- Migration: profile columns for Instagram asset badge
-- Description: the workspace shows a persistent "Connected as @username
-- via Facebook Page {name}" badge at the top of every IG panel so Meta
-- App Review can see which asset is connected in every screencast
-- (required by Platform Policies Section 1.6). We need the Page name,
-- the IG profile picture URL and the followers count to populate it.
-- Created: 2026-04-15

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS facebook_page_name TEXT,
  ADD COLUMN IF NOT EXISTS instagram_profile_picture_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_followers_count INTEGER,
  ADD COLUMN IF NOT EXISTS instagram_media_count INTEGER;
