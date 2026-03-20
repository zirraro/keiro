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

await client.connect();
console.log('=== VERIFICATION DES VIEWS ===\n');

// 1. pipeline_funnel
const funnel = await client.query('SELECT * FROM pipeline_funnel');
console.log('📊 pipeline_funnel:');
for (const r of funnel.rows) {
  console.log(`  ${r.status}: ${r.count} (${r.pct}%) | hot:${r.hot} warm:${r.warm} cold:${r.cold} | avg_score:${Math.round(r.avg_score)}`);
}

// 2. agent_performance
const perf = await client.query('SELECT * FROM agent_performance');
console.log('\n🤖 agent_performance:');
for (const r of perf.rows) {
  console.log(`  ${r.agent}: ${r.total_runs} runs, ${r.success_rate}% success, 24h: ${r.runs_24h} runs / ${r.errors_24h} errors`);
}

// 3. learning_stats (may be empty if no learnings yet)
const learn = await client.query('SELECT COUNT(*) as cnt FROM learning_stats');
console.log(`\n🧠 learning_stats: ${learn.rows[0].cnt} learnings`);

// 4. feedback_network
const fb = await client.query('SELECT COUNT(*) as cnt FROM feedback_network');
console.log(`💬 feedback_network: ${fb.rows[0].cnt} feedbacks`);

// 5. compute_learning_reliability function
const fnTest = await client.query(`SELECT compute_learning_reliability('{"confidence": 60, "confirmations": 3, "contradictions": 1, "revenue_linked": true}'::jsonb) as score`);
console.log(`\n🔬 compute_learning_reliability test: score = ${fnTest.rows[0].score} (expected ~80)`);

// 6. Index count
const idx = await client.query(`SELECT COUNT(*) as cnt FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%'`);
console.log(`\n📑 Custom indexes: ${idx.rows[0].cnt}`);

// 7. Type distribution after cleanup
const types = await client.query('SELECT type, COUNT(*) as cnt FROM crm_prospects GROUP BY type ORDER BY cnt DESC');
console.log('\n📋 Types normalisés:');
for (const r of types.rows) {
  console.log(`  ${r.type}: ${r.cnt}`);
}

await client.end();
console.log('\n✅ Toutes les views et fonctions opérationnelles');
