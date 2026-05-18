/**
 * Prospect pool helpers — cross-client cache of Google Places enrichment.
 *
 * Léo (commercial / gmaps agent) calls `lookupInPool` BEFORE hitting the
 * Places API. If the place_id is already in the pool and not yet
 * expired, the cached row is returned (free). On miss, Léo calls
 * Places, then `addToPool` to populate the cache so the next client
 * targeting the same shop pulls from the pool too.
 *
 * Daily spend is logged into `places_spend_daily` so the admin
 * dashboard can show real-time cost + a hard cap can kick in if we
 * approach a monthly budget ceiling.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PooledPlace {
  place_id: string;
  name: string;
  business_type: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  zone: string | null;
  google_maps_url: string | null;
  google_rating: number | null;
  google_reviews: number | null;
  business_status: string | null;
  types: string[] | null;
  enriched_at: string;
  refresh_due_at: string;
}

/**
 * Look up a place in the pool. Returns the cached entry only if it's
 * still fresh (refresh_due_at in the future). Increments hit_count +
 * pool_hits in the daily ledger so the dashboard reflects the saving.
 */
export async function lookupInPool(
  supabase: SupabaseClient,
  placeId: string,
): Promise<PooledPlace | null> {
  try {
    const { data } = await supabase
      .from('prospect_pool')
      .select('*')
      .eq('place_id', placeId)
      .gt('refresh_due_at', new Date().toISOString())
      .maybeSingle();
    if (!data) return null;

    // Update hit counters fire-and-forget so a slow update never
    // blocks Léo's main loop.
    supabase
      .from('prospect_pool')
      .update({
        hit_count: (data.hit_count || 0) + 1,
        last_served_at: new Date().toISOString(),
      })
      .eq('place_id', placeId)
      .then(() => {});

    await incrementDailySpend(supabase, { pool_hits: 1 });
    return data as PooledPlace;
  } catch (e: any) {
    console.warn('[prospect-pool] lookup failed:', e?.message);
    return null;
  }
}

/**
 * Add (or refresh) a place in the pool. Called after a Places API
 * fetch succeeds. Idempotent: upsert by place_id.
 */
export async function addToPool(
  supabase: SupabaseClient,
  place: Omit<PooledPlace, 'enriched_at' | 'refresh_due_at'> & { raw_data?: any },
): Promise<void> {
  try {
    const now = new Date();
    const refreshDue = new Date(now.getTime() + 25 * 24 * 3600 * 1000); // 25 days
    await supabase
      .from('prospect_pool')
      .upsert(
        {
          place_id: place.place_id,
          name: place.name,
          business_type: place.business_type,
          address: place.address,
          phone: place.phone,
          website: place.website,
          instagram: place.instagram,
          zone: place.zone,
          google_maps_url: place.google_maps_url,
          google_rating: place.google_rating,
          google_reviews: place.google_reviews,
          business_status: place.business_status,
          types: place.types,
          raw_data: place.raw_data || null,
          enriched_at: now.toISOString(),
          refresh_due_at: refreshDue.toISOString(),
        },
        { onConflict: 'place_id' },
      );
  } catch (e: any) {
    console.warn('[prospect-pool] add failed:', e?.message);
  }
}

/**
 * Track a Places API spend event in the daily ledger. The dashboard
 * reads `places_spend_daily` for live cost monitoring.
 *
 * Estimated cost coefficients (Google Places pricing 2026):
 *   - Text Search:  free (within the monthly free tier of 5000)
 *   - Place Details (Contact + Atmosphere fields):  ~€0.0035 / call
 * We use the Atmosphere-tier cost as worst case to be conservative.
 */
const COST_PER_TEXT_SEARCH_EUR = 0;
const COST_PER_DETAILS_CALL_EUR = 0.0035;

export async function incrementDailySpend(
  supabase: SupabaseClient,
  delta: { text_search_calls?: number; details_calls?: number; pool_hits?: number },
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const textCalls = delta.text_search_calls || 0;
  const detailsCalls = delta.details_calls || 0;
  const poolHits = delta.pool_hits || 0;
  const costDelta = textCalls * COST_PER_TEXT_SEARCH_EUR + detailsCalls * COST_PER_DETAILS_CALL_EUR;

  try {
    // Upsert with atomic increment via RPC-style update — we do it
    // in two queries (read-then-write) to keep the helper portable.
    const { data: existing } = await supabase
      .from('places_spend_daily')
      .select('text_search_calls, details_calls, pool_hits, estimated_cost_eur')
      .eq('day', today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('places_spend_daily')
        .update({
          text_search_calls: (existing.text_search_calls || 0) + textCalls,
          details_calls: (existing.details_calls || 0) + detailsCalls,
          pool_hits: (existing.pool_hits || 0) + poolHits,
          estimated_cost_eur: (Number(existing.estimated_cost_eur) || 0) + costDelta,
          updated_at: new Date().toISOString(),
        })
        .eq('day', today);
    } else {
      await supabase
        .from('places_spend_daily')
        .insert({
          day: today,
          text_search_calls: textCalls,
          details_calls: detailsCalls,
          pool_hits: poolHits,
          estimated_cost_eur: costDelta,
        });
    }
  } catch (e: any) {
    // Spend tracking failure is non-fatal — don't block the actual
    // Places call on a logging glitch.
    console.warn('[prospect-pool] spend tracking failed:', e?.message);
  }
}

/**
 * Daily cap (EUR) for total Google Places spend. Returns true if the
 * caller is still under budget, false if the cap is hit.
 *
 * Set DAILY_PLACES_BUDGET_EUR in env to override the default. The
 * cap is intentionally soft (Léo just stops scanning for the day,
 * resumes tomorrow) — no permission revocation risk.
 */
export async function isUnderDailyBudget(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; spent: number; budget: number }> {
  const budget = Number(process.env.DAILY_PLACES_BUDGET_EUR || '5');
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('places_spend_daily')
      .select('estimated_cost_eur')
      .eq('day', today)
      .maybeSingle();
    const spent = Number(data?.estimated_cost_eur || 0);
    return { ok: spent < budget, spent, budget };
  } catch {
    return { ok: true, spent: 0, budget };
  }
}
