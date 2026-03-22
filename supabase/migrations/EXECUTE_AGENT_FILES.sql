-- Agent Files: per-agent file storage for client workspace
-- Run this in Supabase SQL editor

-- Table for tracking files uploaded per agent per user
CREATE TABLE IF NOT EXISTS agent_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT, -- mime type
  file_size INTEGER, -- bytes
  storage_path TEXT NOT NULL, -- path in supabase storage
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_files_user_agent ON agent_files(user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_files_created ON agent_files(created_at DESC);

-- RLS
ALTER TABLE agent_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own agent files" ON agent_files;
CREATE POLICY "Users manage own agent files" ON agent_files
  FOR ALL USING (auth.uid() = user_id);

-- Grant access
GRANT ALL ON agent_files TO authenticated;
GRANT ALL ON agent_files TO service_role;

-- Create business-assets bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-assets', 'business-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for business-assets bucket
DROP POLICY IF EXISTS "Users upload own business files" ON storage.objects;
CREATE POLICY "Users upload own business files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'business-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users read own business files" ON storage.objects;
CREATE POLICY "Users read own business files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'business-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own business files" ON storage.objects;
CREATE POLICY "Users delete own business files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'business-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Service role full access
DROP POLICY IF EXISTS "Service role full access business assets" ON storage.objects;
CREATE POLICY "Service role full access business assets" ON storage.objects
  FOR ALL USING (
    bucket_id = 'business-assets'
    AND auth.role() = 'service_role'
  );
