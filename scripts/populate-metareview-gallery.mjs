#!/usr/bin/env node
/**
 * Populate the metareview and mrzirraro galleries with the validated
 * Léna images so the Meta App Review reviewer sees a populated library
 * the moment they log in.
 *
 * Inserts into:
 *   - saved_images (the gallery the reviewer browses at /library)
 *   - content_calendar (shows up in the agent content workspace as
 *     "published" posts, with caption + hook + visual_url so the
 *     planning view is full)
 *
 * Idempotent: skips images already present (matched by image_url).
 *
 * Run from /opt/keiro on the VPS.
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

for (const envPath of ['.env.local', '.env.production', '.env']) {
  try {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]+?)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(SB_URL, SB_KEY);

// Curated list of validated images — the ones we generated end-to-end
// via scripts/validate-lena-news-visuals.mjs. Sage versions (5/10) and
// the 8/10 amplified batch are included. The 9/10 batch was rejected
// by the founder ("trop fort") and is excluded — cleanupRejected()
// removes any leftover row from previous runs.
const REJECTED_IMAGE_URLS = [
  'https://duxjdlzdfjrhyojjwnig.supabase.co/storage/v1/object/public/business-assets/validation/lena-news/1778686111451-catchy_authority_resto.jpeg',
  'https://duxjdlzdfjrhyojjwnig.supabase.co/storage/v1/object/public/business-assets/validation/lena-news/1778686111451-urgency_florist_valentine.jpeg',
  'https://duxjdlzdfjrhyojjwnig.supabase.co/storage/v1/object/public/business-assets/validation/lena-news/1778686111451-cold_snap_restaurant.jpeg',
  'https://duxjdlzdfjrhyojjwnig.supabase.co/storage/v1/object/public/business-assets/validation/lena-news/1778686111451-valentines_florist.jpeg',
  'https://duxjdlzdfjrhyojjwnig.supabase.co/storage/v1/object/public/business-assets/validation/lena-news/1778686111451-back_to_school_barber.jpeg',
];

const IMAGES = [
  // 8/10 amplified batch (validated by founder — kept)
  {
    image_url: 'https://duxjdlzdfjrhyojjwnig.supabase.co/storage/v1/object/public/business-assets/validation/lena-news/1778685259445-catchy_authority_resto.jpeg',
    title: 'STOP. 47% des restaurateurs ignorent ce changement',
    hook: 'STOP. 47% des restaurateurs ignorent ce changement d\'algo d\'Instagram en mars 2026',
    pillar: 'trends',
    platform: 'instagram',
    format: 'post',
    amplification: ['catchy', 'authority'],
    caption: 'STOP. 47% des restaurateurs ignorent ce changement d\'algo Instagram.\n\nFini les photos plates. Les compositions cinéma cartonnent.\n\nKeiroAI te génère ce niveau de qualité en 30 sec.',
    hashtags: ['#keiroai', '#instagramalgo2026', '#restaurantparis', '#marketingdigital'],
  },
  // Sage 5/10 reference batch (the original 3 — classique mais bien)
  {
    image_url: 'https://duxjdlzdfjrhyojjwnig.supabase.co/storage/v1/object/public/business-assets/validation/lena-news/1778671324920-cold_snap_restaurant.jpeg',
    title: 'Vague de froid → soupe maison + fenêtre embuée',
    hook: 'Vague de froid cette semaine ? C\'est le moment parfait.',
    pillar: 'trends',
    platform: 'instagram',
    format: 'post',
    caption: 'Vague de froid cette semaine ? C\'est le moment parfait pour notre velouté de saison.\n\nFenêtre embuée par le givre. Vapeur qui monte du bol. L\'hiver est dehors, le réconfort est ici.',
    hashtags: ['#keiroai', '#bistronomieparis', '#cuisinedemarche', '#hiver2026', '#restaurantparis'],
  },
  {
    image_url: 'https://duxjdlzdfjrhyojjwnig.supabase.co/storage/v1/object/public/business-assets/validation/lena-news/1778671324920-valentines_florist.jpeg',
    title: 'Saint-Valentin : roses rouges + atelier intime',
    hook: 'Saint-Valentin dans 2 semaines. Les roses commandées sur Amazon arrivent en plastique.',
    pillar: 'trends',
    platform: 'instagram',
    format: 'post',
    caption: 'Saint-Valentin dans 2 semaines.\n\nLes roses commandées en ligne arrivent en plastique.\n\nLes nôtres ? Arrangées à la main, choisies du jour, en atelier.\n\nRéserve avant qu\'il n\'y ait plus de créneaux.',
    hashtags: ['#keiroai', '#fleuristelyon', '#saintvalentin', '#bouquetatelier', '#artisanfleuriste'],
  },
  {
    image_url: 'https://duxjdlzdfjrhyojjwnig.supabase.co/storage/v1/object/public/business-assets/validation/lena-news/1778671324920-back_to_school_barber.jpeg',
    title: 'Rentrée scolaire = coupe fraîche obligatoire',
    hook: 'Rentrée scolaire dans 7 jours. Les coupes qui font la différence.',
    pillar: 'trends',
    platform: 'instagram',
    format: 'post',
    caption: 'Rentrée scolaire dans 7 jours.\n\nUne bonne coupe = première impression réussie.\n\nFade précis, ligne nette, ton enfant gagne en confiance dès le lundi matin.\n\nRéserve avant le rush du week-end.',
    hashtags: ['#keiroai', '#barbiermarseille', '#rentreescolaire2026', '#fadehaircut', '#coiffureenfant'],
  },
];

async function findUserByEmail(email) {
  // auth.users is not directly queryable via the JS client without
  // admin API; use the listUsers method.
  const { data, error } = await sb.auth.admin.listUsers();
  if (error) {
    console.error('listUsers error:', error.message);
    return null;
  }
  return data?.users?.find(u => u.email === email) || null;
}

async function cleanupRejected(userId, email) {
  if (REJECTED_IMAGE_URLS.length === 0) return;
  const { count: c1 } = await sb.from('saved_images').delete({ count: 'exact' }).eq('user_id', userId).in('image_url', REJECTED_IMAGE_URLS);
  const { count: c2 } = await sb.from('content_calendar').delete({ count: 'exact' }).eq('user_id', userId).in('visual_url', REJECTED_IMAGE_URLS);
  if ((c1 || 0) + (c2 || 0) > 0) {
    console.log(`  ✗ cleanup ${email}: removed ${c1 || 0} saved_images + ${c2 || 0} content_calendar rows (rejected 9/10 batch)`);
  }
}

async function populateForUser(userId, email, isShowcase) {
  console.log(`\n━━━ ${email} (${userId.substring(0, 8)}…) ${isShowcase ? '[showcase — real publish via scheduled_posts]' : '[mirror — content_calendar only]'} ━━━`);

  await cleanupRejected(userId, email);

  // saved_images — both /library gallery surface AND the FK target for
  // scheduled_posts on the showcase account.
  const savedIdByUrl = {};
  let savedInserted = 0;
  let savedReused = 0;
  for (const img of IMAGES) {
    const { data: existing } = await sb
      .from('saved_images')
      .select('id')
      .eq('user_id', userId)
      .eq('image_url', img.image_url)
      .maybeSingle();
    if (existing) {
      savedIdByUrl[img.image_url] = existing.id;
      savedReused++;
      continue;
    }

    const { data: inserted, error } = await sb
      .from('saved_images')
      .insert({ user_id: userId, image_url: img.image_url, title: img.title })
      .select('id')
      .single();
    if (error || !inserted) {
      console.log(`  ✗ saved_images error for "${img.title.substring(0, 40)}": ${error?.message}`);
      continue;
    }
    savedIdByUrl[img.image_url] = inserted.id;
    savedInserted++;
  }
  console.log(`  saved_images: +${savedInserted} new · ${savedReused} reused`);

  // Pre-compute the 6 future slots (1 post per day, rotating hours).
  const slots = ['10:00', '13:30', '18:00'];
  const schedule = IMAGES.map((img, i) => {
    const daysAhead = i + 1;
    const [hh, mm] = slots[i % slots.length].split(':').map(Number);
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + daysAhead);
    scheduledAt.setHours(hh, mm, 0, 0);
    return { img, scheduledAt };
  });

  // content_calendar — workspace visibility on BOTH accounts. Status
  // 'approved' = ready to publish (the closest match in the current
  // constraint after 'scheduled' was dropped in 20260320 migration).
  // showcase-mirror.ts flips this to 'published' on the metareview side
  // when the showcase publish completes.
  let calRows = 0;
  for (const { img, scheduledAt } of schedule) {
    const amplificationTag = img.amplification ? ` [amplification: ${img.amplification.join('+')}]` : '';
    const payload = {
      user_id: userId,
      platform: img.platform,
      format: img.format,
      pillar: img.pillar,
      hook: img.hook,
      caption: img.caption,
      hashtags: img.hashtags,
      visual_url: img.image_url,
      visual_description: `Generated by Léna (validation suite). ${img.title}${amplificationTag}`,
      status: 'approved',
      scheduled_date: scheduledAt.toISOString().split('T')[0],
      published_at: null,
    };
    const { data: existing } = await sb
      .from('content_calendar')
      .select('id')
      .eq('user_id', userId)
      .eq('visual_url', img.image_url)
      .maybeSingle();
    const op = existing
      ? sb.from('content_calendar').update(payload).eq('id', existing.id)
      : sb.from('content_calendar').insert(payload);
    const { error } = await op;
    if (error) {
      console.log(`  ✗ content_calendar error for "${img.title.substring(0, 40)}": ${error.message}`);
    } else {
      calRows++;
    }
  }
  console.log(`  content_calendar: ${calRows} rows (status=approved, future scheduled_date)`);

  // scheduled_posts — the actual cron-driven queue. ONLY the showcase
  // account gets these rows: the cron will POST to /api/library/
  // instagram/publish at the scheduled time, which uses @keiro_ai's
  // tokens for a real IG publish. The metareview side mirrors via
  // showcase-mirror.ts (no double publish to the same @keiro_ai IG).
  if (!isShowcase) {
    console.log(`  scheduled_posts: skipped (mirror account — avoids double publish)`);
    return;
  }

  let queued = 0;
  for (const { img, scheduledAt } of schedule) {
    const savedImageId = savedIdByUrl[img.image_url];
    if (!savedImageId) {
      console.log(`  ✗ scheduled_posts: no saved_image_id for "${img.title.substring(0, 40)}"`);
      continue;
    }
    // Idempotent: clear any previous scheduled_posts row for this
    // image so the re-run produces a fresh future timestamp.
    await sb
      .from('scheduled_posts')
      .delete()
      .eq('user_id', userId)
      .eq('saved_image_id', savedImageId)
      .eq('status', 'scheduled');

    const captionWithTags = `${img.caption}\n\n${(img.hashtags || []).join(' ')}`;
    const { error } = await sb.from('scheduled_posts').insert({
      user_id: userId,
      saved_image_id: savedImageId,
      platform: img.platform,
      scheduled_for: scheduledAt.toISOString(),
      caption: captionWithTags,
      hashtags: img.hashtags || [],
      status: 'scheduled',
    });
    if (error) {
      console.log(`  ✗ scheduled_posts error for "${img.title.substring(0, 40)}": ${error.message}`);
    } else {
      queued++;
    }
  }
  console.log(`  scheduled_posts: ${queued} rows queued for real IG publish (cron picks them up)`);
}

async function main() {
  console.log('Looking up users…');
  const mrzirraro = await findUserByEmail('mrzirraro@gmail.com');
  const metareview = await findUserByEmail('mrzirraro+metareview@gmail.com');

  if (!mrzirraro) {
    console.error('Could not find mrzirraro@gmail.com');
    process.exit(1);
  }
  if (!metareview) {
    console.error('Could not find mrzirraro+metareview@gmail.com');
    process.exit(1);
  }

  console.log(`mrzirraro:  ${mrzirraro.id}`);
  console.log(`metareview: ${metareview.id}`);

  await populateForUser(mrzirraro.id, 'mrzirraro@gmail.com', true);
  await populateForUser(metareview.id, 'mrzirraro+metareview@gmail.com', false);

  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
