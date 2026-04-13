-- Migration: fix agent_logs CHECK constraints
-- Description: the existing check constraints exclude several agents and
--              status values that multiple routes try to insert, causing
--              silent log losses:
--                - agent: 'ops', 'amit', 'whatsapp', 'diagnostic', 'dm_tiktok'
--                  were rejected (ops agent had 0 logs in prod as a result)
--                - status: 'ok' was rejected but many routes use it
--                  (amit, client-chat, google-reviews, brevo webhook,
--                  instagram webhook, auto-fix, hugo-engine, learning, …)
-- Created: 2026-04-13
-- Effect: widen both CHECK constraints to match what the code actually writes.
--         No data migration needed — we only relax the constraints, existing
--         rows still match.

ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check;
ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_agent_check CHECK (
  agent IN (
    'ceo', 'chatbot', 'email', 'commercial', 'gmaps', 'dm_instagram',
    'dm_tiktok', 'tiktok_comments', 'seo', 'onboarding', 'retention',
    'content', 'marketing', 'ads', 'rh', 'comptable', 'ops', 'amit',
    'whatsapp', 'diagnostic', 'support', 'all'
  )
);

ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_status_check;
ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_status_check CHECK (
  status IN (
    'ok', 'success', 'error', 'failed', 'pending', 'active',
    'inactive', 'confirmed', 'superseded', 'warning'
  )
);
