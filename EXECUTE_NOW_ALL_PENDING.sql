-- ================================================================
-- EXECUTE TOUT CECI DANS SUPABASE SQL EDITOR (dans l'ordre)
-- Dernière mise à jour: 2026-03-22
-- ================================================================

-- ============================================================
-- 1. FIX CONTRAINTE agent_logs (ajouter marketing, ads, rh, comptable)
-- ============================================================
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check;
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check1;
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check2;
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check3;
ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_agent_check
  CHECK (agent IN ('ceo', 'chatbot', 'email', 'commercial', 'gmaps', 'dm_instagram', 'tiktok_comments', 'seo', 'onboarding', 'retention', 'content', 'marketing', 'ads', 'rh', 'comptable', 'all'));

-- Fix status constraint to allow 'active' for learnings
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_status_check;
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_status_check1;
-- Recreate with all needed statuses
ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_status_check
  CHECK (status IN ('success', 'error', 'failed', 'pending', 'active', 'inactive', 'confirmed', 'superseded'));

-- ============================================================
-- 2. FIX CONTRAINTE agent_orders (ajouter ads, rh, comptable)
-- ============================================================
ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_to_agent_check;
ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_to_agent_check1;
ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_to_agent_check2;
ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_to_agent_check3;
ALTER TABLE agent_orders ADD CONSTRAINT agent_orders_to_agent_check
  CHECK (to_agent IN ('chatbot', 'email', 'gmaps', 'dm_instagram', 'tiktok_comments', 'commercial', 'seo', 'onboarding', 'retention', 'content', 'marketing', 'ads', 'rh', 'comptable', 'all'));

-- ============================================================
-- 3. AGENT COMPTABLE — Avatar Louis
-- ============================================================
INSERT INTO agent_avatars (id, display_name, title, gradient_from, gradient_to, badge_color, personality, custom_instructions, is_active)
VALUES (
  'comptable',
  'Louis',
  'Expert Comptable & Finance',
  '#0e7490',
  '#155e75',
  '#0e7490',
  jsonb_build_object(
    'tone', 'rigoureux, méthodique, proactif',
    'verbosity', 'concis',
    'emoji_usage', 'aucun',
    'humor_level', 'aucun',
    'expertise_focus', jsonb_build_array('comptabilité', 'finance', 'contrôle de gestion', 'prévisions', 'SaaS metrics'),
    'language_style', 'professionnel tutoiement',
    'signature_catchphrase', 'Les chiffres ne mentent jamais.'
  ),
  '',
  true
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. EMAIL TRACKING (opens/clicks counters)
-- ============================================================
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_opens_count INTEGER DEFAULT 0;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_clicks_count INTEGER DEFAULT 0;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS last_email_clicked_url TEXT;

UPDATE crm_prospects SET email_opens_count = 1 WHERE last_email_opened_at IS NOT NULL AND email_opens_count = 0;
UPDATE crm_prospects SET email_clicks_count = 1 WHERE last_email_clicked_at IS NOT NULL AND email_clicks_count = 0;

-- ============================================================
-- 5. WHATSAPP CONVERSATIONS
-- ============================================================
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

ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS whatsapp_opted_in BOOLEAN DEFAULT false;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS whatsapp_last_message_at TIMESTAMPTZ;

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on whatsapp_conversations" ON whatsapp_conversations;
CREATE POLICY "Service role full access on whatsapp_conversations"
  ON whatsapp_conversations FOR ALL USING (true) WITH CHECK (true);
