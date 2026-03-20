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

async function cleanup() {
  console.log('=== NETTOYAGE CRM ===\n');

  // 1. Normalize business types (lowercase + merge duplicates)
  const TYPE_MAP = {
    'Restaurant': 'restaurant',
    'Café': 'restaurant',
    'Brunch': 'restaurant',
    'Fast-casual': 'restaurant',
    'Pâtisserie': 'restaurant',
    'Boulangerie': 'restaurant',
    'Food truck': 'restaurant',
    'Boutique mode': 'boutique',
    'Boutique déco': 'boutique',
    'Boutique spécialisée': 'boutique',
    'Boutique bio': 'boutique',
    'Traiteur': 'traiteur',
    'Coach sportif': 'coach',
    'Coach bien-être': 'coach',
    'Consultant': 'freelance',
    'Artisan': 'services',
    'artisanat': 'services',
  };

  let typeFixed = 0;
  for (const [oldType, newType] of Object.entries(TYPE_MAP)) {
    const { data, error } = await sb.from('crm_prospects')
      .update({ type: newType, updated_at: new Date().toISOString() })
      .eq('type', oldType)
      .select('id');

    if (data && data.length > 0) {
      console.log(`  Type "${oldType}" → "${newType}": ${data.length} prospects`);
      typeFixed += data.length;
    }
  }
  console.log(`\n✅ ${typeFixed} types normalisés\n`);

  // 2. Backfill relance statuses based on email_sequence_step
  // (This is what the SQL migration does, but we can do it via API too)
  const { data: step2 } = await sb.from('crm_prospects')
    .update({ status: 'relance_1', updated_at: new Date().toISOString() })
    .eq('email_sequence_step', 2)
    .eq('status', 'contacte')
    .select('id');
  console.log(`  Contacté step 2 → relance_1: ${(step2 || []).length} prospects`);

  const { data: step3 } = await sb.from('crm_prospects')
    .update({ status: 'relance_2', updated_at: new Date().toISOString() })
    .eq('email_sequence_step', 3)
    .eq('status', 'contacte')
    .select('id');
  console.log(`  Contacté step 3 → relance_2: ${(step3 || []).length} prospects`);

  const { data: step4plus } = await sb.from('crm_prospects')
    .update({ status: 'relance_3', updated_at: new Date().toISOString() })
    .gte('email_sequence_step', 4)
    .eq('status', 'contacte')
    .select('id');
  console.log(`  Contacté step 4+ → relance_3: ${(step4plus || []).length} prospects`);

  console.log(`\n✅ Relance backfill terminé\n`);

  // 3. Set score for prospects with score=0 or null (based on available data)
  const { data: noScoreProspects } = await sb.from('crm_prospects')
    .select('id, email, instagram, phone, website, google_rating, google_reviews')
    .or('score.is.null,score.eq.0')
    .limit(200);

  let scoreFixed = 0;
  for (const p of noScoreProspects || []) {
    let score = 10; // base
    if (p.email) score += 10;
    if (p.instagram && p.instagram !== 'A_VERIFIER') score += 10;
    if (p.phone) score += 5;
    if (p.website) score += 5;
    if (p.google_rating && p.google_rating >= 4.0) score += 5;
    if (p.google_reviews && p.google_reviews >= 50) score += 5;

    await sb.from('crm_prospects').update({ score, updated_at: new Date().toISOString() }).eq('id', p.id);
    scoreFixed++;
  }
  console.log(`✅ ${scoreFixed} prospects avec score recalculé\n`);

  // 4. Fix temperature for prospects with null temperature
  const { data: noTempProspects } = await sb.from('crm_prospects')
    .select('id, score')
    .is('temperature', null)
    .limit(500);

  let tempFixed = 0;
  for (const p of noTempProspects || []) {
    const s = p.score || 10;
    const temp = s >= 50 ? 'hot' : s >= 25 ? 'warm' : 'cold';
    await sb.from('crm_prospects').update({ temperature: temp }).eq('id', p.id);
    tempFixed++;
  }
  console.log(`✅ ${tempFixed} prospects avec température recalculée\n`);

  // 5. Audit DM queue
  const { count: oldPendingDMs } = await sb.from('dm_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - 14 * 86400000).toISOString());

  console.log(`📋 DM queue: ${oldPendingDMs || 0} DMs pending de plus de 14 jours (à archiver manuellement si voulu)\n`);

  // Final stats
  const { data: finalTypes } = await sb.from('crm_prospects').select('type').limit(5000);
  const typeCounts = {};
  for (const p of finalTypes || []) {
    typeCounts[p.type || 'null'] = (typeCounts[p.type || 'null'] || 0) + 1;
  }
  console.log('=== TYPES APRÈS NETTOYAGE ===');
  console.log(JSON.stringify(typeCounts, null, 2));

  const { data: finalStatuses } = await sb.from('crm_prospects').select('status').limit(5000);
  const statusCounts = {};
  for (const p of finalStatuses || []) {
    statusCounts[p.status || 'null'] = (statusCounts[p.status || 'null'] || 0) + 1;
  }
  console.log('\n=== STATUTS APRÈS NETTOYAGE ===');
  console.log(JSON.stringify(statusCounts, null, 2));
}

cleanup().catch(e => console.error('ERROR:', e.message));
