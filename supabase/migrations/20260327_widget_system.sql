-- Widget System for embeddable chatbot/onboarding on client websites

CREATE TABLE IF NOT EXISTS widget_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  widget_key TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  agent_type TEXT NOT NULL DEFAULT 'chatbot', -- 'chatbot' (Max) or 'onboarding' (Clara)
  is_active BOOLEAN DEFAULT true,
  greeting_message TEXT DEFAULT 'Bonjour ! Comment puis-je vous aider ?',
  accent_color TEXT DEFAULT '#8b5cf6',
  position TEXT DEFAULT 'right', -- 'left' or 'right'
  auto_open_seconds INTEGER, -- null = no auto-open
  allowed_domains TEXT[], -- restrict to specific domains (null = all)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS widget_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]'::jsonb,
  visitor_profile JSONB DEFAULT '{}'::jsonb,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_widget_configs_user ON widget_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_widget_configs_key ON widget_configs(widget_key);
CREATE INDEX IF NOT EXISTS idx_widget_conversations_session ON widget_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_widget_conversations_org ON widget_conversations(org_id);

-- RLS
ALTER TABLE widget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on widget_configs" ON widget_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on widget_conversations" ON widget_conversations FOR ALL USING (true) WITH CHECK (true);
