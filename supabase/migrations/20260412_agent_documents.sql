-- Agent Documents table — stores file metadata for client's agent workspace
-- Files are stored in Supabase Storage bucket "business-assets"
-- This table tracks metadata: name, folder, agent, type, URL

CREATE TABLE IF NOT EXISTS agent_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL DEFAULT 'general',
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'document', -- document, excel, image, pdf, other
  folder TEXT DEFAULT '',
  file_url TEXT,
  file_size INTEGER DEFAULT 0,
  mime_type TEXT,
  source TEXT DEFAULT 'upload', -- upload, agent_chat, agent_auto, content_calendar
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_documents_user ON agent_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_documents_agent ON agent_documents(user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_documents_folder ON agent_documents(user_id, folder);

-- RLS (Row Level Security)
ALTER TABLE agent_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own documents"
  ON agent_documents
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
