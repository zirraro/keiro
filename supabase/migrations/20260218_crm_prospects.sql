-- CRM Prospects table for admin lead tracking
CREATE TABLE IF NOT EXISTS crm_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Contact info
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  -- Sales pipeline
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'interested', 'demo', 'negotiation', 'converted', 'lost')),
  source TEXT CHECK (source IN ('site', 'linkedin', 'referral', 'event', 'cold', 'import', 'other')),
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  -- Auto-match with Keiro users
  matched_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  matched_plan TEXT,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_crm_prospects_email ON crm_prospects(email);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_status ON crm_prospects(status);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_created_at ON crm_prospects(created_at DESC);

-- RLS policies (admin only)
ALTER TABLE crm_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on crm_prospects"
  ON crm_prospects
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
