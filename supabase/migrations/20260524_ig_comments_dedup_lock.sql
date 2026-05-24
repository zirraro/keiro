-- Two fixes for Jade's comment auto-reply path that the founder caught
-- on 2026-05-24 (Jade re-replied to a comment already replied).
--
-- 1) The agent_logs.agent CHECK constraint did NOT include
--    'instagram_comments', so EVERY dedup INSERT was silently failing
--    and the dedup table was empty. Widened the allowlist.
--
-- 2) Even with the constraint fixed, two concurrent runs could both
--    pass the read-side dedup and both reply. Added a UNIQUE INDEX
--    keyed on (agent, data->>'comment_id') so the INSERT itself is
--    the atomic lock — no race possible.

ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check;
ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_agent_check
  CHECK (agent = ANY (ARRAY[
    'ceo','chatbot','email','commercial','gmaps',
    'dm_instagram','dm_tiktok','tiktok_comments','instagram_comments',
    'seo','onboarding','retention','content','marketing',
    'ads','rh','comptable','ops','amit','whatsapp',
    'diagnostic','support','all',
    'jade','leo','hugo','lena','noah','theo','clara'
  ]));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ig_comment_reply
  ON agent_logs (agent, (data->>'comment_id'))
  WHERE agent IN ('instagram_comments','dm_instagram')
    AND data->>'comment_id' IS NOT NULL
    AND action IN ('reply_sent','reply_comment','auto_reply');
