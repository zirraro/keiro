/**
 * Google Business Profile API integration
 * Requires GOOGLE_PLACES_API_KEY env var
 * Manages Google Business Profile, reviews, posts, and local visibility
 */

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BusinessReview {
  author: string;
  rating: number;
  text: string;
  time: string;
  reply?: string;
}

export interface BusinessProfile {
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number;
  totalReviews: number;
  categories: string[];
  hours: Record<string, string>;
  photos: number;
  placeId: string;
}

export interface BusinessSearchResult {
  placeId: string;
  name: string;
  address: string;
  rating: number;
  totalReviews: number;
}

// ---------------------------------------------------------------------------
// Cache (24 hours for place data)
// ---------------------------------------------------------------------------

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isGoogleBusinessConfigured(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not configured');
  return key;
}

const DETAIL_FIELDS = [
  'displayName',
  'formattedAddress',
  'nationalPhoneNumber',
  'websiteUri',
  'rating',
  'userRatingCount',
  'reviews',
  'photos',
  'currentOpeningHours',
  'types',
  'primaryType',
  'id',
].join(',');

const DAY_NAMES: Record<number, string> = {
  0: 'Dimanche',
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
};

function parseHours(
  openingHours?: {
    periods?: Array<{
      open: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }>;
    weekdayDescriptions?: string[];
  },
): Record<string, string> {
  const hours: Record<string, string> = {};

  if (openingHours?.weekdayDescriptions) {
    for (const desc of openingHours.weekdayDescriptions) {
      const [day, ...rest] = desc.split(': ');
      if (day) hours[day.trim()] = rest.join(': ').trim();
    }
    return hours;
  }

  if (openingHours?.periods) {
    for (const period of openingHours.periods) {
      const dayName = DAY_NAMES[period.open.day] ?? `Jour ${period.open.day}`;
      const openTime = `${String(period.open.hour).padStart(2, '0')}:${String(period.open.minute).padStart(2, '0')}`;
      if (period.close) {
        const closeTime = `${String(period.close.hour).padStart(2, '0')}:${String(period.close.minute).padStart(2, '0')}`;
        hours[dayName] = `${openTime} - ${closeTime}`;
      } else {
        hours[dayName] = `${openTime} - Ouvert 24h`;
      }
    }
  }

  return hours;
}

function parseReviews(
  raw?: Array<{
    authorAttribution?: { displayName?: string };
    rating?: number;
    text?: { text?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
    authorReply?: { text?: string };
  }>,
): BusinessReview[] {
  if (!raw) return [];
  return raw.map((r) => ({
    author: r.authorAttribution?.displayName ?? 'Anonyme',
    rating: r.rating ?? 0,
    text: r.text?.text ?? '',
    time: r.relativePublishTimeDescription ?? r.publishTime ?? '',
    reply: r.authorReply?.text,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch full business profile from Google Places API.
 */
export async function getBusinessProfile(placeId: string): Promise<BusinessProfile | null> {
  const cacheKey = `profile:${placeId}`;
  const cached = getCached<BusinessProfile>(cacheKey);
  if (cached) return cached;

  if (!isGoogleBusinessConfigured()) return null;

  try {
    const res = await fetch(`${PLACES_API_BASE}/places/${placeId}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getApiKey(),
        'X-Goog-FieldMask': DETAIL_FIELDS,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[google-business] Places API ${res.status}: ${body}`);
      return null;
    }

    const data = await res.json();

    const profile: BusinessProfile = {
      placeId,
      name: data.displayName?.text ?? '',
      address: data.formattedAddress ?? '',
      phone: data.nationalPhoneNumber ?? '',
      website: data.websiteUri ?? '',
      rating: data.rating ?? 0,
      totalReviews: data.userRatingCount ?? 0,
      categories: data.types ?? (data.primaryType ? [data.primaryType] : []),
      hours: parseHours(data.currentOpeningHours),
      photos: data.photos?.length ?? 0,
    };

    setCache(cacheKey, profile);
    return profile;
  } catch (err) {
    console.error('[google-business] getBusinessProfile error:', err);
    return null;
  }
}

/**
 * Search for a business by name and city using Google Places text search.
 */
export async function searchBusiness(
  name: string,
  city: string,
): Promise<BusinessSearchResult[]> {
  const cacheKey = `search:${name}:${city}`;
  const cached = getCached<BusinessSearchResult[]>(cacheKey);
  if (cached) return cached;

  if (!isGoogleBusinessConfigured()) return [];

  try {
    const res = await fetch(`${PLACES_API_BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getApiKey(),
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({
        textQuery: `${name} ${city}`,
        languageCode: 'fr',
        maxResultCount: 5,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[google-business] searchText ${res.status}: ${body}`);
      return [];
    }

    const data = await res.json();
    const results: BusinessSearchResult[] = (data.places ?? []).map(
      (p: {
        id: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        rating?: number;
        userRatingCount?: number;
      }) => ({
        placeId: p.id,
        name: p.displayName?.text ?? '',
        address: p.formattedAddress ?? '',
        rating: p.rating ?? 0,
        totalReviews: p.userRatingCount ?? 0,
      }),
    );

    setCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error('[google-business] searchBusiness error:', err);
    return [];
  }
}

/**
 * Get reviews for a business. Reviews are included in place details.
 */
export async function getBusinessReviews(placeId: string): Promise<BusinessReview[]> {
  const cacheKey = `reviews:${placeId}`;
  const cached = getCached<BusinessReview[]>(cacheKey);
  if (cached) return cached;

  if (!isGoogleBusinessConfigured()) return [];

  try {
    const res = await fetch(`${PLACES_API_BASE}/places/${placeId}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getApiKey(),
        'X-Goog-FieldMask': 'reviews',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[google-business] reviews ${res.status}: ${body}`);
      return [];
    }

    const data = await res.json();
    const reviews = parseReviews(data.reviews);

    setCache(cacheKey, reviews);
    return reviews;
  } catch (err) {
    console.error('[google-business] getBusinessReviews error:', err);
    return [];
  }
}

/**
 * Analyze a Google Maps URL to extract place ID and name.
 * Supports various Google Maps URL formats:
 *   - https://www.google.com/maps/place/...
 *   - https://maps.google.com/?cid=...
 *   - https://goo.gl/maps/...
 *   - https://maps.app.goo.gl/...
 */
export async function analyzeGoogleMapsUrl(
  url: string,
): Promise<{ placeId: string; name: string } | null> {
  if (!url) return null;

  // Try to extract place ID directly from URL
  // Format: /place/Name/@lat,lng,zoom/data=...!1s<placeId>
  const placeIdMatch = url.match(/!1s(ChIJ[A-Za-z0-9_-]+)/);
  if (placeIdMatch) {
    const placeId = placeIdMatch[1];
    const nameMatch = url.match(/\/place\/([^/@]+)/);
    const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : '';
    return { placeId, name };
  }

  // Format: place_id= query parameter
  const placeIdParam = url.match(/[?&]place_id=([^&]+)/);
  if (placeIdParam) {
    return { placeId: placeIdParam[1], name: '' };
  }

  // Format: cid= (customer ID, not directly a place ID but can be used for lookup)
  const cidMatch = url.match(/[?&]cid=(\d+)/);
  if (cidMatch) {
    // CID requires a lookup; extract the name from URL if possible
    const nameFromUrl = url.match(/\/place\/([^/@]+)/);
    const name = nameFromUrl
      ? decodeURIComponent(nameFromUrl[1].replace(/\+/g, ' '))
      : '';
    // Try to search for the place by name to get its place ID
    if (name && isGoogleBusinessConfigured()) {
      const results = await searchBusiness(name, '');
      if (results.length > 0) {
        return { placeId: results[0].placeId, name: results[0].name };
      }
    }
    return null;
  }

  // Extract name from /place/Name/ format and search
  const nameMatch = url.match(/\/place\/([^/@]+)/);
  if (nameMatch) {
    const name = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
    if (isGoogleBusinessConfigured()) {
      const results = await searchBusiness(name, '');
      if (results.length > 0) {
        return { placeId: results[0].placeId, name: results[0].name };
      }
    }
    return { placeId: '', name };
  }

  // Shortened URLs (goo.gl, maps.app.goo.gl) — follow redirect to get full URL
  if (url.includes('goo.gl/')) {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
      const location = res.headers.get('location');
      if (location) {
        return analyzeGoogleMapsUrl(location);
      }
    } catch {
      // Redirect follow failed, return null
    }
  }

  return null;
}

/**
 * Generate local SEO recommendations based on a business profile and its reviews.
 */
export function generateLocalSEORecommendations(
  profile: BusinessProfile,
  reviews: BusinessReview[],
): string[] {
  const recommendations: string[] = [];

  // Rating analysis
  if (profile.rating < 4.0) {
    recommendations.push(
      `Note moyenne de ${profile.rating}/5 — priorite absolue : ameliorer l'experience client et repondre a chaque avis negatif de maniere personnalisee.`,
    );
  } else if (profile.rating < 4.5) {
    recommendations.push(
      `Note de ${profile.rating}/5 — bonne base. Encouragez vos clients satisfaits a laisser un avis pour atteindre 4.5+.`,
    );
  } else {
    recommendations.push(
      `Excellente note de ${profile.rating}/5 — mettez cette note en avant dans vos visuels et publicites.`,
    );
  }

  // Review count
  if (profile.totalReviews < 20) {
    recommendations.push(
      `Seulement ${profile.totalReviews} avis — objectif : atteindre 50 avis. Mettez en place un QR code en caisse/comptoir pointant vers la page Google.`,
    );
  } else if (profile.totalReviews < 100) {
    recommendations.push(
      `${profile.totalReviews} avis — bon debut. Automatisez la demande d'avis (SMS/email post-visite) pour passer la barre des 100.`,
    );
  }

  // Photos
  if (profile.photos < 5) {
    recommendations.push(
      'Tres peu de photos — ajoutez au minimum 10 photos de qualite (facade, interieur, produits/services, equipe). Les fiches avec 100+ photos recoivent 520% plus d\'appels.',
    );
  } else if (profile.photos < 20) {
    recommendations.push(
      `${profile.photos} photos — correct mais insuffisant. Ajoutez des photos regulierement (1-2/semaine). Incluez des photos de l'equipe et des coulisses.`,
    );
  }

  // Hours
  if (Object.keys(profile.hours).length === 0) {
    recommendations.push(
      'Horaires non renseignes — URGENT : renseignez vos horaires d\'ouverture. Les fiches sans horaires sont penalisees dans les resultats locaux.',
    );
  }

  // Website
  if (!profile.website) {
    recommendations.push(
      'Aucun site web renseigne — ajoutez votre site web ou au minimum votre page Instagram/Facebook.',
    );
  }

  // Phone
  if (!profile.phone) {
    recommendations.push(
      'Numero de telephone manquant — ajoutez votre numero pour faciliter le contact direct.',
    );
  }

  // Review responses
  const unansweredNegative = reviews.filter((r) => r.rating <= 3 && !r.reply);
  if (unansweredNegative.length > 0) {
    recommendations.push(
      `${unansweredNegative.length} avis negatif(s) sans reponse — repondez rapidement et avec empathie. Google valorise les proprietaires reactifs.`,
    );
  }

  const unansweredPositive = reviews.filter((r) => r.rating >= 4 && !r.reply);
  if (unansweredPositive.length > 2) {
    recommendations.push(
      `${unansweredPositive.length} avis positifs sans reponse — remerciez chaque client, meme brievement. Cela encourage d'autres avis.`,
    );
  }

  // Google Posts
  recommendations.push(
    'Publiez des Google Posts regulierement (1-2/semaine) : promotions, evenements, nouveautes. Cela ameliore votre visibilite et votre engagement.',
  );

  // Categories
  if (profile.categories.length <= 1) {
    recommendations.push(
      'Une seule categorie — ajoutez des categories secondaires pertinentes pour apparaitre dans plus de recherches.',
    );
  }

  return recommendations;
}

/**
 * Format business data into a string suitable for injection into an agent prompt.
 */
export function formatBusinessProfileForPrompt(
  profile: BusinessProfile,
  reviews: BusinessReview[],
): string {
  const lines: string[] = ['## Fiche Google Business'];
  lines.push('');
  lines.push(`- **Nom** : ${profile.name}`);
  lines.push(`- **Adresse** : ${profile.address}`);
  if (profile.phone) lines.push(`- **Telephone** : ${profile.phone}`);
  if (profile.website) lines.push(`- **Site web** : ${profile.website}`);
  lines.push(`- **Note** : ${profile.rating}/5 (${profile.totalReviews} avis)`);
  lines.push(`- **Photos** : ${profile.photos}`);

  if (profile.categories.length > 0) {
    lines.push(`- **Categories** : ${profile.categories.join(', ')}`);
  }

  if (Object.keys(profile.hours).length > 0) {
    lines.push('');
    lines.push('### Horaires');
    for (const [day, time] of Object.entries(profile.hours)) {
      lines.push(`- ${day} : ${time}`);
    }
  }

  if (reviews.length > 0) {
    lines.push('');
    lines.push(`### Derniers avis (${reviews.length})`);

    // Rating distribution
    const distribution = [5, 4, 3, 2, 1].map((star) => {
      const count = reviews.filter((r) => r.rating === star).length;
      return `${star} etoiles: ${count}`;
    });
    lines.push(`Distribution : ${distribution.join(', ')}`);

    lines.push('');
    for (const r of reviews.slice(0, 5)) {
      const stars = '\u2605'.repeat(r.rating) + '\u2606'.repeat(5 - r.rating);
      lines.push(`- ${stars} **${r.author}** (${r.time}): "${r.text.slice(0, 200)}${r.text.length > 200 ? '...' : ''}"`);
      if (r.reply) {
        lines.push(`  > Reponse du proprietaire : "${r.reply.slice(0, 150)}${r.reply.length > 150 ? '...' : ''}"`);
      } else {
        lines.push('  > *Pas de reponse*');
      }
    }
  }

  // SEO recommendations
  const recs = generateLocalSEORecommendations(profile, reviews);
  if (recs.length > 0) {
    lines.push('');
    lines.push('### Recommandations SEO local');
    for (const rec of recs) {
      lines.push(`- ${rec}`);
    }
  }

  return lines.join('\n');
}
