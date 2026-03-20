import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf8');
for (const line of envContent.split(/\r?\n/)) {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.startsWith('#')) {
    const key = line.substring(0, idx).trim();
    const val = line.substring(idx + 1).trim();
    if (key && val) process.env[key] = val;
  }
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function auditStorage() {
  // List all buckets
  const { data: buckets, error: bucketsErr } = await sb.storage.listBuckets();
  if (bucketsErr) { console.error('Buckets error:', bucketsErr.message); return; }

  console.log('=== STORAGE BUCKETS ===\n');

  for (const bucket of buckets || []) {
    console.log(`📦 ${bucket.name} (public: ${bucket.public})`);

    // List files in bucket (root level)
    const { data: files, error } = await sb.storage.from(bucket.name).list('', { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) {
      console.log(`  Error: ${error.message}`);
      continue;
    }

    let totalFiles = 0;
    let totalSize = 0;
    const folders = [];

    for (const file of files || []) {
      if (file.id) {
        // It's a file
        totalFiles++;
        totalSize += file.metadata?.size || 0;
      } else {
        // It's a folder
        folders.push(file.name);

        // List files in folder
        const { data: subFiles } = await sb.storage.from(bucket.name).list(file.name, { limit: 500 });
        for (const sf of subFiles || []) {
          if (sf.id) {
            totalFiles++;
            totalSize += sf.metadata?.size || 0;
          }
        }
      }
    }

    console.log(`  Files: ${totalFiles}, Size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
    if (folders.length > 0) console.log(`  Folders: ${folders.join(', ')}`);
    console.log('');
  }

  // Database tables sizes (approximate via row counts)
  console.log('=== DATABASE TABLE SIZES ===\n');

  const tables = ['crm_prospects', 'crm_activities', 'agent_logs', 'agent_orders', 'content_calendar', 'dm_queue', 'onboarding_queue', 'retention_scores', 'chatbot_sessions', 'profiles', 'saved_images', 'my_videos', 'blog_posts', 'free_generations', 'promo_codes'];

  for (const table of tables) {
    try {
      const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true });
      if (!error) {
        console.log(`  ${table}: ${count} rows`);
      }
    } catch {}
  }
}

auditStorage().catch(e => console.error('ERROR:', e.message));
