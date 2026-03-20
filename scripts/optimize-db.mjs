import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: 'aws-1-eu-west-3.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.duxjdlzdfjrhyojjwnig',
  password: 't$Zf8yMnva#QCbb',
  ssl: { rejectUnauthorized: false },
});

const optimizations = [
  // ── DATA RELIABILITY: add reliability score to learnings ──
  {
    name: 'Add reliability tracking columns to agent_logs',
    sql: `
      COMMENT ON TABLE agent_logs IS 'Central intelligence pool: learnings, feedbacks, reports, diagnostics. Each row = one agent observation.';
    `,
  },

  // ── CLASSIFICATION: normalized type enum for prospects ──
  {
    name: 'Add type constraint for prospect classification',
    sql: `
      ALTER TABLE crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_type_check;
      ALTER TABLE crm_prospects ADD CONSTRAINT crm_prospects_type_check
        CHECK (type IN ('restaurant', 'boutique', 'coiffeur', 'coach', 'fleuriste', 'caviste', 'traiteur', 'freelance', 'services', 'professionnel', 'agence', 'pme', 'autre'));
    `,
  },

  // ── INDEXES for long-term data retrieval ──
  {
    name: 'Index: agent_logs by action for fast learning queries',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_agent_logs_action ON agent_logs(action);
      CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_created ON agent_logs(agent, created_at DESC);
    `,
  },
  {
    name: 'Index: CRM prospects for pipeline analysis',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_crm_prospects_status ON crm_prospects(status);
      CREATE INDEX IF NOT EXISTS idx_crm_prospects_temperature ON crm_prospects(temperature);
      CREATE INDEX IF NOT EXISTS idx_crm_prospects_type ON crm_prospects(type);
      CREATE INDEX IF NOT EXISTS idx_crm_prospects_score ON crm_prospects(score DESC);
      CREATE INDEX IF NOT EXISTS idx_crm_prospects_source ON crm_prospects(source);
      CREATE INDEX IF NOT EXISTS idx_crm_prospects_email ON crm_prospects(email) WHERE email IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_crm_prospects_created ON crm_prospects(created_at DESC);
    `,
  },
  {
    name: 'Index: CRM activities for timeline queries',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_crm_activities_prospect ON crm_activities(prospect_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON crm_activities(type);
    `,
  },
  {
    name: 'Index: content_calendar for publication tracking',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_content_calendar_status ON content_calendar(status);
      CREATE INDEX IF NOT EXISTS idx_content_calendar_platform ON content_calendar(platform);
      CREATE INDEX IF NOT EXISTS idx_content_calendar_date ON content_calendar(scheduled_date DESC);
    `,
  },
  {
    name: 'Index: DM queue for pending DMs',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_dm_queue_status ON dm_queue(status);
      CREATE INDEX IF NOT EXISTS idx_dm_queue_prospect ON dm_queue(prospect_id);
      CREATE INDEX IF NOT EXISTS idx_dm_queue_created ON dm_queue(created_at DESC);
    `,
  },

  // ── DATA RELIABILITY: materialized view for learning stats ──
  {
    name: 'Create view: learning_stats for AMIT analysis',
    sql: `
      CREATE OR REPLACE VIEW learning_stats AS
      SELECT
        agent,
        (data->>'category') as category,
        (data->>'tier') as tier,
        (data->>'confidence')::int as confidence,
        (data->>'confirmations')::int as confirmations,
        (data->>'contradictions')::int as contradictions,
        (data->>'revenue_linked')::boolean as revenue_linked,
        (data->>'expires_at') as expires_at,
        (data->>'last_confirmed_at') as last_confirmed_at,
        data->>'learning' as learning,
        data->>'evidence' as evidence,
        created_at,
        -- RELIABILITY SCORE: composite measure of data quality
        GREATEST(0, LEAST(100,
          COALESCE((data->>'confidence')::int, 0)
          + COALESCE((data->>'confirmations')::int, 0) * 5
          - COALESCE((data->>'contradictions')::int, 0) * 15
          + CASE WHEN (data->>'revenue_linked')::boolean = true THEN 20 ELSE 0 END
          + CASE WHEN (data->>'last_confirmed_at') IS NOT NULL
              AND (data->>'last_confirmed_at')::timestamp > NOW() - INTERVAL '7 days'
              THEN 10 ELSE 0 END
        )) as reliability_score
      FROM agent_logs
      WHERE action = 'learning';
    `,
  },

  // ── DATA RELIABILITY: view for agent performance tracking ──
  {
    name: 'Create view: agent_performance for Ops monitoring',
    sql: `
      CREATE OR REPLACE VIEW agent_performance AS
      SELECT
        agent,
        COUNT(*) as total_runs,
        COUNT(*) FILTER (WHERE status IN ('ok', 'success')) as successes,
        COUNT(*) FILTER (WHERE status IN ('error', 'failed')) as failures,
        ROUND(
          COUNT(*) FILTER (WHERE status IN ('ok', 'success'))::numeric / NULLIF(COUNT(*), 0) * 100, 1
        ) as success_rate,
        MAX(created_at) as last_run,
        MAX(created_at) FILTER (WHERE status IN ('ok', 'success')) as last_success,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as runs_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND status IN ('error', 'failed')) as errors_24h
      FROM agent_logs
      WHERE action NOT IN ('learning', 'agent_feedback')
      GROUP BY agent
      ORDER BY last_run DESC;
    `,
  },

  // ── DATA RELIABILITY: view for feedback network analysis ──
  {
    name: 'Create view: feedback_network for cross-agent communication',
    sql: `
      CREATE OR REPLACE VIEW feedback_network AS
      SELECT
        data->>'from_agent' as from_agent,
        agent as to_agent,
        data->>'category' as category,
        data->>'feedback' as feedback,
        created_at
      FROM agent_logs
      WHERE action = 'agent_feedback'
      ORDER BY created_at DESC;
    `,
  },

  // ── PIPELINE ANALYTICS: funnel conversion view ──
  {
    name: 'Create view: pipeline_funnel for CRM analytics',
    sql: `
      CREATE OR REPLACE VIEW pipeline_funnel AS
      SELECT
        status,
        COUNT(*) as count,
        ROUND(COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM crm_prospects), 0) * 100, 1) as pct,
        AVG(score) as avg_score,
        COUNT(*) FILTER (WHERE temperature = 'hot') as hot,
        COUNT(*) FILTER (WHERE temperature = 'warm') as warm,
        COUNT(*) FILTER (WHERE temperature = 'cold') as cold
      FROM crm_prospects
      GROUP BY status
      ORDER BY
        CASE status
          WHEN 'identifie' THEN 1
          WHEN 'contacte' THEN 2
          WHEN 'relance_1' THEN 3
          WHEN 'relance_2' THEN 4
          WHEN 'relance_3' THEN 5
          WHEN 'repondu' THEN 6
          WHEN 'demo' THEN 7
          WHEN 'sprint' THEN 8
          WHEN 'client' THEN 9
          WHEN 'perdu' THEN 10
        END;
    `,
  },

  // ── DATA QUALITY: function to compute reliability score ──
  {
    name: 'Create function: compute_learning_reliability',
    sql: `
      CREATE OR REPLACE FUNCTION compute_learning_reliability(learning_data JSONB)
      RETURNS INT AS $$
      DECLARE
        score INT := 0;
        conf INT;
        confirmations INT;
        contradictions INT;
        revenue BOOLEAN;
        last_confirmed TIMESTAMP;
      BEGIN
        conf := COALESCE((learning_data->>'confidence')::int, 0);
        confirmations := COALESCE((learning_data->>'confirmations')::int, 0);
        contradictions := COALESCE((learning_data->>'contradictions')::int, 0);
        revenue := COALESCE((learning_data->>'revenue_linked')::boolean, false);
        last_confirmed := (learning_data->>'last_confirmed_at')::timestamp;

        -- Base: confidence score
        score := conf;

        -- Boost: confirmations (diminishing, max +25)
        score := score + LEAST(25, confirmations * 5);

        -- Penalty: contradictions (strong, -15 each)
        score := score - (contradictions * 15);

        -- Boost: revenue linked (+20)
        IF revenue THEN score := score + 20; END IF;

        -- Boost: recently confirmed (+10)
        IF last_confirmed IS NOT NULL AND last_confirmed > NOW() - INTERVAL '7 days' THEN
          score := score + 10;
        END IF;

        -- Penalty: stale (no confirmation in 30+ days, -10)
        IF last_confirmed IS NOT NULL AND last_confirmed < NOW() - INTERVAL '30 days' THEN
          score := score - 10;
        END IF;

        -- Penalty: never confirmed beyond initial (-5)
        IF confirmations <= 1 AND conf < 40 THEN
          score := score - 5;
        END IF;

        RETURN GREATEST(0, LEAST(100, score));
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `,
  },

  // ── VACUUM & ANALYZE for query optimization ──
  {
    name: 'Analyze tables for query planner optimization',
    sql: `
      ANALYZE agent_logs;
      ANALYZE crm_prospects;
      ANALYZE crm_activities;
      ANALYZE content_calendar;
      ANALYZE dm_queue;
    `,
  },
];

async function run() {
  await client.connect();
  console.log('Connected to Supabase Postgres\n');

  let ok = 0, fail = 0;
  for (const m of optimizations) {
    try {
      console.log(`Running: ${m.name}...`);
      await client.query(m.sql);
      console.log(`  ✅ OK\n`);
      ok++;
    } catch (err) {
      console.error(`  ❌ ${err.message}\n`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} succeeded, ${fail} failed.`);
  await client.end();
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
