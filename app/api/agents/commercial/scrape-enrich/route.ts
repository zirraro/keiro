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
  // Rattrapage ponctuel : ne relire que les prospects dont l'email est une
  // adresse de service, pour tenter d'y substituer une nominative.
  const cibleEmails = body?.cible === 'emails_generiques'
    || req.nextUrl?.searchParams.get('cible') === 'emails_generiques';

  const supabase = sb();
  const since14d = new Date(Date.now() - 14 * 86400000).toISOString();

  // Find candidates: have website or instagram, no fresh notes, not dead.
  let q = supabase
    .from('crm_prospects')
    .select('id, user_id, company, type, website, instagram, tiktok_handle, phone, email, address, notes, business_notes, last_enriched_at, status, temperature')
    .or('website.not.is.null,instagram.not.is.null,tiktok_handle.not.is.null')
    .not('status', 'in', '("client","perdu","sprint","lost")')
    .not('temperature', 'eq', 'dead')
    /**
     * ── On balaie la base, on ne repasse plus sur les mêmes ──
     *
     * Le tri par score renvoyait à chaque passage les 60 mêmes prospects, ceux
     * du haut du classement. Une fois enrichis, ils étaient réexaminés puis
     * écartés le lendemain, et le lendemain encore — le scraper tournait sans
     * jamais descendre dans la base. Résultat mesuré le 2026-08-10 : 56
     * prospects scrapés au total, pour 6 666 qui ont un site web ou un
     * Instagram et pas d'email.
     *
     * En triant par date d'enrichissement, les jamais-traités passent en
     * premier et le balayage progresse réellement.
     *
     * ── Pourquoi 200 et pas 60 ──
     *
     * Le fondateur (2026-08-10) : « trop cher sur Google, on veut maîtriser nos
     * coûts — sinon booste le scraping si c'est gratuit. » Ça l'est : ce sont
     * des requêtes HTTP vers des sites publics, aucune API facturée. La seule
     * contrainte est le temps mural, borné à 300 s. À 200 prospects par
     * passage, le gisement se traite en un mois au lieu de plusieurs années.
     */
    .order('last_enriched_at', { ascending: true, nullsFirst: true })
    .limit(cibleEmails ? 1000 : 200);

  if (userId) q = q.eq('user_id', userId);
  // En mode « adresses de service », on ne veut que les prospects qui ont déjà
  // un email : c'est celui qu'on cherche à remplacer.
  if (cibleEmails) q = q.not('email', 'is', null);

  const { data: candidatsBruts } = await q;

  /**
   * ── Une cible pour rattraper les adresses de service déjà en base ──
   *
   * Le balayage normal traite les jamais-enrichis d'abord, ce qui est juste :
   * c'est là qu'on trouve des prospects neufs. Mais les 318 prospects qui ne
   * portent qu'un `contact@` ont DÉJÀ été enrichis — ils sont donc en fin de
   * file, à un mois de leur tour, alors que ce sont eux qui font 70 % des
   * rebonds et qu'on manque d'adresses nominatives dès demain.
   *
   * `?cible=emails_generiques` les fait passer devant, une seule fois, sans
   * changer la cadence de fond. On lit large et on filtre ici : « générique »
   * est une règle de code, pas une colonne, donc la base ne peut pas trier
   * dessus.
   */
  let candidates = candidatsBruts;
  if (cibleEmails && candidatsBruts) {
    const { estAdresseGenerique } = await import('@/lib/email/adresse-generique');
    candidates = candidatsBruts.filter((p: any) => estAdresseGenerique(p.email)).slice(0, 200);
    console.log(`[ScrapeEnrich] cible adresses de service : ${candidates.length} prospects sur ${candidatsBruts.length} relus`);
  }
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, enriched: 0, message: 'No candidates' });
  }

  // Filter in JS: keep only those that need re-enrichment
  const needsEnrich = candidates.filter((p: any) => {
    if (!p.business_notes) return true;
    if (!p.last_enriched_at) return true;
    return p.last_enriched_at < since14d;
  });
  /**
   * ── Le plafond disait 200, il valait 30 ──
   *
   * La lecture a été portée à 200 par passage le 10 août, avec un commentaire
   * promettant « le gisement se traite en un mois ». Le traitement, lui, est
   * resté bloqué à `.slice(0, 30)` : une demi-correction, l'intention à un
   * endroit et la contrainte à un autre. Résultat mesuré le 16 août : 308
   * fiches enrichies sur 13 961, alors que 8 219 sont éligibles.
   *
   * On borne désormais par le TEMPS, pas par un nombre. C'est le temps qui
   * contraint réellement — la route est bornée à 300 s — et un compteur en dur
   * se désaccorde du reste dès qu'on touche à autre chose, comme ici.
   */
  const BUDGET_MS = 240_000;
  const debutMs = Date.now();

  let enriched = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  let arreteParLeTemps = 0;
  for (const p of needsEnrich) {
    if (Date.now() - debutMs > BUDGET_MS) {
      // Un plafond qu'on ne journalise pas se lit comme « tout a été traité ».
      arreteParLeTemps = needsEnrich.length - (enriched + skipped);
      console.warn(`[ScrapeEnrich] budget de ${BUDGET_MS / 1000}s atteint — ${arreteParLeTemps} prospect(s) reportés au passage suivant`);
      break;
    }
    try {
      const notes = await harvestBusinessNotes(supabase, {
        website: p.website,
        instagram: p.instagram,
        tiktok_handle: p.tiktok_handle, // 2026-06-04 — TikTok parity
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

      // Also copy extracted contact info into the prospect's essential
      // fields — only when the field is currently empty so we don't
      // overwrite manually-entered data. Founder ask 2026-05-28:
      // scraper should populate essentials cheaply.
      const updates: Record<string, any> = {
        business_notes: notes,
        notes: newNotesText.slice(0, 4000),
        last_enriched_at: now,
        updated_at: now,
      };
      const extracted = (notes as any).extractedContact;
      if (extracted) {
        if (extracted.phone && !p.phone) updates.phone = extracted.phone;
        /**
         * ── Une adresse de service se remplace par une personne ──
         *
         * La règle « on n'écrit que si le champ est vide » protège la saisie
         * manuelle, et c'est juste. Mais elle gelait aussi les 318 prospects
         * qui ne portent qu'un `contact@` : même si le site affiche
         * `sophie.lemoine@…` sur sa page équipe, on ne l'aurait jamais repris.
         *
         * Or l'écart est mesuré : une adresse de service échoue à 69,9 % et
         * ouvre à 8 %, une nominative échoue à 11,7 % et ouvre à 17,5 %.
         * Remplacer, c'est récupérer un prospect qu'on avait de fait perdu.
         *
         * On ne remplace QUE dans ce sens — générique vers nominative, jamais
         * l'inverse — et on garde l'ancienne dans les notes : si la nouvelle
         * rebondit, on sait vers quoi revenir.
         */
        if (extracted.email) {
          const actuelle = (p as any).email as string | null;
          if (!actuelle) {
            updates.email = extracted.email;
          } else if (actuelle.toLowerCase() !== String(extracted.email).toLowerCase()) {
            const { estAdresseGenerique } = await import('@/lib/email/adresse-generique');
            if (estAdresseGenerique(actuelle) && !estAdresseGenerique(extracted.email)) {
              updates.email = extracted.email;
              updates.notes = `${(updates.notes as string) || ''}\n[Email ${now.slice(0, 10)}] adresse de service ${actuelle} remplacée par ${extracted.email} (nominative, six fois moins de rebonds).`.slice(0, 4000);
              console.log(`[ScrapeEnrich] ${p.id} : ${actuelle} → ${extracted.email} (générique remplacée par nominative)`);
            }
          }
        }
        if (extracted.address && !(p as any).address) updates.address = extracted.address;
        if (extracted.instagram && (!p.instagram || p.instagram === 'A_VERIFIER')) {
          updates.instagram = extracted.instagram;
        }
      }

      await supabase.from('crm_prospects').update(updates).eq('id', p.id);

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

  return NextResponse.json({ ok: true, candidates: needsEnrich.length, enriched, skipped, reportes: arreteParLeTemps });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
