/**
 * Upload locally generated 3D avatars to Supabase Storage
 * and update agent_avatars records with avatar_3d_url.
 *
 * Run: node scripts/upload-avatars-3d.mjs
 *
 * Prerequisites:
 * - Avatars generated in public/avatars-3d/ (via generate-avatars-3d.mjs)
 * - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load env from .env.local manually
function loadEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}
loadEnvFile('.env.local');
loadEnvFile('.env');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const AVATARS_DIR = path.join(process.cwd(), 'public', 'avatars-3d');
const BUCKET = 'public-assets';
const STORAGE_PREFIX = 'agent-avatars';

const AGENTS = ['ceo', 'commercial', 'email', 'content', 'seo', 'onboarding', 'retention', 'marketing', 'ads', 'rh'];

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);
  if (!exists) {
    console.log(`Creating bucket "${BUCKET}"...`);
    await supabase.storage.createBucket(BUCKET, { public: true });
  }
}

async function uploadAvatar(agentId) {
  const filePath = path.join(AVATARS_DIR, `${agentId}.png`);

  if (!fs.existsSync(filePath)) {
    console.log(`[${agentId}] SKIP — file not found: ${filePath}`);
    return null;
  }

  const buffer = fs.readFileSync(filePath);
  const storagePath = `${STORAGE_PREFIX}/${agentId}-3d.png`;

  console.log(`[${agentId}] Uploading ${(buffer.length / 1024).toFixed(0)}KB → ${storagePath}...`);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (error) {
    console.error(`[${agentId}] Upload error:`, error.message);
    return null;
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;
  console.log(`[${agentId}] URL: ${publicUrl}`);

  // Update agent_avatars table
  const { error: dbError } = await supabase
    .from('agent_avatars')
    .update({ avatar_3d_url: publicUrl })
    .eq('id', agentId);

  if (dbError) {
    console.error(`[${agentId}] DB update error:`, dbError.message);
    // Try upsert if row doesn't exist
    const { error: upsertError } = await supabase
      .from('agent_avatars')
      .upsert({
        id: agentId,
        avatar_3d_url: publicUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (upsertError) {
      console.error(`[${agentId}] Upsert error:`, upsertError.message);
      return null;
    }
  }

  console.log(`[${agentId}] ✓ Uploaded & linked`);
  return publicUrl;
}

async function main() {
  console.log('=== Upload 3D Avatars to Supabase ===\n');

  await ensureBucket();

  const results = [];

  for (const agentId of AGENTS) {
    try {
      const url = await uploadAvatar(agentId);
      results.push({ id: agentId, success: !!url, url });
    } catch (err) {
      console.error(`[${agentId}] Error:`, err.message);
      results.push({ id: agentId, success: false, url: null });
    }
  }

  console.log('\n=== RESULTS ===');
  const ok = results.filter(r => r.success).length;
  for (const r of results) {
    console.log(`${r.success ? '✓' : '✗'} ${r.id}${r.url ? ` → ${r.url}` : ''}`);
  }
  console.log(`\n${ok}/${results.length} avatars uploaded.`);
}

main().catch(console.error);
