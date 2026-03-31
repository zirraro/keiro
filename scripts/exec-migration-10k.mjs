/**
 * Execute the 10K migration SQL in Supabase prod
 * Splits the large INSERT into smaller batches and executes via Supabase REST API
 *
 * Usage: node --env-file=.env.local scripts/exec-migration-10k.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://duxjdlzdfjrhyojjwnig.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Read and parse the SQL file
const sqlContent = readFileSync('supabase/migrations/20260327_to_10k_final.sql', 'utf-8');

// Extract all VALUES rows - each starts with ('ELITE_10K_
const valueRegex = /\('ELITE_10K_\d+:.*?'system'\)/gs;
const matches = sqlContent.match(valueRegex);

if (!matches) {
  console.error('No VALUES found in SQL file');
  process.exit(1);
}

console.log(`Found ${matches.length} entries to insert\n`);

// Insert in batches of 50
const BATCH_SIZE = 50;
let inserted = 0;
let failed = 0;

for (let i = 0; i < matches.length; i += BATCH_SIZE) {
  const batch = matches.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(matches.length / BATCH_SIZE);

  const sql = `INSERT INTO agent_knowledge (content, summary, agent, category, confidence, source, created_by) VALUES\n${batch.join(',\n')}\nON CONFLICT DO NOTHING;`;

  try {
    const { error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) {
      // Try direct insert via REST if RPC not available
      // Parse each row and insert via supabase client
      for (const row of batch) {
        try {
          // Parse: ('content', 'summary', 'agent', 'category', confidence, 'source', 'created_by')
          const parts = row.match(/\('((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'(\w+)',\s*'(\w+)',\s*([\d.]+),\s*'([^']*)',\s*'([^']*)'\)/);
          if (parts) {
            const { error: insertErr } = await supabase.from('agent_knowledge').insert({
              content: parts[1].replace(/''/g, "'"),
              summary: parts[2].replace(/''/g, "'"),
              agent: parts[3],
              category: parts[4],
              confidence: parseFloat(parts[5]),
              source: parts[6],
              created_by: parts[7],
            });
            if (!insertErr) inserted++;
            else failed++;
          }
        } catch { failed++; }
      }
      console.log(`Batch ${batchNum}/${totalBatches}: inserted via REST (${inserted} total)`);
    } else {
      inserted += batch.length;
      console.log(`Batch ${batchNum}/${totalBatches}: ${batch.length} inserted (${inserted} total)`);
    }
  } catch (err) {
    console.error(`Batch ${batchNum} error:`, err.message);
    // Fallback: insert one by one
    for (const row of batch) {
      try {
        const parts = row.match(/\('((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'(\w+)',\s*'(\w+)',\s*([\d.]+),\s*'([^']*)',\s*'([^']*)'\)/);
        if (parts) {
          const { error: insertErr } = await supabase.from('agent_knowledge').insert({
            content: parts[1].replace(/''/g, "'"),
            summary: parts[2].replace(/''/g, "'"),
            agent: parts[3],
            category: parts[4],
            confidence: parseFloat(parts[5]),
            source: parts[6],
            created_by: parts[7],
          });
          if (!insertErr) inserted++;
          else { failed++; }
        }
      } catch { failed++; }
    }
    console.log(`Batch ${batchNum}/${totalBatches}: fallback insert (${inserted} total, ${failed} failed)`);
  }

  // Small delay between batches
  await new Promise(r => setTimeout(r, 300));
}

// Check final count
const { count } = await supabase.from('agent_knowledge').select('id', { count: 'exact', head: true });
const { count: noEmbed } = await supabase.from('agent_knowledge').select('id', { count: 'exact', head: true }).is('embedding', null);

console.log(`\n=== DONE ===`);
console.log(`Inserted: ${inserted}`);
console.log(`Failed: ${failed}`);
console.log(`Total in DB: ${count}`);
console.log(`Without embedding: ${noEmbed}`);
