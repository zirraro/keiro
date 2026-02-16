-- Add LinkedIn OAuth token columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_access_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_token_expiry TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_connected_at TIMESTAMPTZ;
