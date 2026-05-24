-- Extend the comment-reply UNIQUE INDEX to cover all social agents
-- (Instagram + TikTok). LinkedIn doesn't expose comments via API so
-- there is no agent surface to dedup for it. Founder ask 2026-05-24:
-- "evidemment tou tles demandes pour insta s'appliques egalement a
-- tiktok et linkedin pour agent publication et agent dm et comments
-- et follow".

DROP INDEX IF EXISTS uniq_ig_comment_reply;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_social_comment_reply
  ON agent_logs (agent, (data->>'comment_id'))
  WHERE agent IN ('instagram_comments','dm_instagram','tiktok_comments','dm_tiktok')
    AND data->>'comment_id' IS NOT NULL
    AND action IN ('reply_sent','reply_comment','auto_reply');
