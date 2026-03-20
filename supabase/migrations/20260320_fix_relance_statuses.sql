-- Fix: Add relance_1, relance_2, relance_3 to crm_prospects status constraint
-- These statuses were missing, causing silent failures when email agent tried to update prospect status

ALTER TABLE crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_status_check;
ALTER TABLE crm_prospects ADD CONSTRAINT crm_prospects_status_check
  CHECK (status IN ('identifie', 'contacte', 'relance_1', 'relance_2', 'relance_3', 'repondu', 'demo', 'sprint', 'client', 'perdu'));

-- Backfill: Update existing prospects based on their email_sequence_step
-- step 2 = relance_1, step 3 = relance_2, step 4/5 = relance_3
-- Only update if currently stuck at 'contacte' (don't override repondu/demo/client)
UPDATE crm_prospects
SET status = 'relance_1'
WHERE email_sequence_step = 2
  AND status = 'contacte';

UPDATE crm_prospects
SET status = 'relance_2'
WHERE email_sequence_step = 3
  AND status = 'contacte';

UPDATE crm_prospects
SET status = 'relance_3'
WHERE email_sequence_step >= 4
  AND status = 'contacte';
