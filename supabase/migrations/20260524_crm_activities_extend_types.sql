-- Extend crm_activities.type allowlist to cover all activity kinds emitted
-- by the social and email pipelines. The previous constraint silently
-- rejected dm_followed / comment_replied / dm_after_follow_queued inserts
-- so the CRM lost visibility into engagement touches. Applied 2026-05-24
-- via Supabase Management API; this file documents the change.

ALTER TABLE crm_activities DROP CONSTRAINT IF EXISTS crm_activities_type_check;
ALTER TABLE crm_activities ADD CONSTRAINT crm_activities_type_check
  CHECK (type = ANY (ARRAY[
    'appel', 'appel_manque', 'message', 'email',
    'rdv', 'dm_instagram', 'dm_tiktok', 'dm_linkedin',
    'dm_followed', 'dm_blocked', 'dm_follow_queued',
    'dm_after_follow_queued', 'dm_response_received',
    'visite', 'relance', 'note', 'autre',
    'unsubscribe', 'comment_replied', 'email_reply',
    'follow_back_confirmed'
  ]));
