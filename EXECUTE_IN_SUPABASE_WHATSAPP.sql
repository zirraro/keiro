-- WhatsApp conversations table
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  prospect_id UUID REFERENCES crm_prospects(id),
  org_id UUID REFERENCES organizations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_phone ON whatsapp_conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_prospect ON whatsapp_conversations(prospect_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_created ON whatsapp_conversations(created_at DESC);

-- Add whatsapp columns to crm_prospects
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS whatsapp_opted_in BOOLEAN DEFAULT false;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS whatsapp_last_message_at TIMESTAMPTZ;

-- RLS policies (service role bypasses, but define for safety)
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on whatsapp_conversations"
  ON whatsapp_conversations
  FOR ALL
  USING (true)
  WITH CHECK (true);
