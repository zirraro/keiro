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

const migrations = [
  {
    name: 'Fix relance statuses',
    sql: `
      ALTER TABLE crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_status_check;
      ALTER TABLE crm_prospects ADD CONSTRAINT crm_prospects_status_check
        CHECK (status IN ('identifie', 'contacte', 'relance_1', 'relance_2', 'relance_3', 'repondu', 'demo', 'sprint', 'client', 'perdu'));
      UPDATE crm_prospects SET status = 'relance_1' WHERE email_sequence_step = 2 AND status = 'contacte';
      UPDATE crm_prospects SET status = 'relance_2' WHERE email_sequence_step = 3 AND status = 'contacte';
      UPDATE crm_prospects SET status = 'relance_3' WHERE email_sequence_step >= 4 AND status = 'contacte';
    `,
  },
  {
    name: 'Content publish error tracking',
    sql: `
      ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS publish_error TEXT;
      ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS publish_diagnostic JSONB;
      ALTER TABLE content_calendar DROP CONSTRAINT IF EXISTS content_calendar_status_check;
      ALTER TABLE content_calendar ADD CONSTRAINT content_calendar_status_check
        CHECK (status IN ('draft', 'approved', 'published', 'skipped', 'publish_failed', 'video_generating'));
    `,
  },
  {
    name: 'Performance indexes for agents',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_agent_logs_action_agent ON agent_logs(action, agent, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_logs_learning ON agent_logs(action, created_at DESC) WHERE action = 'learning';
      CREATE INDEX IF NOT EXISTS idx_agent_logs_feedback ON agent_logs(action, agent, created_at DESC) WHERE action = 'agent_feedback';
      CREATE INDEX IF NOT EXISTS idx_crm_activities_type_created ON crm_activities(type, created_at DESC);
    `,
  },
];

async function run() {
  await client.connect();
  console.log('Connected to Supabase Postgres\n');

  for (const m of migrations) {
    try {
      console.log(`Running: ${m.name}...`);
      await client.query(m.sql);
      console.log(`  ✅ ${m.name} — OK\n`);
    } catch (err) {
      console.error(`  ❌ ${m.name} — ${err.message}\n`);
    }
  }

  await client.end();
  console.log('Done.');
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
