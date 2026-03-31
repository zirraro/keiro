#!/usr/bin/env node
/**
 * Bulk insert agent_knowledge entries from SQL batch files into Supabase
 * via the REST API (PostgREST). Reads each SQL file, parses the INSERT VALUES,
 * and sends them in batches of 50.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = 'https://duxjdlzdfjrhyojjwnig.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1eGpkbHpkZmpyaHlvamp3bmlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTgwMjE3OSwiZXhwIjoyMDcxMzc4MTc5fQ.2_X00ian0i5_pehe2uHnzalQ8vkxxoOUCxqeEdeByYw';

const BATCH_SIZE = 50;

function parseSqlFile(filePath) {
  const sql = readFileSync(filePath, 'utf-8');
  const entries = [];

  // Match each VALUES row: ('content', 'summary', 'agent'|NULL, 'category', confidence, 'source', 'created_by')
  const regex = /\('([^']*(?:''[^']*)*)'\s*,\s*'([^']*(?:''[^']*)*)'\s*,\s*(?:'([^']*)'|NULL)\s*,\s*'([^']*)'\s*,\s*([\d.]+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\)/g;

  let match;
  while ((match = regex.exec(sql)) !== null) {
    entries.push({
      content: match[1].replace(/''/g, "'"),
      summary: match[2].replace(/''/g, "'"),
      agent: match[3] || null,
      category: match[4],
      confidence: parseFloat(match[5]),
      source: match[6],
      created_by: match[7],
    });
  }

  return entries;
}

async function insertBatch(entries) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_knowledge`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=ignore-duplicates',
    },
    body: JSON.stringify(entries),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Insert failed (${res.status}): ${err}`);
  }

  return entries.length;
}

async function main() {
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(migrationsDir)
    .filter(f => f.startsWith('20260325_massive_boost_batch') && f.endsWith('.sql'))
    .sort();

  // Only process batch 15+ (batches 2-14 already executed)
  const newFiles = files.filter(f => {
    const num = f.match(/batch(\d+)/);
    if (!num) return true; // elite files
    return parseInt(num[1]) >= 15;
  });

  console.log(`Found ${newFiles.length} batch files to process`);

  let totalInserted = 0;

  for (const file of newFiles) {
    const filePath = join(migrationsDir, file);
    const entries = parseSqlFile(filePath);

    if (entries.length === 0) {
      console.log(`  ${file}: 0 entries (skip)`);
      continue;
    }

    // Insert in batches
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      try {
        const count = await insertBatch(batch);
        totalInserted += count;
      } catch (err) {
        console.error(`  ERROR in ${file} batch ${i}: ${err.message}`);
      }
    }

    console.log(`  ${file}: ${entries.length} entries inserted`);
  }

  console.log(`\nDone! Total inserted: ${totalInserted}`);

  // Count total in DB
  const countRes = await fetch(`${SUPABASE_URL}/rest/v1/agent_knowledge?select=id&limit=1`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'count=exact',
    },
  });
  const totalCount = countRes.headers.get('content-range');
  console.log(`Total entries in agent_knowledge: ${totalCount}`);
}

main().catch(console.error);
