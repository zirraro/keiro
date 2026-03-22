-- Business Dossiers: everything agents need to know about the client
CREATE TABLE IF NOT EXISTS business_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  -- Core identity
  company_name TEXT,
  company_description TEXT,
  business_type TEXT,
  target_audience TEXT,
  brand_tone TEXT,
  main_products TEXT,
  -- Strategy
  competitors TEXT,
  unique_selling_points TEXT,
  business_goals TEXT,
  -- Social presence
  instagram_handle TEXT,
  tiktok_handle TEXT,
  linkedin_url TEXT,
  website_url TEXT,
  google_maps_url TEXT,
  -- Brand assets (Supabase Storage refs)
  logo_url TEXT,
  brand_guidelines_url TEXT,
  uploaded_files JSONB DEFAULT '[]',
  -- AI-generated
  ai_summary TEXT,
  completeness_score INT DEFAULT 0,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Client agent conversations
CREATE TABLE IF NOT EXISTS client_agent_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  agent_id TEXT NOT NULL,
  messages JSONB DEFAULT '[]',
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, agent_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dossier_user ON business_dossiers(user_id);
CREATE INDEX IF NOT EXISTS idx_dossier_org ON business_dossiers(org_id);
CREATE INDEX IF NOT EXISTS idx_client_chats_user ON client_agent_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_client_chats_agent ON client_agent_chats(agent_id);

-- RLS
ALTER TABLE business_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_agent_chats ENABLE ROW LEVEL SECURITY;

-- Users can CRUD their own dossier
DROP POLICY IF EXISTS "Users manage own dossier" ON business_dossiers;
CREATE POLICY "Users manage own dossier" ON business_dossiers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role full access dossier" ON business_dossiers;
CREATE POLICY "Service role full access dossier" ON business_dossiers
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users manage own chats" ON client_agent_chats;
CREATE POLICY "Users manage own chats" ON client_agent_chats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access chats" ON client_agent_chats;
CREATE POLICY "Service role full access chats" ON client_agent_chats
  FOR ALL USING (true) WITH CHECK (true);

-- Migrate existing profile data to dossiers
INSERT INTO business_dossiers (user_id, company_name, company_description, business_type, target_audience, brand_tone, main_products)
SELECT id, company_name, company_description, business_type, target_audience, brand_tone, main_products
FROM profiles
WHERE company_name IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
