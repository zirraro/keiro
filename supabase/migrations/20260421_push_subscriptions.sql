-- Web Push subscriptions (one row per browser/device a user opts in from).
-- Populated by /api/push/subscribe when the service worker registers a
-- PushSubscription. The morning Jade follow-reminder cron reads it to
-- know where to send the push.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- Same browser re-subscribing should update the existing row rather than
-- create a duplicate. Endpoint is the natural unique key per subscription.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_unique
  ON push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_owner_read" ON push_subscriptions;
CREATE POLICY "push_subscriptions_owner_read" ON push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions_owner_delete" ON push_subscriptions;
CREATE POLICY "push_subscriptions_owner_delete" ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
