-- Migration: add IG verification tracking to dm_queue
-- Description: the DM pipeline had no "does this Instagram profile actually
--              exist and accept DMs" check, so Leo's commercial scrape shoved
--              unverified handles into the queue and 1000+ DMs piled up in
--              status='pending' forever. We also discovered that the send-queue
--              cron route tried to write `error: 'xxx'` into a non-existent
--              column — the update silently failed and the DM stayed pending.
--
-- New columns:
--   error_message: text  — mirror of what the code already tries to write
--   verified_at: timestamptz — when we last ran business_discovery for this handle
--   verified_exists: boolean — true if handle resolves to an IG business/creator
--     account (i.e. discoverable via Graph API). NULL before verification.
--   verification_attempts: int — dedup counter, avoid hammering the API
-- Created: 2026-04-14

ALTER TABLE dm_queue
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS verified_exists BOOLEAN,
  ADD COLUMN IF NOT EXISTS verification_attempts INTEGER NOT NULL DEFAULT 0;

-- Index so the verification cron cheaply picks the next pending DMs to verify
CREATE INDEX IF NOT EXISTS idx_dm_queue_pending_unverified
  ON dm_queue (created_at)
  WHERE status = 'pending' AND verified_at IS NULL;
