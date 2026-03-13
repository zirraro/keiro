-- 1. Add verified flag to crm_prospects
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS verified_by text;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_send_failures integer DEFAULT 0;

-- 2. RESET all agent stats (run this to start fresh)
DELETE FROM agent_logs;
DELETE FROM agent_orders;

-- 3. Reset all prospect email sequences to start fresh
UPDATE crm_prospects SET
  email_sequence_status = NULL,
  email_sequence_step = 0,
  last_email_sent_at = NULL,
  email_send_failures = 0,
  updated_at = now()
WHERE email_sequence_status IS NOT NULL
   OR email_sequence_step > 0
   OR email_send_failures > 0;

-- 4. Reset chatbot sessions
DELETE FROM chatbot_sessions;

-- 5. Reset blog post views
UPDATE blog_posts SET views = 0 WHERE views > 0;
