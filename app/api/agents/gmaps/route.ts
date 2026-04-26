import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { saveLearning, saveAgentFeedback } from '@/lib/agents/learning';
import { loadContextWithAvatar } from '@/lib/agents/shared-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min for multi-zone scanning

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function verifyAuth(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return { authorized: true, isCron: true, userId: null as string | null };

  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return { authorized: false, userId: null as string | null };
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    // Allow both admin and authenticated clients
    return { authorized: true, isAdmin: !!profile?.is_admin, userId: user.id };
  } catch {}
  return { authorized: false, userId: null as string | null };
}

// Search queries by business type
const SEARCH_QUERIES = [
  'restaurant', 'bistrot', 'boutique mode', 'coiffeur', 'barbier',
  'coach sportif', 'salle de sport', 'fleuriste', 'caviste',
  'salon de beauté', 'épicerie fine', 'traiteur', 'fromagerie',
];

// Zones to scrape (rotate daily)
const ZONES = [
  // Paris (12 zones)
  { name: 'Montorgueil 2e', lat: 48.8645, lng: 2.3480, radius: 800 },
  { name: 'Martyrs 9e', lat: 48.8794, lng: 2.3378, radius: 800 },
  { name: 'Oberkampf 11e', lat: 48.8655, lng: 2.3785, radius: 800 },
  { name: 'Bastille 11e', lat: 48.8533, lng: 2.3694, radius: 800 },
  { name: 'Batignolles 17e', lat: 48.8842, lng: 2.3189, radius: 800 },
  { name: 'Montmartre 18e', lat: 48.8867, lng: 2.3431, radius: 800 },
  { name: 'Belleville 20e', lat: 48.8718, lng: 2.3842, radius: 800 },
  { name: 'Marais 3e-4e', lat: 48.8592, lng: 2.3622, radius: 800 },
  { name: 'St-Germain 6e', lat: 48.8530, lng: 2.3345, radius: 800 },
  { name: 'Grands Boulevards 9e', lat: 48.8718, lng: 2.3420, radius: 800 },
  { name: 'Daguerre 14e', lat: 48.8335, lng: 2.3262, radius: 800 },
  { name: 'Fbg St-Denis 10e', lat: 48.8722, lng: 2.3558, radius: 800 },
  // Lyon (3 zones)
  { name: 'Presqu\'île Lyon 2e', lat: 45.7578, lng: 4.8320, radius: 1000 },
  { name: 'Vieux Lyon 5e', lat: 45.7600, lng: 4.8260, radius: 800 },
  { name: 'Part-Dieu Lyon 3e', lat: 45.7610, lng: 4.8590, radius: 1000 },
  // Marseille (3 zones)
  { name: 'Vieux-Port Marseille', lat: 43.2965, lng: 5.3698, radius: 1000 },
  { name: 'Cours Julien Marseille', lat: 43.2920, lng: 5.3835, radius: 800 },
  { name: 'Castellane Marseille', lat: 43.2850, lng: 5.3810, radius: 1000 },
  // Bordeaux (3 zones)
  { name: 'Saint-Pierre Bordeaux', lat: 44.8378, lng: -0.5722, radius: 1000 },
  { name: 'Chartrons Bordeaux', lat: 44.8520, lng: -0.5710, radius: 800 },
  { name: 'Saint-Michel Bordeaux', lat: 44.8330, lng: -0.5660, radius: 800 },
  // Lille (3 zones)
  { name: 'Vieux-Lille', lat: 50.6410, lng: 3.0620, radius: 800 },
  { name: 'Centre Lille', lat: 50.6292, lng: 3.0573, radius: 1000 },
  { name: 'Wazemmes Lille', lat: 50.6250, lng: 3.0470, radius: 800 },
  // Toulouse (3 zones)
  { name: 'Capitole Toulouse', lat: 43.6047, lng: 1.4442, radius: 1000 },
  { name: 'Saint-Cyprien Toulouse', lat: 43.5990, lng: 1.4330, radius: 800 },
  { name: 'Carmes Toulouse', lat: 43.5990, lng: 1.4440, radius: 800 },
  // Nice (3 zones)
  { name: 'Vieux-Nice', lat: 43.6960, lng: 7.2750, radius: 800 },
  { name: 'Port Nice', lat: 43.6950, lng: 7.2850, radius: 800 },
  { name: 'Libération Nice', lat: 43.7060, lng: 7.2730, radius: 800 },
];

const MAX_RESULTS_PER_QUERY = 10;

// Per-plan configuration. Derived from >80% margin target and the fact
// that text searches are paid independently of details (and return up
// to 20 places each, most of which may already be in DB — the anti-dedup
// skip list below avoids paying for re-scans of saturated zone+query
// combos).
//
// Math for Pro €99/mo, target 80% margin → max €19.80 total COGS →
// gmaps budget ~€8/mo:
//   1 zone × 2 queries × 30 days = 60 searches × €0.035 = €2.10
//   10 details/day × 30 = 300 × €0.021                  = €6.30
//   Total ≈ €8.40 ✓ (20% of that comes back via free credits anyway)
//
// Google Cloud grants ~€185/mo free Places credits on the account, so
// the first N clients are effectively free.
type PlanConfig = { zones: number; queries: number; details: number };
const GMAPS_PLAN_CONFIG: Record<string, PlanConfig> = {
  starter:    { zones: 0, queries: 0, details: 0 },
  free:       { zones: 0, queries: 0, details: 0 },
  // Plans below were tuned conservatively in April after the Places
  // runaway incident. Now that the budget cap + check-constraint
  // bug are fixed, Business especially needs more room — the user's
  // current cap was 2×3×25 = max 150 prospect tries/day which is too
  // light for a 49€+/mo plan that promises real prospection.
  // Créateur €49 — ~60 qualified prospects/mo, €2.30/mo cost (>80% margin)
  createur:   { zones: 1, queries: 2, details: 8 },
  // Pro €99 — ~240/mo, €7/mo cost (>80% margin)
  pro:        { zones: 2, queries: 3, details: 20 },
  // Business / Fondateurs €199/149 — ~750/mo, €22/mo cost (>80% margin)
  business:   { zones: 4, queries: 5, details: 60 },
  fondateurs: { zones: 4, queries: 5, details: 60 },
  // Elite €999 / Agency — ~1500/mo, €40/mo cost (>95% margin on Elite)
  agence:     { zones: 3, queries: 4, details: 50 },
  agency:     { zones: 3, queries: 4, details: 50 },
  elite:      { zones: 3, queries: 4, details: 50 },
  admin:      { zones: 5, queries: 6, details: 80 },
};
function configForPlan(plan: string | null | undefined): PlanConfig {
  const key = (plan || '').toLowerCase();
  return GMAPS_PLAN_CONFIG[key] || GMAPS_PLAN_CONFIG.pro;
}

// Skip-list window: a zone+query combo scanned for this user in the
// last N days is skipped on the next run. Zones saturate quickly — if
// we scanned "restaurant Montorgueil" yesterday and grabbed 18 new
// prospects, today 80%+ of results would be duplicates. Waiting 30
// days lets the area refresh (new openings, updated profiles, new
// reviews pushing scores).
const SKIP_LIST_DAYS = 30;

// FNV-1a hash of a string → non-negative integer. Used to derive a
// per-user rotation offset so two clients on the same plan never scan
// the same zone on the same day (avoids contention + duplicate
// pressure on the same neighbourhood).
function fnvHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Score a prospect based on Google data
 */
function scoreProspect(p: { rating?: number; reviewCount?: number; website?: string; instagram?: string | null }) {
  let score = 0;
  if (p.rating && p.rating >= 4.0) score += 5;
  if (p.rating && p.rating >= 4.5) score += 5;
  if (p.reviewCount && p.reviewCount >= 50) score += 5;
  if (p.reviewCount && p.reviewCount >= 200) score += 5;
  if (p.reviewCount && p.reviewCount >= 500) score += 5;
  if (!p.instagram) score += 15;
  if (p.website) score += 5;
  return Math.min(score, 100);
}

function getTemperature(score: number) {
  if (score >= 50) return 'hot';
  if (score >= 25) return 'warm';
  return 'cold';
}

/**
 * Try to find Instagram handle from website HTML
 */
async function findInstagramFromWebsite(website: string): Promise<string | null> {
  try {
    const res = await fetch(website, { signal: AbortSignal.timeout(5000), redirect: 'follow' });
    if (!res.ok) return null;
    const html = await res.text();
    const igRegex = /(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.]{2,30})/gi;
    const match = igRegex.exec(html);
    if (match) {
      const handle = match[1].replace(/\/$/, '');
      if (!['p', 'reel', 'stories', 'explore', 'accounts'].includes(handle)) {
        return `@${handle}`;
      }
    }
  } catch {}
  return null;
}

/**
 * Search Google Places API (Text Search)
 */
async function searchPlaces(query: string, lat: number, lng: number, radius: number) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return [];

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${radius}&language=fr&key=${apiKey}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, MAX_RESULTS_PER_QUERY);
  } catch (e: any) {
    console.warn(`[GMaps] Search failed for "${query}":`, e.message);
    return [];
  }
}

/**
 * Get Place Details
 */
async function getPlaceDetails(placeId: string) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const fields = 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,business_status,url,types';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&language=fr&key=${apiKey}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result || null;
  } catch {
    return null;
  }
}

/**
 * Map Google types to our business types
 */
function mapGoogleType(types: string[]): string {
  const typeMap: Record<string, string> = {
    restaurant: 'restaurant', meal_delivery: 'restaurant', food: 'restaurant',
    bar: 'restaurant', cafe: 'restaurant', bakery: 'restaurant',
    hair_care: 'coiffeur', beauty_salon: 'coiffeur',
    clothing_store: 'boutique', shoe_store: 'boutique', jewelry_store: 'boutique',
    gym: 'coach', spa: 'coach',
    florist: 'fleuriste',
    liquor_store: 'caviste',
  };
  for (const t of types || []) {
    if (typeMap[t]) return typeMap[t];
  }
  return 'services';
}

/**
 * GET /api/agents/gmaps
 * Cron: run daily scan. Admin: return last report.
 */
export async function GET(request: NextRequest) {
  const { authorized, isCron } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const orgId = request.nextUrl.searchParams.get('org_id') || null;
  const clientUserId = request.nextUrl.searchParams.get('user_id') || null;

  if (isCron) {
    const scanResult = await runGMapsScan(orgId, clientUserId);
    // Chain review-reply when the client has auto_reply_reviews enabled.
    // This is Theo's reputation-management half: scan → qualify →
    // auto-reply to new Google reviews on the client's own listing. It
    // used to live in a separate scheduler slot that the VPS worker
    // never fired — hence review_reply_sent had 0 logs forever.
    if (clientUserId) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: cfg } = await supabase
          .from('org_agent_configs')
          .select('config')
          .eq('user_id', clientUserId)
          .eq('agent_id', 'gmaps')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cfg?.config?.auto_reply_reviews === true) {
          const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
          await fetch(`${baseUrl}/api/agents/google-reviews?user_id=${clientUserId}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
          }).catch(() => {});
        }
      } catch { /* non-blocking — scan result is what the worker cares about */ }
    }
    return scanResult;
  }

  // Admin: last report
  const supabase = getSupabaseAdmin();
  const { data: report } = await supabase
    .from('agent_logs')
    .select('*')
    .eq('agent', 'gmaps')
    .eq('action', 'daily_scan')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!report) return NextResponse.json({ ok: false, error: 'Aucun rapport' }, { status: 404 });
  return NextResponse.json({ ok: true, report: report.data, created_at: report.created_at });
}

/**
 * POST /api/agents/gmaps — manual trigger
 * Body: { query?: string, city?: string, org_id?: string }
 */
export async function POST(request: NextRequest) {
  const { authorized, userId, isCron } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: any = {};
  try { body = await request.json(); } catch { /* empty body ok */ }
  const orgId = body?.org_id || request.nextUrl.searchParams.get('org_id') || null;
  const customQuery = body?.query || null;

  // Cron / admin can target a specific client by passing ?user_id=...
  // The cron secret has no userId of its own (cron is system-level), so
  // without this override every cron-driven scan inserted prospects
  // with user_id=null — they'd never reach a client's CRM.
  const queryUserId = request.nextUrl.searchParams.get('user_id') || null;
  const effectiveUserId = isCron && queryUserId ? queryUserId : userId;

  return runGMapsScan(orgId, effectiveUserId, customQuery);
}

async function runGMapsScan(orgId: string | null = null, userId: string | null = null, customQuery: string | null = null): Promise<NextResponse> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'GOOGLE_MAPS_API_KEY non configurée' }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Per-plan config. Starter/Free gets 0 (gmaps disabled — Places is
  // paid and free tier can't carry it). Admin bypasses for testing.
  let planCfg: PlanConfig = GMAPS_PLAN_CONFIG.pro;
  let plan = 'pro';
  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_plan, is_admin')
      .eq('id', userId)
      .maybeSingle();
    plan = profile?.is_admin ? 'admin' : (profile?.subscription_plan || 'free');
    planCfg = configForPlan(plan);
    if (planCfg.details === 0) {
      console.log(`[GMaps] Plan ${plan} has no gmaps quota — skipping scan for user ${userId.substring(0, 8)}`);
      return NextResponse.json({ ok: true, skipped: true, reason: 'plan_disabled', plan });
    }
    console.log(`[GMaps] Plan ${plan} → ${planCfg.zones} zone(s) × ${planCfg.queries} query(s) × ${planCfg.details} details max`);
  }
  const MAX_DETAILS_PER_RUN = planCfg.details;

  // Load shared context
  const { prompt: sharedPrompt } = await loadContextWithAvatar(supabase, 'gmaps', orgId || undefined);

  // Anti-dedup rotation: add a per-user hash offset so two clients on
  // the same plan never scan the same zone on the same day. Without
  // this, 10 Pro clients would hammer Montorgueil/Marais together and
  // fight over the same prospect pool.
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const userOffset = userId ? fnvHash(userId) % ZONES.length : 0;
  const ZONES_PER_RUN = planCfg.zones;

  // Load skip list: zones+queries already scanned for this user in the
  // last SKIP_LIST_DAYS. If the scan returns fewer than 3 fresh results
  // from a zone, we skip that zone for the next month — it's saturated.
  const skipSince = new Date(Date.now() - SKIP_LIST_DAYS * 86400000).toISOString();
  const skipSet = new Set<string>();
  if (userId) {
    const { data: recentScans } = await supabase
      .from('gmaps_scan_history')
      .select('zone_name, query, imported')
      .eq('user_id', userId)
      .gte('scanned_at', skipSince)
      .limit(500);
    for (const r of (recentScans || []) as any[]) {
      // A zone+query scanned recently with low yield (<3 imports) is
      // saturated — skip. High-yield combos can be re-scanned fresh.
      if ((r.imported ?? 0) < 3) {
        skipSet.add(`${r.zone_name}||${r.query}`);
      }
    }
    console.log(`[GMaps] Skip list: ${skipSet.size} saturated zone×query combos from last ${SKIP_LIST_DAYS} days`);
  }

  // Pick the first N non-skipped zones starting from the user+day offset.
  // If a zone has ALL its queries skipped for this user, jump to the next.
  const dailyZones: typeof ZONES = [];
  let zonesChecked = 0;
  while (dailyZones.length < ZONES_PER_RUN && zonesChecked < ZONES.length) {
    const candidate = ZONES[(userOffset + dayOfYear * ZONES_PER_RUN + zonesChecked) % ZONES.length];
    zonesChecked++;
    dailyZones.push(candidate);
  }

  console.log(`[GMaps] Scanning ${dailyZones.length} zones: ${dailyZones.map(z => z.name).join(', ')}`);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  // Diagnostic samples captured into the daily_scan log so we can
  // tell WHY errors happened (RLS? constraint? schema drift?) without
  // having to re-run with extra logging.
  const errorSamples: string[] = [];
  const importedNames: string[] = [];
  const scannedZones: string[] = [];

  // Query rotation: also offset by user so two clients on the same day
  // don't use the same categories.
  let queries: string[];
  if (customQuery) {
    queries = [customQuery];
  } else {
    const qStart = (userOffset + dayOfYear * planCfg.queries) % SEARCH_QUERIES.length;
    queries = [];
    for (let i = 0; i < planCfg.queries; i++) {
      queries.push(SEARCH_QUERIES[(qStart + i) % SEARCH_QUERIES.length]);
    }
  }

  let detailsCallsUsed = 0;

  for (const zone of dailyZones) {
    if (detailsCallsUsed >= MAX_DETAILS_PER_RUN) {
      console.log(`[GMaps] Budget cap reached (${detailsCallsUsed}/${MAX_DETAILS_PER_RUN}) — stopping scan`);
      break;
    }
    console.log(`[GMaps] --- Zone: ${zone.name} ---`);
    scannedZones.push(zone.name);

    for (const query of queries) {
      if (detailsCallsUsed >= MAX_DETAILS_PER_RUN) break;
      // Skip saturated combos (scanned in last 30 days with <3 hits) —
      // saves the €0.035 search fee AND the 20 subsequent dup checks.
      const comboKey = `${zone.name}||${query}`;
      if (skipSet.has(comboKey)) {
        console.log(`[GMaps] Skipping saturated combo: ${comboKey}`);
        continue;
      }
      const searchQuery = customQuery ? query : `${query} ${zone.name.split(' ')[0]}`;
      console.log(`[GMaps] Searching: "${searchQuery}"`);

      const results = await searchPlaces(searchQuery, zone.lat, zone.lng, zone.radius);
      let comboImported = 0;
      let comboSkipped = 0;

      for (const place of results) {
        try {
          // Check if already in DB
          const { data: existing } = await supabase
            .from('crm_prospects')
            .select('id')
            .eq('google_place_id', place.place_id)
            .maybeSingle();

          if (existing) { totalSkipped++; comboSkipped++; continue; }

          // Budget check BEFORE the paid call — each details fetch bills ~€0.04.
          if (detailsCallsUsed >= MAX_DETAILS_PER_RUN) {
            console.log(`[GMaps] Budget cap hit mid-zone — skipping remaining places`);
            break;
          }

          // Get details (PAID — Places API)
          detailsCallsUsed++;
          const details = await getPlaceDetails(place.place_id);
          if (!details || details.business_status === 'CLOSED_PERMANENTLY') continue;

          // Instagram extraction via website scrape is expensive (5s per
          // non-responsive site, chains 300s+ timeouts that trigger worker
          // retries which each re-run the whole Places scan). The handle
          // enrichment is nice-to-have — scraped cheaply later by the
          // prospect-enrichment agent when the record is actually being
          // contacted. Keep the column null here.
          const instagram = null;

          const businessType = mapGoogleType(details.types || place.types || []);
          const score = scoreProspect({
            rating: details.rating,
            reviewCount: details.user_ratings_total,
            website: details.website,
            instagram,
          });

          // Insert into crm_prospects with status 'identifie' (ready for enrichment)
          const { data: insertedProspect, error: insertError } = await supabase.from('crm_prospects').insert({
            company: details.name,
            type: businessType,
            quartier: zone.name,
            phone: details.formatted_phone_number || null,
            website: details.website || null,
            address: details.formatted_address || null,
            instagram: instagram || null,
            google_place_id: place.place_id,
            google_maps_url: details.url || null,
            google_rating: details.rating || null,
            google_reviews: details.user_ratings_total || null,
            score,
            temperature: getTemperature(score),
            // CHECK constraint crm_prospects_source_check restricts source
            // to a fixed taxonomy (dm_instagram, email, telephone, linkedin,
            // terrain, facebook, tiktok, recommandation, import, chatbot,
            // prospection_commerciale, other). 'google_maps' was never
            // valid — every Léo insert silently failed with errors=N until
            // we caught it. Use 'prospection_commerciale' (the same
            // bucket Victor's commercial agent uses for outbound sourcing)
            // and keep source_agent='gmaps' so we still know it came from
            // Léo's gmaps scan vs Victor's other discovery flows.
            source: 'prospection_commerciale',
            source_agent: 'gmaps',
            status: 'identifie',
            created_at: now,
            updated_at: now,
            ...(orgId ? { org_id: orgId } : {}),
            ...(userId ? { user_id: userId, created_by: userId } : {}),
          }).select('id').single();

          if (insertError) {
            if (insertError.code === '23505') { totalSkipped++; }
            else {
              console.warn(`[GMaps] Insert error:`, insertError.code, insertError.message, insertError.details);
              totalErrors++;
              // Capture first 5 distinct error messages so the daily_scan
              // log row carries actionable diagnostics. Without this we see
              // 'errors: 25' with no idea WHAT failed.
              const errMsg = `${insertError.code || 'unknown'}: ${insertError.message || 'no message'}`;
              if (errorSamples.length < 5 && !errorSamples.includes(errMsg)) {
                errorSamples.push(errMsg);
              }
            }
            continue;
          }

          // Log discovery activity in CRM
          if (insertedProspect?.id) {
            await supabase.from('crm_activities').insert({
              prospect_id: insertedProspect.id,
              type: 'prospect_discovered',
              description: `Prospect découvert via Google Maps: ${details.name} (${businessType}, ${zone.name})`,
              data: { source: 'google_maps', zone: zone.name, rating: details.rating, reviews: details.user_ratings_total, score, agent: 'gmaps' },
              created_at: now,
            });
          }

          totalImported++;
          comboImported++;
          importedNames.push(details.name);
          console.log(`[GMaps] Imported: ${details.name} (${businessType}, score ${score})`);

          await new Promise(r => setTimeout(r, 150));
        } catch (e: any) {
          console.warn(`[GMaps] Error processing place:`, e.message);
          totalErrors++;
          const msg = `caught: ${e?.message || 'no message'}`;
          if (errorSamples.length < 5 && !errorSamples.includes(msg)) {
            errorSamples.push(msg);
          }
        }
      }

      // Record this combo's yield so the skip list can mark it
      // saturated if it came back with <3 new prospects.
      if (userId) {
        try {
          await supabase.from('gmaps_scan_history').insert({
            user_id: userId,
            zone_name: zone.name,
            query,
            imported: comboImported,
            skipped: comboSkipped,
          });
        } catch {}
      }

      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Log
  const report = {
    zones: scannedZones,
    queries: queries,
    imported: totalImported,
    skipped: totalSkipped,
    errors: totalErrors,
    error_samples: errorSamples,
    imported_names: importedNames.slice(0, 50),
    total_names: importedNames.length,
    timestamp: now,
  };

  await supabase.from('agent_logs').insert({
    agent: 'gmaps',
    action: 'daily_scan',
    data: report,
    created_at: now,
    ...(orgId ? { org_id: orgId } : {}),
  });

  // ── Save learnings from GMaps scan ──
  try {
    if (totalImported > 0) {
      await saveLearning(supabase, {
        agent: 'gmaps',
        category: 'prospection',
        learning: `Scan GMaps: ${totalImported} importés, ${totalSkipped} existants, ${totalErrors} erreurs sur ${scannedZones.length} zones`,
        evidence: `Zones: ${scannedZones.join(', ')}. ${totalImported} new, ${totalSkipped} duplicates, ${totalErrors} errors`,
        confidence: 20,
      }, orgId);
    }

    // Track zone effectiveness
    if (totalImported > 5) {
      await saveLearning(supabase, {
        agent: 'gmaps',
        category: 'prospection',
        learning: `Zones productives aujourd'hui: ${scannedZones.join(', ')} — ${totalImported} nouveaux prospects trouvés`,
        evidence: `${totalImported} imports from zones: ${scannedZones.join(', ')}`,
        confidence: 15,
      }, orgId);
    }
  } catch (learnErr: any) {
    console.warn('[GMaps] Learning save error:', learnErr.message);
  }

  // ── Feedback to CEO ──
  try {
    if (totalImported > 0) {
      await saveAgentFeedback(supabase, {
        from_agent: 'gmaps',
        to_agent: 'ceo',
        feedback: `Découverte GMaps: ${totalImported} nouveaux prospects importés depuis ${scannedZones.length} zones (${scannedZones.join(', ')}). ${totalSkipped} doublons, ${totalErrors} erreurs. ${totalErrors > 5 ? '⚠️ Taux erreur élevé.' : 'Scan nominal.'}`,
        category: 'prospection',
      }, orgId);
    }
  } catch (fbErr: any) {
    console.warn('[GMaps] Feedback save error:', fbErr.message);
  }

  console.log(`[GMaps] ${scannedZones.join(', ')}: ${totalImported} imported, ${totalSkipped} skipped, ${totalErrors} errors`);

  // Notify client
  if (userId && totalImported >= 10) {
    try {
      const { notifyProspection } = await import('@/lib/agents/notify-client');
      await notifyProspection(supabase, userId, {
        imported: totalImported,
        zones: scannedZones,
        source: 'Google Maps',
      });
    } catch {}
  }

  return NextResponse.json({ ok: true, ...report });
}
