/**
 * RAG Embedding Backfill Script
 *
 * Generates OpenAI ada-002 embeddings for all agent_knowledge entries
 * that don't have an embedding yet.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-xxx node scripts/backfill-embeddings.mjs
 *
 * Or set OPENAI_API_KEY in .env.local and:
 *   node --env-file=.env.local scripts/backfill-embeddings.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://duxjdlzdfjrhyojjwnig.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!OPENAI_KEY) { console.error('Missing OPENAI_API_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getEmbedding(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-ada-002', input: text.substring(0, 8000) }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err.substring(0, 200)}`);
  }
  const data = await res.json();
  return data.data?.[0]?.embedding || null;
}

async function getStats() {
  const [{ count: total }, { count: withEmb }, { count: withoutEmb }] = await Promise.all([
    supabase.from('agent_knowledge').select('id', { count: 'exact', head: true }),
    supabase.from('agent_knowledge').select('id', { count: 'exact', head: true }).not('embedding', 'is', null),
    supabase.from('agent_knowledge').select('id', { count: 'exact', head: true }).is('embedding', null),
  ]);
  return { total, withEmb, withoutEmb };
}

async function backfillBatch(batchSize = 50) {
  const { data: entries, error } = await supabase
    .from('agent_knowledge')
    .select('id, content')
    .is('embedding', null)
    .order('confidence', { ascending: false })
    .limit(batchSize);

  if (error) throw new Error(error.message);
  if (!entries || entries.length === 0) return 0;

  let processed = 0;
  // Process 10 at a time to respect rate limits
  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        const embedding = await getEmbedding(entry.content);
        if (embedding) {
          await supabase.from('agent_knowledge')
            .update({ embedding, updated_at: new Date().toISOString() })
            .eq('id', entry.id);
          return true;
        }
        return false;
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) processed++;
    }
    // Small delay between sub-batches
    if (i + 10 < entries.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return processed;
}

// Main
async function main() {
  console.log('=== RAG Embedding Backfill ===\n');

  const stats = await getStats();
  console.log(`Total learnings: ${stats.total}`);
  console.log(`With embedding:  ${stats.withEmb}`);
  console.log(`WITHOUT embedding: ${stats.withoutEmb}`);
  console.log(`Progress: ${stats.total ? Math.round((stats.withEmb / stats.total) * 100) : 0}%\n`);

  if (stats.withoutEmb === 0) {
    console.log('All entries already have embeddings! Nothing to do.');
    return;
  }

  const BATCH_SIZE = 100;
  let totalProcessed = 0;
  let round = 0;

  while (true) {
    round++;
    console.log(`Round ${round}: processing batch of ${BATCH_SIZE}...`);
    const processed = await backfillBatch(BATCH_SIZE);
    totalProcessed += processed;
    console.log(`  -> ${processed} embeddings generated (total: ${totalProcessed})`);

    if (processed === 0) break;

    // Status update every 5 rounds
    if (round % 5 === 0) {
      const s = await getStats();
      console.log(`  Status: ${s.withEmb}/${s.total} (${Math.round((s.withEmb / s.total) * 100)}%) — ${s.withoutEmb} remaining`);
    }

    // Small delay between rounds
    await new Promise(r => setTimeout(r, 1000));
  }

  const finalStats = await getStats();
  console.log(`\n=== DONE ===`);
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Final: ${finalStats.withEmb}/${finalStats.total} (${Math.round((finalStats.withEmb / finalStats.total) * 100)}%)`);
  console.log(`Remaining without embedding: ${finalStats.withoutEmb}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
