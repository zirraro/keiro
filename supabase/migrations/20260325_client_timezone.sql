-- Add timezone + country to profiles for cron adaptation
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Paris';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'FR';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city TEXT;
