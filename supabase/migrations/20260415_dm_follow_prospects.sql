-- Migration: auto-follow prospects tracking
-- Description: Jade's new auto-follow campaign lets the DM agent follow
-- qualified prospect accounts daily (warm-up strategy before sending DMs).
-- Meta rate-limits aggressive follows, so we cap at ~20-30/day and track
-- which prospects have already been followed to avoid hammering the API.
-- Created: 2026-04-15

ALTER TABLE crm_prospects
  ADD COLUMN IF NOT EXISTS dm_followed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS dm_follow_attempts INTEGER NOT NULL DEFAULT 0;

-- Partial index so the follow cron cheaply picks the next batch of
-- prospects to follow (already verified reachable, not already followed,
-- and not already dead/blocked).
CREATE INDEX IF NOT EXISTS idx_crm_prospects_follow_ready
  ON crm_prospects (score DESC NULLS LAST)
  WHERE instagram IS NOT NULL
    AND dm_followed_at IS NULL
    AND dm_status NOT IN ('blocked', 'invalid_handle');
