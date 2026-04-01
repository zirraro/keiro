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

const MAX_RESULTS_PER_QUERY = 20; // Scale up for 200+ prospects/day

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
    return runGMapsScan(orgId);
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
  const { authorized, userId } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: any = {};
  try { body = await request.json(); } catch { /* empty body ok */ }
  const orgId = body?.org_id || request.nextUrl.searchParams.get('org_id') || null;
  const customQuery = body?.query || null;

  return runGMapsScan(orgId, userId, customQuery);
}

async function runGMapsScan(orgId: string | null = null, userId: string | null = null, customQuery: string | null = null): Promise<NextResponse> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'GOOGLE_MAPS_API_KEY non configurée' }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Load shared context
  const { prompt: sharedPrompt } = await loadContextWithAvatar(supabase, 'gmaps', orgId || undefined);

  // Rotate zones: scan 5 zones per run for higher volume
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const ZONES_PER_RUN = 5;
  const startIdx = (dayOfYear * ZONES_PER_RUN) % ZONES.length;
  const dailyZones = [];
  for (let i = 0; i < ZONES_PER_RUN; i++) {
    dailyZones.push(ZONES[(startIdx + i) % ZONES.length]);
  }

  console.log(`[GMaps] Scanning ${dailyZones.length} zones: ${dailyZones.map(z => z.name).join(', ')}`);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const importedNames: string[] = [];
  const scannedZones: string[] = [];

  // Use custom query if provided, otherwise use ALL 13 default queries
  const queries = customQuery ? [customQuery] : [...SEARCH_QUERIES];

  for (const zone of dailyZones) {
    console.log(`[GMaps] --- Zone: ${zone.name} ---`);
    scannedZones.push(zone.name);

    for (const query of queries) {
      const searchQuery = customQuery ? query : `${query} ${zone.name.split(' ')[0]}`;
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

          // Insert into crm_prospects with status 'identifie' (ready for enrichment)
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
            status: 'identifie',
            created_at: now,
            updated_at: now,
            ...(orgId ? { org_id: orgId } : {}),
            ...(userId ? { user_id: userId, created_by: userId } : {}),
          });

          if (insertError) {
            if (insertError.code === '23505') { totalSkipped++; }
            else { console.warn(`[GMaps] Insert error:`, insertError.message); totalErrors++; }
            continue;
          }

          totalImported++;
          importedNames.push(details.name);
          console.log(`[GMaps] Imported: ${details.name} (${businessType}, score ${score})`);

          await new Promise(r => setTimeout(r, 150));
        } catch (e: any) {
          console.warn(`[GMaps] Error processing place:`, e.message);
          totalErrors++;
        }
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
  if (userId && totalImported > 0) {
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
