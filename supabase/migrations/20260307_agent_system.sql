-- KeiroAI Multi-Agent System: tables for CEO, Chatbot, and Email agents

-- ============================================================
-- 1. agent_logs: centralized log for all agent actions
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent TEXT NOT NULL CHECK (agent IN ('ceo', 'chatbot', 'email')),
  action TEXT NOT NULL,
  target_id UUID,
  data JSONB DEFAULT '{}',
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'pending')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_logs_agent ON agent_logs(agent);
CREATE INDEX idx_agent_logs_created_at ON agent_logs(created_at DESC);
CREATE INDEX idx_agent_logs_target ON agent_logs(target_id);

-- RLS: admin + service_role
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on agent_logs"
  ON agent_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role full access on agent_logs"
  ON agent_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 2. agent_orders: CEO dispatches orders to sub-agents
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent TEXT NOT NULL DEFAULT 'ceo',
  to_agent TEXT NOT NULL CHECK (to_agent IN ('chatbot', 'email')),
  order_type TEXT NOT NULL,
  priority TEXT DEFAULT 'moyenne' CHECK (priority IN ('haute', 'moyenne', 'basse')),
  payload JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_orders_to_status ON agent_orders(to_agent, status);
CREATE INDEX idx_agent_orders_created_at ON agent_orders(created_at DESC);

-- RLS: admin + service_role
ALTER TABLE agent_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on agent_orders"
  ON agent_orders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role full access on agent_orders"
  ON agent_orders
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 3. chatbot_sessions: visitor conversations with the chatbot
-- ============================================================
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT NOT NULL,
  prospect_id UUID REFERENCES crm_prospects(id) ON DELETE SET NULL,
  messages JSONB DEFAULT '[]',
  qualification_step INTEGER DEFAULT 0,
  qualification_data JSONB DEFAULT '{}',
  email TEXT,
  whatsapp TEXT,
  plan_interest TEXT,
  source_page TEXT,
  pages_visited TEXT[] DEFAULT '{}',
  time_on_site INTEGER DEFAULT 0,
  referrer_source TEXT,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chatbot_sessions_visitor ON chatbot_sessions(visitor_id);
CREATE INDEX idx_chatbot_sessions_created ON chatbot_sessions(created_at DESC);

-- RLS: service_role only (public writes via API route)
ALTER TABLE chatbot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on chatbot_sessions"
  ON chatbot_sessions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 4. Extend crm_prospects with agent-related columns
-- ============================================================
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_sequence_step INTEGER DEFAULT 0;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_sequence_status TEXT DEFAULT 'not_started';
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS last_email_opened_at TIMESTAMPTZ;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS last_email_clicked_at TIMESTAMPTZ;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS temperature TEXT DEFAULT 'cold';
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS plan_interest TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS chatbot_session_id UUID;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS brevo_contact_id TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_subject_variant TEXT;

-- Update source constraint to include 'chatbot'
ALTER TABLE crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_source_check;
ALTER TABLE crm_prospects ADD CONSTRAINT crm_prospects_source_check
  CHECK (source IN ('dm_instagram', 'email', 'telephone', 'linkedin', 'terrain', 'facebook', 'tiktok', 'recommandation', 'import', 'chatbot', 'other'));
