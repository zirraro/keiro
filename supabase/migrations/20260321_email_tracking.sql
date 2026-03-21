-- Enhanced email tracking: distinguish opens vs clicks with counters
-- Opens = interested, Clicks = very interested (visited KeiroAI)

ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_opens_count INTEGER DEFAULT 0;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email_clicks_count INTEGER DEFAULT 0;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS last_email_clicked_url TEXT;
