-- Daily snapshot of a client's public social-platform counters
-- (followers, following, media). One row per (user_id, platform, day)
-- so Noah's brief can diff today vs yesterday and show "+12 followers
-- aujourd'hui" instead of an opaque running total.
--
-- Populated by /api/agents/content/sync-social-metrics (scheduled daily
-- in the ceo_daily slot, before the evening brief).

CREATE TABLE IF NOT EXISTS social_metrics (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform       text NOT NULL CHECK (platform IN ('instagram','tiktok','linkedin','facebook')),
  followers_count integer,
  following_count integer,
  media_count     integer,
  recorded_on    date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  raw            jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS social_metrics_unique_day
  ON social_metrics (user_id, platform, recorded_on);

CREATE INDEX IF NOT EXISTS social_metrics_user_platform_idx
  ON social_metrics (user_id, platform, recorded_on DESC);

ALTER TABLE social_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_metrics_owner_read" ON social_metrics;
CREATE POLICY "social_metrics_owner_read" ON social_metrics
  FOR SELECT USING (auth.uid() = user_id);

-- Service role writes (the cron endpoint runs with SERVICE_ROLE_KEY so
-- RLS is bypassed). No insert policy needed for clients — writes are
-- admin-only.
