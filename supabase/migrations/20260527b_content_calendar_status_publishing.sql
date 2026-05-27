-- 2026-05-27 — Atomic publish claim
-- Extend content_calendar.status CHECK to allow 'publishing' (used by
-- the atomic claim pattern in publishToInstagram / publishToTikTok)
-- plus the existing pending_approval / retry_pending / deleted_on_ig
-- values that were already used in code but missing from the
-- constraint (silently rejected writes). Founder reported duplicate
-- posts caused by concurrent crons racing on the same row — the
-- 'publishing' state is the lock.
-- Applied via Supabase Management API; this file documents the change.

ALTER TABLE content_calendar DROP CONSTRAINT IF EXISTS content_calendar_status_check;
ALTER TABLE content_calendar ADD CONSTRAINT content_calendar_status_check
  CHECK (status = ANY (ARRAY[
    'draft', 'approved', 'published', 'skipped',
    'publish_failed', 'video_generating',
    'publishing', 'pending_approval', 'retry_pending', 'deleted_on_ig'
  ]));
