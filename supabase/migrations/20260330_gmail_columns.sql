-- Gmail OAuth columns for sending emails from client's own email
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmail_access_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmail_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmail_token_expires_at TIMESTAMPTZ;

-- SMTP fallback for custom domains
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_host TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_port INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_user TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_pass TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_from_email TEXT;

-- Outlook OAuth (future)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS outlook_refresh_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS outlook_email TEXT;
