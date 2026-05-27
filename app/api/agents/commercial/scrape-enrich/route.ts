import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { harvestBusinessNotes } from '@/lib/agents/prospect-scraper';
import { missingEssentialKeys } from '@/lib/agents/fiche-completeness';

export const runtime = 'nodejs';
export const maxDuration = 300;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * POST /api/agents/commercial/scrape-enrich
 *
 * Cheap-enrichment pass: for prospects with website OR instagram, scrape
 * the public surface (no Gemini Research) and persist business_notes
 * JSONB. Hugo reads these notes to write super-personalised visual
 * briefs without spending an extra LLM call to "discover" the brand.
 *
 * Founder ask 2026-05-27: avoid burning Gemini when the info we need
 * is sitting on the prospect's own site / IG.
 *
 * Eligibility:
 *   - has website OR instagram
 *   - business_notes is null OR last_enriched_at older than 14 days
 *   - not in dead/perdu/client status
 *
 * Body: { user_id?: string } — scope to one client (cron passes it).
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const userId: string | null = body?.user_id || null;

  const supabase = sb();
  const since14d = new Date(Date.now() - 14 * 86400000).toISOString();

  // Find candidates: have website or instagram, no fresh notes, not dead.
  let q = supabase
    .from('crm_prospects')
    .select('id, user_id, company, type, website, instagram, notes, business_notes, last_enriched_at, status, temperature')
    .or('website.not.is.null,instagram.not.is.null')
    .not('status', 'in', '("client","perdu","sprint","lost")')
    .not('temperature', 'eq', 'dead')
    .order('score', { ascending: false, nullsFirst: false })
    .limit(60); // 60 / run keeps wall-time bounded under maxDuration

  if (userId) q = q.eq('user_id', userId);

  const { data: candidates } = await q;
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, enriched: 0, message: 'No candidates' });
  }

  // Filter in JS: keep only those that need re-enrichment
  const needsEnrich = candidates.filter((p: any) => {
    if (!p.business_notes) return true;
    if (!p.last_enriched_at) return true;
    return p.last_enriched_at < since14d;
  }).slice(0, 30); // hard cap per run

  let enriched = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const p of needsEnrich) {
    try {
      const notes = await harvestBusinessNotes(supabase, {
        website: p.website,
        instagram: p.instagram,
      });
      if (!notes) { skipped++; continue; }

      // Build a human-readable summary that gets appended to the
      // freeform notes column too — so anyone reading the CRM fiche
      // sees what we learned without parsing JSON.
      const summaryLines: string[] = [];
      if (notes.website_description) summaryLines.push(`📄 ${notes.website_description}`);
      if (notes.insta_bio) summaryLines.push(`📷 ${notes.insta_bio}`);
      if (notes.ambiance.length) summaryLines.push(`Ambiance : ${notes.ambiance.join(', ')}`);
      if (notes.audience) summaryLines.push(`Audience : ${notes.audience}`);
      if (notes.follower_count) summaryLines.push(`${notes.follower_count} followers IG`);

      const newNotesText = (p.notes ? p.notes + '\n\n' : '') + `[Scraping ${now.slice(0, 10)}]\n${summaryLines.join('\n')}`;

      await supabase.from('crm_prospects').update({
        business_notes: notes,
        notes: newNotesText.slice(0, 4000),
        last_enriched_at: now,
        updated_at: now,
      }).eq('id', p.id);

      // Also surface the missing-essentials list so the next Gemini
      // pass (if any) targets only what's truly needed.
      const stillMissing = missingEssentialKeys(p);
      if (stillMissing.length > 0) {
        try {
          await supabase.from('crm_activities').insert({
            prospect_id: p.id,
            type: 'note',
            description: `Léo: ${notes.source} scrapé · ${stillMissing.length} essentiel${stillMissing.length > 1 ? 's' : ''} encore manquant${stillMissing.length > 1 ? 's' : ''}`,
            data: { source: 'scrape_enrich', missing: stillMissing, notes_source: notes.source },
            created_at: now,
          });
        } catch { /* non-fatal */ }
      }

      enriched++;
    } catch {
      skipped++;
    }
  }

  try {
    await supabase.from('agent_logs').insert({
      agent: 'commercial',
      action: 'scrape_enrich',
      status: 'success',
      user_id: userId || undefined,
      data: { candidates: needsEnrich.length, enriched, skipped },
      created_at: now,
    });
  } catch { /* audit non-fatal */ }

  return NextResponse.json({ ok: true, candidates: needsEnrich.length, enriched, skipped });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
