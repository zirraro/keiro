-- Migration: Add retry tracking to content_calendar
-- Description: Allow Lena's execute_publication flow to automatically retry transient
--              IG/TikTok API failures (timeouts, 5xx, rate limits) instead of
--              marking posts as permanently failed after a single attempt.
--              Non-transient errors (token invalid, account disconnected, duplicate)
--              still fail immediately.
-- Created: 2026-04-13

ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE;

-- Index so the next cron run cheaply picks up posts waiting for retry
CREATE INDEX IF NOT EXISTS idx_content_calendar_retry_ready
  ON content_calendar (next_retry_at)
  WHERE status = 'retry_pending';
