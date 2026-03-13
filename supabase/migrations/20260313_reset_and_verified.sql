-- ============================================================
-- ALL missing columns + FULL RESET
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- 1. Add ALL missing columns to crm_prospects
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS verified_by text;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_send_failures integer DEFAULT 0;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_provider text;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_cycle integer DEFAULT 1;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS personalization jsonb;

-- 2. RESET all agent stats (fresh start)
DELETE FROM agent_logs;
DELETE FROM agent_orders;

-- 3. Reset all prospect email sequences
UPDATE crm_prospects SET
  email_sequence_status = NULL,
  email_sequence_step = 0,
  last_email_sent_at = NULL,
  email_send_failures = 0,
  verified = false,
  verified_at = NULL,
  verified_by = NULL,
  updated_at = now();

-- 4. Reset chatbot sessions
DELETE FROM chatbot_sessions;

-- 5. Reset blog post views
UPDATE blog_posts SET views = 0 WHERE views > 0;
