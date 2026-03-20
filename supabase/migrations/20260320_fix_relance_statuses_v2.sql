-- Fix v2: Complete status constraint + smart backfill using crm_activities
-- The old constraint silently blocked BOTH status AND email_sequence_step updates,
-- so email_sequence_step may still be 0/1 for prospects who received step 2+ emails.

-- 1) Drop and recreate constraint with ALL possible statuses
ALTER TABLE crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_status_check;
ALTER TABLE crm_prospects ADD CONSTRAINT crm_prospects_status_check
  CHECK (status IN (
    'identifie', 'contacte',
    'relance_1', 'relance_2', 'relance_3',
    'repondu', 'demo', 'sprint', 'client', 'perdu',
    'contacte_warm', 'relance_finale'
  ));

-- 2) Smart backfill: use crm_activities (email step) to fix both email_sequence_step AND status
-- For prospects stuck at contacte but who received step 2+ emails
UPDATE crm_prospects p
SET
  email_sequence_step = sub.max_step,
  status = CASE
    WHEN sub.max_step = 2 THEN 'relance_1'
    WHEN sub.max_step = 3 THEN 'relance_2'
    WHEN sub.max_step >= 4 THEN 'relance_3'
    ELSE p.status
  END
FROM (
  SELECT
    a.prospect_id,
    MAX((a.data->>'step')::int) as max_step
  FROM crm_activities a
  WHERE a.type = 'email'
    AND a.data->>'step' IS NOT NULL
    AND (a.data->>'step')::int >= 2
  GROUP BY a.prospect_id
) sub
WHERE p.id = sub.prospect_id
  AND p.status IN ('contacte', 'identifie')
  AND p.status NOT IN ('repondu', 'demo', 'sprint', 'client');

-- 3) Also fix prospects where email_sequence_step is correct but status is wrong
UPDATE crm_prospects
SET status = 'relance_1'
WHERE email_sequence_step = 2 AND status = 'contacte';

UPDATE crm_prospects
SET status = 'relance_2'
WHERE email_sequence_step = 3 AND status = 'contacte';

UPDATE crm_prospects
SET status = 'relance_3'
WHERE email_sequence_step >= 4 AND email_sequence_step < 10 AND status = 'contacte';
