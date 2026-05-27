-- 2026-05-24 — CRM touch tracking
-- Add last_contacted_at + last_contact_channel to crm_prospects so we
-- can record the most recent agent touchpoint per prospect. The IG
-- comment reply path (Jade) and the email reply path (Hugo) both
-- write here to keep the CRM in sync with social interactions.
-- Applied via Supabase Management API; this file documents the change.

ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS last_contact_channel text;
