-- Agent supervision audits — persistent archive of every audit run by
-- the admin (or by the auto-anticipation cron) for any agent ×
-- client. Distinct from anomaly_alerts: an anomaly is a passive
-- detection, an audit is an active drill that captures a snapshot of
-- state, findings, recommended fixes, and the resolution path.

CREATE TABLE IF NOT EXISTS agent_audits (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent           TEXT        NOT NULL,
  user_id         UUID        NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope           TEXT        NOT NULL DEFAULT 'client', -- 'client' | 'global'
  triggered_by    UUID        NULL,                       -- admin who ran the audit (NULL = auto cron)
  trigger_kind    TEXT        NOT NULL DEFAULT 'manual',  -- 'manual' | 'scheduled' | 'anomaly_followup'
  severity        TEXT        NOT NULL DEFAULT 'green',   -- 'green' | 'amber' | 'red'
  findings        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB       NOT NULL DEFAULT '[]'::jsonb,
  metrics         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT        NOT NULL DEFAULT 'open',    -- 'open' | 'mutualised' | 'resolved' | 'auto_resolved' | 'archived'
  resolution_kind TEXT        NULL,                       -- 'mutualised_knowledge' | 'manual_fix' | 'auto_fix' | 'no_action_needed'
  resolution_note TEXT        NULL,
  resolved_by     UUID        NULL,
  resolved_at     TIMESTAMPTZ NULL,
  knowledge_id    UUID        NULL,                       -- FK to agent_knowledge row when mutualised
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_audits_agent_user_created
  ON agent_audits (agent, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_audits_status
  ON agent_audits (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_audits_severity_open
  ON agent_audits (severity, status)
  WHERE status = 'open';

-- Admin-only access. RLS keeps client users out of supervision data.
ALTER TABLE agent_audits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'agent_audits' AND policyname = 'admin_select_agent_audits'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY admin_select_agent_audits ON agent_audits
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND (profiles.is_admin = true OR profiles.subscription_plan = 'admin')
        )
      )
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'agent_audits' AND policyname = 'admin_write_agent_audits'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY admin_write_agent_audits ON agent_audits
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND (profiles.is_admin = true OR profiles.subscription_plan = 'admin')
        )
      )
    $sql$;
  END IF;
END $$;
