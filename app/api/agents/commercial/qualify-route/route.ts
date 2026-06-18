import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { qualifyProspect, ProspectSignals } from '@/lib/agents/prospect-qualification';
import { buildWalkingRoutes, GeoProspect } from '@/lib/agents/prospect-routes';
import { detectSector, buildProspectAccroche, isSectorInSeason } from '@/lib/agents/sales-playbook';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Léo — sortie commerciale priorisée + tournée (système 4 étages).
 * POST { userId } (CRON) → pour un client, prend ses prospects (prospect_pool),
 * applique le GATE + SCORE (étage 4), clusterise les priority en TOURNÉES à
 * pied, et attache une accroche DM par prospect (Jade, préparation-only).
 *
 * Additif : ne modifie pas l'enrichissement existant. Les signaux non encore
 * enrichis (date dernier post, % avis sans réponse, densité, déclencheur) sont
 * traités comme inconnus par le qualifier (ils n'ajoutent juste pas de points) —
 * l'enrichissement les remplira pour affiner le score.
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  // prospect_pool is a SHARED pool keyed by place_id + zone (no user_id).
  // Optional `zone` filter targets a client's chalandise; else scans the pool.
  const zone: string | undefined = body.zone;

  const supabase = sb();
  let q = supabase.from('prospect_pool').select('*').limit(500);
  if (zone) q = q.eq('zone', zone);
  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const num = (v: any) => (v == null || v === '' ? undefined : Number(v));
  const curMonth = new Date().getMonth() + 1; // 1-12, for seasonal trigger
  // Density proxy: # of pooled businesses sharing a zone ≈ commercial density of
  // that zone (the founder's HARD criterion). Cheap, derivable now, no API call.
  const zoneCounts: Record<string, number> = {};
  for (const r of rows || []) { const z = String(r.zone || ''); if (z) zoneCounts[z] = (zoneCounts[z] || 0) + 1; }
  const densityFor = (zone: string | null | undefined): number | undefined => {
    const c = zoneCounts[String(zone || '')] || 0;
    if (!c) return undefined;
    if (c >= 15) return 70; if (c >= 8) return 55; if (c >= 4) return 38; return 20;
  };
  const out = (rows || []).map((r: any) => {
   try {
    const typeStr = String(r.business_type || (Array.isArray(r.types) ? r.types.join(' ') : (r.types || '')));
    const sector = detectSector(typeStr);
    const hasPresence = !!(r.instagram || r.website || r.place_id || r.google_maps_url);
    const contactChannel: ProspectSignals['contactChannel'] = r.instagram ? 'dm_open' : r.website ? 'email' : null;
    const loc = r.raw_data?.geometry?.location || r.raw_data?.location || {};
    const signals: ProspectSignals = {
      isChainOrFranchise: r.is_chain === true || undefined,
      underAgencyContract: r.under_contract === true || undefined,
      hasAnyDigitalPresence: hasPresence,
      densityScore: num(r.density_score) ?? densityFor(r.zone),
      contactChannel,
      lastInstaPostDaysAgo: num(r.last_post_days_ago),
      priorEffortEvidence: r.prior_effort_evidence === true || undefined,
      googleReviewsCount: num(r.google_reviews),
      googleReviewsUnansweredPct: num(r.reviews_unanswered_pct),
      googleRating: num(r.google_rating),
      // Déclencheur : drapeau data si présent, sinon saisonnalité du secteur ce mois-ci.
      activeTrigger: r.active_trigger === true || isSectorInSeason(sector, curMonth),
    };
    const qualification = qualifyProspect(signals);
    // DM accroche from the strongest available signal (Jade — to personalise).
    let accroche: string | undefined;
    if (!qualification.disqualified) {
      const fn = r.owner_first_name || undefined;
      if ((signals.googleReviewsUnansweredPct ?? 0) >= 40 && (signals.googleReviewsCount ?? 0) >= 10) {
        accroche = buildProspectAccroche({ firstName: fn, sector, signal: 'avis_sans_reponse', unansweredReviews: Math.round((signals.googleReviewsCount! * (signals.googleReviewsUnansweredPct! / 100))), reviewsCount: signals.googleReviewsCount!, rating: signals.googleRating ?? undefined });
      } else if ((signals.lastInstaPostDaysAgo ?? 0) > 14) {
        accroche = buildProspectAccroche({ firstName: fn, sector, signal: 'compte_dormant' });
      } else {
        accroche = buildProspectAccroche({ firstName: fn, sector, signal: 'creux_saisonnier' });
      }
    }
    return {
      id: r.place_id, company: r.name, sector, quartier: r.zone, address: r.address,
      instagram: r.instagram, lat: num(loc.lat) ?? num(loc.latitude), lng: num(loc.lng) ?? num(loc.longitude),
      qualification, accroche,
    };
   } catch {
    return { id: r.place_id, company: r.name, sector: 'autre' as const, qualification: qualifyProspect({}), accroche: undefined, lat: undefined, lng: undefined };
   }
  });

  const actionable = out.filter(p => !p.qualification.disqualified && p.qualification.tier !== 'ignore')
    .sort((a, b) => b.qualification.score - a.qualification.score);
  const priority = actionable.filter(p => p.qualification.tier === 'priority');

  // Walking routes from the ACTIONABLE set (priority + maybe) that has coords —
  // the founder's Saturday tour shouldn't wait on the rare 70+ when 40-69 in a
  // dense block are worth visiting too.
  const geo: GeoProspect[] = actionable
    .filter(p => Number.isFinite(p.lat as any) && Number.isFinite(p.lng as any))
    .map(p => ({ id: p.id, company: p.company, lat: p.lat as number, lng: p.lng as number, score: p.qualification.score }));
  const routes = buildWalkingRoutes(geo);

  return NextResponse.json({
    ok: true,
    summary: {
      total: out.length,
      disqualified: out.filter(p => p.qualification.disqualified).length,
      priority: priority.length,
      maybe: actionable.length - priority.length,
      routes: routes.length,
    },
    routes,
    prospects: actionable.slice(0, 100),
  });
}
