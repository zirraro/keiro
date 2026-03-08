-- KeiroAI: Google Maps Scraper + DM Instagram + TikTok Comments agents
-- Also: Execute Now button support (no schema change needed, just agent expansion)

-- ============================================================
-- 1. Expand CHECK constraints for new agents
-- ============================================================

-- agent_logs: add new agent types
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check;
ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_agent_check
  CHECK (agent IN ('ceo', 'chatbot', 'email', 'commercial', 'gmaps', 'dm_instagram', 'tiktok_comments'));

-- agent_orders: add new agent targets
ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_to_agent_check;
ALTER TABLE agent_orders ADD CONSTRAINT agent_orders_to_agent_check
  CHECK (to_agent IN ('chatbot', 'email', 'gmaps', 'dm_instagram', 'tiktok_comments', 'commercial'));

-- ============================================================
-- 2. New columns on crm_prospects for Google Maps + DM + TikTok
-- ============================================================

-- Google Maps data
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS google_place_id TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS google_rating NUMERIC(2,1);
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS google_reviews INTEGER;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS address TEXT;

-- Instagram DM tracking
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS dm_status TEXT DEFAULT 'none';
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS dm_queued_at TIMESTAMPTZ;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS dm_sent_at TIMESTAMPTZ;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS dm_followup_date DATE;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS dm_followup_count INTEGER DEFAULT 0;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS dm_message TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS dm_followup_message TEXT;

-- TikTok
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS tiktok_handle TEXT;

-- Source tracking
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS source_agent TEXT;

-- Unique constraint on google_place_id to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_prospects_google_place_id
  ON crm_prospects(google_place_id) WHERE google_place_id IS NOT NULL;

-- Index for DM queue queries
CREATE INDEX IF NOT EXISTS idx_crm_prospects_dm_status ON crm_prospects(dm_status);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_dm_followup ON crm_prospects(dm_followup_date)
  WHERE dm_status = 'sent' AND dm_followup_date IS NOT NULL;

-- ============================================================
-- 3. DM Queue table — prepared DMs for founder to send
-- ============================================================
CREATE TABLE IF NOT EXISTS dm_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES crm_prospects(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'instagram' CHECK (channel IN ('instagram', 'tiktok')),
  handle TEXT NOT NULL,
  message TEXT NOT NULL,
  followup_message TEXT,
  personalization TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'responded', 'no_response')),
  priority INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  response_type TEXT CHECK (response_type IN ('interested', 'not_interested', 'question', NULL))
);

CREATE INDEX IF NOT EXISTS idx_dm_queue_status ON dm_queue(status, channel);
CREATE INDEX IF NOT EXISTS idx_dm_queue_created ON dm_queue(created_at DESC);

-- RLS
ALTER TABLE dm_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on dm_queue"
  ON dm_queue FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Service role full access on dm_queue"
  ON dm_queue FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
