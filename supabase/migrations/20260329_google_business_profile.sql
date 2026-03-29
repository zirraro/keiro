-- Google Business Profile fields for review management
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_business_access_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_business_refresh_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_business_token_expiry TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_business_account_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_business_location_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_business_location_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_business_connected_at TIMESTAMPTZ;
