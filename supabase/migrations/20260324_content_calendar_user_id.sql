-- Fix: content_calendar needs user_id for multi-tenant
-- Without this, all users see all posts (admin posts shown to clients)

-- Add user_id column
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add linkedin_user_id to track which LinkedIn account published
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS linkedin_user_id TEXT;

-- Index for user filtering
CREATE INDEX IF NOT EXISTS idx_content_calendar_user_id ON content_calendar(user_id);

-- Update existing posts to admin user (retroactive fix)
-- This assigns all existing posts to the admin user
UPDATE content_calendar SET user_id = (
  SELECT id FROM profiles WHERE is_admin = true LIMIT 1
) WHERE user_id IS NULL;

-- Add RLS policy for regular users to see only their own posts
CREATE POLICY "Users see own content_calendar" ON content_calendar
  FOR SELECT USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Users insert own content_calendar" ON content_calendar
  FOR INSERT WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Users update own content_calendar" ON content_calendar
  FOR UPDATE USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
