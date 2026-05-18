-- Scheduling safeguards: per-user publish auto-pause + per-row approval audit.
--
-- These columns power the rate-limit / auto-pause layer that protects our
-- Meta + TikTok app permissions from being revoked due to excessive errors.
-- See lib/meta/publish-rate-limit.ts and lib/meta/scheduling-state.ts.

-- ─── profiles: per-user auto-pause state ────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS scheduling_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduling_paused_reason TEXT;

-- Quick lookup in the scheduler worker.
CREATE INDEX IF NOT EXISTS idx_profiles_scheduling_paused
  ON profiles(scheduling_paused_at)
  WHERE scheduling_paused_at IS NOT NULL;

-- ─── content_calendar: who approved this row + when ────────
-- Adds an audit trail for every row that the scheduler is allowed to
-- publish. The scheduler must refuse to publish a row that has no
-- approved_by — protecting us from ever writing to Graph/TikTok APIs
-- on behalf of content the owner hasn't explicitly approved.
ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_content_calendar_scheduled
  ON content_calendar(status, scheduled_date, scheduled_time)
  WHERE status = 'approved';
