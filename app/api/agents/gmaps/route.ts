import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function verifyAuth(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return { authorized: true, isCron: true };

  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return { authorized: false };
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    if (profile?.is_admin) return { authorized: true, isAdmin: true };
  } catch {}
  return { authorized: false };
}

// Search queries by business type
const SEARCH_QUERIES = [
  'restaurant', 'bistrot', 'boutique mode', 'coiffeur', 'barbier',
  'coach sportif', 'salle de sport', 'fleuriste', 'caviste',
  'salon de beauté', 'épicerie fine', 'traiteur', 'fromagerie',
];

// Zones to scrape (rotate daily)
const ZONES = [
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
];

const MAX_RESULTS_PER_QUERY = 5; // Keep API costs low

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

  if (isCron) {
    return runGMapsScan();
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
 */
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  return runGMapsScan();
}

async function runGMapsScan(): Promise<NextResponse> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'GOOGLE_MAPS_API_KEY non configurée' }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Rotate zones: use day of year
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const zone = ZONES[dayOfYear % ZONES.length];

  console.log(`[GMaps] Scanning zone: ${zone.name}`);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const importedNames: string[] = [];

  // Pick 4 random queries per run to limit API costs
  const shuffled = [...SEARCH_QUERIES].sort(() => Math.random() - 0.5);
  const queries = shuffled.slice(0, 4);

  for (const query of queries) {
    const searchQuery = `${query} ${zone.name.split(' ')[0]}`;
    console.log(`[GMaps] Searching: "${searchQuery}"`);

    const results = await searchPlaces(searchQuery, zone.lat, zone.lng, zone.radius);

    for (const place of results) {
      try {
        // Check if already in DB
        const { data: existing } = await supabase
          .from('crm_prospects')
          .select('id')
          .eq('google_place_id', place.place_id)
          .maybeSingle();

        if (existing) { totalSkipped++; continue; }

        // Get details
        const details = await getPlaceDetails(place.place_id);
        if (!details || details.business_status === 'CLOSED_PERMANENTLY') continue;

        // Try to find Instagram
        const instagram = details.website ? await findInstagramFromWebsite(details.website) : null;

        const businessType = mapGoogleType(details.types || place.types || []);
        const score = scoreProspect({
          rating: details.rating,
          reviewCount: details.user_ratings_total,
          website: details.website,
          instagram,
        });

        // Insert into crm_prospects
        const { error: insertError } = await supabase.from('crm_prospects').insert({
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
          source: 'google_maps',
          source_agent: 'gmaps',
          status: 'new',
          created_at: now,
          updated_at: now,
        });

        if (insertError) {
          // Likely duplicate
          if (insertError.code === '23505') { totalSkipped++; }
          else { console.warn(`[GMaps] Insert error:`, insertError.message); totalErrors++; }
          continue;
        }

        totalImported++;
        importedNames.push(details.name);
        console.log(`[GMaps] Imported: ${details.name} (${businessType}, score ${score})`);

        // Rate limiting
        await new Promise(r => setTimeout(r, 200));
      } catch (e: any) {
        console.warn(`[GMaps] Error processing place:`, e.message);
        totalErrors++;
      }
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // Log
  const report = {
    zone: zone.name,
    queries: queries,
    imported: totalImported,
    skipped: totalSkipped,
    errors: totalErrors,
    imported_names: importedNames,
    timestamp: now,
  };

  await supabase.from('agent_logs').insert({
    agent: 'gmaps',
    action: 'daily_scan',
    data: report,
    created_at: now,
  });

  console.log(`[GMaps] ${zone.name}: ${totalImported} imported, ${totalSkipped} skipped, ${totalErrors} errors`);

  return NextResponse.json({ ok: true, ...report });
}
