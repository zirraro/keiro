/**
 * Pixabay images + videos helper — gives Léna a free royalty-free
 * library to use as REFERENCE or B-ROLL instead of generating from
 * scratch every time.
 *
 * Founder ask 2026-06-07: "tu peux quand meme set up pixabay pour les
 * images et video si ca correspond au business d'un client ca peut etre
 * pas mal pour inspiration travail retravail qualité non ? ca nous fait
 * une bibliotheque gratuit donc pas de generation alors modifications".
 *
 * Use cases:
 *   1. INSPIRATION — pull 5-10 stock visuals matching the client's
 *      business_type, surface in the Lena panel as "starting points"
 *      the user can pick from before generation.
 *   2. i2i BASE — instead of t2i from scratch, use a Pixabay photo as
 *      the i2i base + Seedream lifts it to brand quality. Often
 *      cheaper and feels more "documentary real" than pure t2i.
 *   3. VIDEO B-ROLL — short Pixabay clips can be intercut between
 *      Seedance i2v segments for variety on TikTok long-form.
 *
 * Licensing: Pixabay Content License — commercial use OK, no
 * attribution required, NO redistribution as standalone files (we
 * always embed in a composite/derivative work).
 *
 * Required env: PIXABAY_API_KEY (free at pixabay.com/accounts/api/).
 */

const PIXABAY_IMG_ENDPOINT = 'https://pixabay.com/api/';
const PIXABAY_VID_ENDPOINT = 'https://pixabay.com/api/videos/';

export type PixabayCategory =
  | 'backgrounds' | 'fashion' | 'nature' | 'science' | 'education'
  | 'feelings' | 'health' | 'people' | 'religion' | 'places' | 'animals'
  | 'industry' | 'computer' | 'food' | 'sports' | 'transportation'
  | 'travel' | 'buildings' | 'business' | 'music';

export interface PixabayImage {
  id: number;
  pageURL: string;
  previewURL: string;
  webformatURL: string;       // 640px max
  largeImageURL: string;      // 1280px max
  tags: string;
  views: number;
  downloads: number;
}

export interface PixabayVideo {
  id: number;
  pageURL: string;
  duration: number;
  tags: string;
  thumbnail: string;
  mp4_url_medium: string;     // 1920×1080 if available
  mp4_url_small: string;      // 1280×720
  mp4_url_tiny: string;       // 960×540
}

/**
 * Search images by free-form query + optional category. Returns up to
 * `count` results sorted by popularity. Empty on missing key / error.
 */
export async function searchPixabayImages(opts: {
  query: string;
  category?: PixabayCategory;
  count?: number;
  orientation?: 'horizontal' | 'vertical' | 'all';
  lang?: 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt';
}): Promise<PixabayImage[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) {
    console.warn('[pixabay] PIXABAY_API_KEY not set');
    return [];
  }
  const params = new URLSearchParams({
    key,
    q: opts.query,
    image_type: 'photo',
    per_page: String(Math.max(3, Math.min(50, opts.count ?? 10))),
    safesearch: 'true',
    order: 'popular',
    orientation: opts.orientation || 'all',
    lang: opts.lang || 'fr',
  });
  if (opts.category) params.set('category', opts.category);
  try {
    const r = await fetch(`${PIXABAY_IMG_ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      console.warn('[pixabay] images HTTP', r.status);
      return [];
    }
    const data = await r.json();
    return (data.hits || []).map((h: any) => ({
      id: h.id,
      pageURL: h.pageURL,
      previewURL: h.previewURL,
      webformatURL: h.webformatURL,
      largeImageURL: h.largeImageURL,
      tags: h.tags || '',
      views: h.views || 0,
      downloads: h.downloads || 0,
    }));
  } catch (e: any) {
    console.warn('[pixabay] images threw:', e?.message);
    return [];
  }
}

/**
 * Search videos by free-form query. Returns up to `count` results.
 * Each video exposes multiple resolutions (tiny/small/medium) — caller
 * picks based on bandwidth + use case.
 */
export async function searchPixabayVideos(opts: {
  query: string;
  category?: PixabayCategory;
  count?: number;
  minDurationSec?: number;
  lang?: 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt';
}): Promise<PixabayVideo[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) {
    console.warn('[pixabay] PIXABAY_API_KEY not set');
    return [];
  }
  const params = new URLSearchParams({
    key,
    q: opts.query,
    video_type: 'film',
    per_page: String(Math.max(3, Math.min(50, opts.count ?? 10))),
    safesearch: 'true',
    order: 'popular',
    lang: opts.lang || 'fr',
  });
  if (opts.category) params.set('category', opts.category);
  try {
    const r = await fetch(`${PIXABAY_VID_ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      console.warn('[pixabay] videos HTTP', r.status);
      return [];
    }
    const data = await r.json();
    const minDur = opts.minDurationSec ?? 0;
    return (data.hits || [])
      .filter((h: any) => (h.duration || 0) >= minDur)
      .map((h: any) => ({
        id: h.id,
        pageURL: h.pageURL,
        duration: h.duration || 0,
        tags: h.tags || '',
        thumbnail: h.videos?.medium?.thumbnail || h.videos?.small?.thumbnail || '',
        mp4_url_medium: h.videos?.medium?.url || '',
        mp4_url_small: h.videos?.small?.url || '',
        mp4_url_tiny: h.videos?.tiny?.url || '',
      }));
  } catch (e: any) {
    console.warn('[pixabay] videos threw:', e?.message);
    return [];
  }
}

/**
 * Pick a single best-fitting image for a business type. Maps business
 * type → Pixabay category + query keywords. Returns one image or null.
 */
export async function pickBusinessReferenceImage(businessType: string, extraKeywords?: string): Promise<PixabayImage | null> {
  const t = (businessType || '').toLowerCase();
  let category: PixabayCategory | undefined;
  let kw = '';
  // Lightweight router — extend as more business types are seen.
  if (/restaur|bistro|brasserie|gastrono/.test(t)) { category = 'food'; kw = 'restaurant interior'; }
  else if (/coiffeur|salon|barbi|beauté/.test(t)) { category = 'fashion'; kw = 'salon interior beauty'; }
  else if (/boulang|patisserie/.test(t)) { category = 'food'; kw = 'bakery interior bread'; }
  else if (/fleurist/.test(t)) { category = 'nature'; kw = 'florist flowers shop'; }
  else if (/cafe|coffee/.test(t)) { category = 'food'; kw = 'cafe interior coffee'; }
  else if (/hotel|spa/.test(t)) { category = 'travel'; kw = 'hotel lobby spa'; }
  else if (/sport|fitness|gym/.test(t)) { category = 'sports'; kw = 'gym fitness training'; }
  else if (/medic|dent|kiné|santé/.test(t)) { category = 'health'; kw = 'medical clinic consultation'; }
  else { category = 'business'; kw = businessType.substring(0, 60); }
  const query = (extraKeywords ? extraKeywords + ' ' + kw : kw).trim();
  const results = await searchPixabayImages({ query, category, count: 5 });
  if (results.length === 0) return null;
  return results[Math.floor(Math.random() * Math.min(3, results.length))];
}
