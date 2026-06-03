/**
 * 2026-06-03 — Internal prospect sourcing (margin lever).
 *
 * Before Léo burns budget on Google Places, pull candidates from what
 * we already know:
 *   1. `prospect_pool` — places we've already paid Google for (any
 *      client). Free re-read, just clone the row into the new client's
 *      crm_prospects.
 *   2. `crm_prospects` from OTHER users — same sector + zone match,
 *      not from a direct competitor (same sector + same city as the
 *      target client = competitor, skip those to avoid lead conflicts).
 *
 * Anti-competitor rule: a user X is a direct competitor of user Y when
 * BOTH have `gmaps_focus.sector` set to the same value AND
 * `gmaps_focus.city` set to the same city. If either side has no focus
 * set, they're not "targeting" the same lane so sharing is safe.
 *
 * Cost win: Pro plan = 45 prospects/day cap, ~€0.16/day in Places.
 * If 60% of daily quota comes from internal sources, Léo only pays
 * for ~18 calls/day = ~€0.06/day → 60% margin lift on the prospection
 * line item.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface InternalSourceResult {
  importedFromPool: number;
  importedFromPeers: number;
  total: number;
  competitorsSkipped: number;
  estimatedSavingsEur: number;
}

const COST_PER_DETAILS_EUR = 0.0035;

interface FocusKey { sector: string | null; city: string | null }

function normalizeFocus(focus: any): FocusKey {
  if (!focus || typeof focus !== 'object') return { sector: null, city: null };
  return {
    sector: focus.sector ? String(focus.sector).toLowerCase().trim() : null,
    city: focus.city ? String(focus.city).toLowerCase().trim() : null,
  };
}

/**
 * Look up direct-competitor user_ids for the target user. A competitor
 * shares BOTH sector AND city. We can't lift prospects from these users
 * — they're hunting the same lane.
 */
async function getCompetitorUserIds(
  supabase: SupabaseClient,
  userId: string,
  focus: FocusKey,
): Promise<string[]> {
  if (!focus.sector || !focus.city) return [];
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, gmaps_focus')
      .neq('id', userId)
      .not('gmaps_focus', 'is', null)
      .limit(500);
    return (data || [])
      .filter((p: any) => {
        const f = normalizeFocus(p.gmaps_focus);
        return f.sector === focus.sector && f.city === focus.city;
      })
      .map((p: any) => p.id);
  } catch {
    return [];
  }
}

/**
 * Pull rows from `prospect_pool` matching the target user's focus.
 * These are free reads — no Places API call needed.
 */
async function pullFromPool(
  supabase: SupabaseClient,
  userId: string,
  focus: FocusKey,
  limit: number,
): Promise<any[]> {
  if (limit <= 0) return [];
  try {
    let q = supabase
      .from('prospect_pool')
      .select('place_id, name, business_type, address, phone, website, instagram, zone, google_maps_url, google_rating, google_reviews, business_status, types')
      .eq('business_status', 'OPERATIONAL')
      .order('google_reviews', { ascending: false, nullsFirst: false })
      .limit(limit * 4); // over-fetch — we filter below
    if (focus.sector) q = q.or(`business_type.ilike.%${focus.sector}%,types.cs.{${focus.sector}}`);
    const { data } = await q;
    if (!data || data.length === 0) return [];

    // Exclude place_ids already owned by this user
    const placeIds = data.map((r: any) => r.place_id).filter(Boolean);
    if (placeIds.length === 0) return [];
    const { data: owned } = await supabase
      .from('crm_prospects')
      .select('google_place_id')
      .eq('user_id', userId)
      .in('google_place_id', placeIds);
    const ownedSet = new Set((owned || []).map((p: any) => p.google_place_id));
    const fresh = data.filter((r: any) => !ownedSet.has(r.place_id));
    // City filter (best-effort, applied after dedup so we don't bias)
    const cityFiltered = focus.city
      ? fresh.filter((r: any) => {
          const blob = `${r.address || ''} ${r.zone || ''}`.toLowerCase();
          return blob.includes(focus.city as string);
        })
      : fresh;
    return (cityFiltered.length > 0 ? cityFiltered : fresh).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Pull prospects from peer users' crm_prospects. Excludes direct
 * competitors + the target user's existing pipeline.
 */
async function pullFromPeers(
  supabase: SupabaseClient,
  userId: string,
  focus: FocusKey,
  limit: number,
  excludeUserIds: string[],
): Promise<any[]> {
  if (limit <= 0) return [];
  try {
    let q = supabase
      .from('crm_prospects')
      .select('id, company, type, quartier, phone, website, address, instagram, google_place_id, google_maps_url, google_rating, google_reviews, score, user_id')
      .neq('user_id', userId)
      .not('google_place_id', 'is', null)
      .not('temperature', 'eq', 'dead')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(limit * 4);
    if (excludeUserIds.length > 0) q = q.not('user_id', 'in', `(${excludeUserIds.map(id => `"${id}"`).join(',')})`);
    if (focus.sector) q = q.ilike('type', `%${focus.sector}%`);
    if (focus.city) q = q.ilike('quartier', `%${focus.city}%`);
    const { data } = await q;
    if (!data || data.length === 0) return [];

    // Drop place_ids already owned by this user
    const placeIds = data.map((r: any) => r.google_place_id).filter(Boolean);
    if (placeIds.length === 0) return [];
    const { data: owned } = await supabase
      .from('crm_prospects')
      .select('google_place_id')
      .eq('user_id', userId)
      .in('google_place_id', placeIds);
    const ownedSet = new Set((owned || []).map((p: any) => p.google_place_id));
    return data.filter((r: any) => !ownedSet.has(r.google_place_id)).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Main entry — pull internal candidates and clone into the target user's
 * crm_prospects. Returns counts + estimated Places spend avoided.
 */
export async function sourceFromInternalDb(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    focus?: { sector?: string | null; city?: string | null } | null;
    targetCount: number;
  },
): Promise<InternalSourceResult> {
  const focus = normalizeFocus(opts.focus || null);
  const target = Math.max(0, opts.targetCount);
  const result: InternalSourceResult = {
    importedFromPool: 0,
    importedFromPeers: 0,
    total: 0,
    competitorsSkipped: 0,
    estimatedSavingsEur: 0,
  };
  if (target === 0) return result;

  const competitors = await getCompetitorUserIds(supabase, userId, focus);
  result.competitorsSkipped = competitors.length;

  const now = new Date().toISOString();

  // PASS 1 — prospect_pool (free Places re-read)
  const poolRows = await pullFromPool(supabase, userId, focus, target);
  for (const r of poolRows) {
    if (result.total >= target) break;
    try {
      const { error } = await supabase.from('crm_prospects').insert({
        company: r.name,
        type: r.business_type || null,
        quartier: r.zone || null,
        phone: r.phone || null,
        website: r.website || null,
        address: r.address || null,
        instagram: r.instagram || null,
        google_place_id: r.place_id,
        google_maps_url: r.google_maps_url || null,
        google_rating: r.google_rating || null,
        google_reviews: r.google_reviews || null,
        score: 0,
        temperature: 'cold',
        source: 'prospection_commerciale',
        source_agent: 'internal_pool',
        status: 'identifie',
        user_id: userId,
        created_by: userId,
        created_at: now,
        updated_at: now,
      });
      if (!error) {
        result.importedFromPool++;
        result.total++;
      }
    } catch { /* dup or constraint — skip */ }
  }

  // PASS 2 — peer crm_prospects (sector/city match, non-competitor)
  const remaining = target - result.total;
  if (remaining > 0) {
    const peerRows = await pullFromPeers(supabase, userId, focus, remaining, competitors);
    for (const r of peerRows) {
      if (result.total >= target) break;
      try {
        const { error } = await supabase.from('crm_prospects').insert({
          company: r.company,
          type: r.type || null,
          quartier: r.quartier || null,
          phone: r.phone || null,
          website: r.website || null,
          address: r.address || null,
          instagram: r.instagram || null,
          google_place_id: r.google_place_id,
          google_maps_url: r.google_maps_url || null,
          google_rating: r.google_rating || null,
          google_reviews: r.google_reviews || null,
          score: r.score || 0,
          temperature: 'cold',
          source: 'prospection_commerciale',
          source_agent: 'internal_peer',
          status: 'identifie',
          user_id: userId,
          created_by: userId,
          created_at: now,
          updated_at: now,
        });
        if (!error) {
          result.importedFromPeers++;
          result.total++;
        }
      } catch { /* dup — skip */ }
    }
  }

  // Estimated Places spend avoided (1 Details call per imported row)
  result.estimatedSavingsEur = result.total * COST_PER_DETAILS_EUR;
  return result;
}
