import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isUnderDailyBudget, incrementDailySpend } from '@/lib/places/prospect-pool';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Léo — enrichissement GPS borné (feeder de signaux). Géocode les prospects du
 * pool (place_id → Places Details, FIELD geometry SEUL = le moins cher) et
 * stocke lat/lng dans raw_data.geometry → débloque les TOURNÉES (qualify-route).
 *
 * Garde-fous (souvenir runaway €350 avril) : cap DUR par run, AUCUN retry,
 * budget journalier Places respecté (isUnderDailyBudget). Soft-stop si cap.
 * Body: { limit?: number (≤60), zone?: string }
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY missing' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(60, Math.max(1, Number(body.limit) || 30)); // HARD cap 60/run
  const zone: string | undefined = body.zone;

  const supabase = sb();
  let q = supabase.from('prospect_pool').select('place_id, zone, raw_data').not('place_id', 'is', null).limit(300);
  if (zone) q = q.eq('zone', zone);
  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Only those still missing coordinates.
  const need = (rows || []).filter((r: any) => {
    const loc = r.raw_data?.geometry?.location;
    return !(loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng)));
  }).slice(0, limit);

  let enriched = 0, failed = 0, budgetStopped = false;
  for (const r of need) {
    const guard = await isUnderDailyBudget(supabase);
    if (!guard.ok) { budgetStopped = true; break; }
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(r.place_id)}&fields=geometry&language=fr&key=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) }); // no retry
      await incrementDailySpend(supabase, { details_calls: 1 });
      if (!res.ok) { failed++; continue; }
      const data = await res.json();
      const loc = data?.result?.geometry?.location;
      if (!loc || !Number.isFinite(loc.lat)) { failed++; continue; }
      const rawData = { ...(r.raw_data || {}), geometry: { location: { lat: loc.lat, lng: loc.lng } } };
      await supabase.from('prospect_pool').update({ raw_data: rawData }).eq('place_id', r.place_id);
      enriched++;
    } catch { failed++; }
  }

  const finalGuard = await isUnderDailyBudget(supabase);
  return NextResponse.json({
    ok: true, candidates: need.length, enriched, failed, budgetStopped,
    spent_eur: finalGuard.spent, budget_eur: finalGuard.budget,
  });
}

// The global cron worker calls endpoints via GET — alias to POST (default batch).
export async function GET(req: NextRequest) { return POST(req); }
