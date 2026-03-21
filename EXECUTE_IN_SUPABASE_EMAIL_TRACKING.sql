-- Run this in Supabase SQL Editor
-- Enhanced email tracking: opens vs clicks counters

ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_opens_count INTEGER DEFAULT 0;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_clicks_count INTEGER DEFAULT 0;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS last_email_clicked_url TEXT;

-- Backfill: set opens_count = 1 for prospects who already opened
UPDATE crm_prospects SET email_opens_count = 1 WHERE last_email_opened_at IS NOT NULL AND email_opens_count = 0;

-- Backfill: set clicks_count = 1 for prospects who already clicked
UPDATE crm_prospects SET email_clicks_count = 1 WHERE last_email_clicked_at IS NOT NULL AND email_clicks_count = 0;
