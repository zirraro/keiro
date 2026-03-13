-- Add email_send_failures counter to track failed send attempts
-- Prevents infinite retry loop on permanently failing email addresses
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_send_failures integer DEFAULT 0;
