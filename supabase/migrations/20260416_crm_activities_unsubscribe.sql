-- Allow 'unsubscribe' as a crm_activities.type so the unsubscribe endpoint
-- can log a clean audit entry when a prospect clicks the email opt-out link.

ALTER TABLE crm_activities DROP CONSTRAINT IF EXISTS crm_activities_type_check;
ALTER TABLE crm_activities ADD CONSTRAINT crm_activities_type_check
  CHECK (type = ANY (ARRAY[
    'appel'::text, 'appel_manque'::text, 'message'::text, 'email'::text,
    'rdv'::text, 'dm_instagram'::text, 'visite'::text, 'relance'::text,
    'note'::text, 'autre'::text, 'unsubscribe'::text
  ]));
