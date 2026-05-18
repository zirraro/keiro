/**
 * GET /api/cron/prospect-pool-refresh
 *
 * Nightly cron that refreshes entries in `prospect_pool` whose
 * refresh_due_at has elapsed (25 days after enrichment), keeping us
 * within Google Places ToS (which allows ~30 days of caching).
 *
 * Strategy: pull the N oldest expired entries and re-call Places for
 * each. Capped at MAX_REFRESH_PER_RUN to keep costs predictable —
 * spread across multiple nights for large pools.
 *
 * Auth: CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { addToPool, incrementDailySpend, isUnderDailyBudget } from '@/lib/places/prospect-pool';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_REFRESH_PER_RUN = 30;

async function fetchPlaceDetails(placeId: string, apiKey: string) {
  const fields = 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,business_status,url,types';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&language=fr&key=${apiKey}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'GOOGLE_MAPS_API_KEY not configured' }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Budget guard — bail if we're already at the daily cap.
  const budget = await isUnderDailyBudget(supabase);
  if (!budget.ok) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'daily_budget_reached',
      spent: budget.spent,
      budget: budget.budget,
    });
  }

  const { data: stale, error } = await supabase
    .from('prospect_pool')
    .select('place_id, name, zone, business_type')
    .lte('refresh_due_at', new Date().toISOString())
    .neq('business_status', 'CLOSED_PERMANENTLY')
    .order('refresh_due_at', { ascending: true })
    .limit(MAX_REFRESH_PER_RUN);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!stale || stale.length === 0) {
    return NextResponse.json({ ok: true, refreshed: 0, message: 'No stale pool entries' });
  }

  let refreshed = 0;
  let closed = 0;
  let failed = 0;

  for (const entry of stale) {
    // Re-check budget every 5 calls so we don't overshoot.
    if (refreshed % 5 === 0) {
      const b = await isUnderDailyBudget(supabase);
      if (!b.ok) {
        console.log('[pool-refresh] daily budget reached mid-run, stopping');
        break;
      }
    }

    const details = await fetchPlaceDetails(entry.place_id, apiKey);
    await incrementDailySpend(supabase, { details_calls: 1 });

    if (!details) {
      failed++;
      continue;
    }

    if (details.business_status === 'CLOSED_PERMANENTLY') {
      await supabase
        .from('prospect_pool')
        .update({
          business_status: 'CLOSED_PERMANENTLY',
          enriched_at: new Date().toISOString(),
        })
        .eq('place_id', entry.place_id);
      closed++;
      continue;
    }

    await addToPool(supabase, {
      place_id: entry.place_id,
      name: details.name || entry.name,
      business_type: entry.business_type,
      address: details.formatted_address || null,
      phone: details.formatted_phone_number || null,
      website: details.website || null,
      instagram: null,
      zone: entry.zone,
      google_maps_url: details.url || null,
      google_rating: details.rating || null,
      google_reviews: details.user_ratings_total || null,
      business_status: details.business_status || null,
      types: details.types || null,
      raw_data: { refreshed_at: new Date().toISOString() },
    });
    refreshed++;
  }

  await supabase.from('agent_logs').insert({
    agent: 'gmaps',
    action: 'pool_refresh',
    status: 'success',
    data: { candidates: stale.length, refreshed, closed, failed },
  });

  return NextResponse.json({
    ok: true,
    candidates: stale.length,
    refreshed,
    closed,
    failed,
  });
}
