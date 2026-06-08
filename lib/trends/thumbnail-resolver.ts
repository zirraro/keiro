/**
 * Resolve a thumbnail image URL for a given trend keyword/title.
 *
 * Founder ask 2026-06-08: the trend cards (Insta/TikTok/Google/LinkedIn)
 * on the /generate page were rendering with just a gradient because the
 * upstream RSS/scrape sources rarely include an image. Goal: a real
 * thumbnail coherent with the trend's topic so the page reads visually.
 *
 * Strategy (cheap first):
 *  1. DB cache `trend_thumbnails(slug, image_url, source)` — reuse forever
 *     once resolved for any client (trends repeat across regions/days).
 *  2. Pixabay image search by keyword — free, royalty-free, fast.
 *  3. If Pixabay returns nothing, leave it empty (UI falls back to
 *     gradient). We do NOT spend Seedream/Gemini budget on a card the
 *     user might never click.
 *
 * The resolver runs in-memory in fetchAllTrends() so trends arrive at
 * the client already enriched.
 */

import { createClient } from '@supabase/supabase-js';
import { searchPixabayImages } from '@/lib/stock/pixabay';

const SLUG_TTL_DAYS = 28; // re-resolve after 4 weeks in case a stale image looks wrong

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const memCache = new Map<string, string | null>();

async function lookupCached(slug: string): Promise<string | null | undefined> {
  if (memCache.has(slug)) return memCache.get(slug);
  const supabase = sb();
  if (!supabase) return undefined;
  try {
    const { data } = await supabase
      .from('trend_thumbnails')
      .select('image_url, updated_at')
      .eq('slug', slug)
      .maybeSingle();
    if (!data) return undefined;
    const ageDays = (Date.now() - new Date(data.updated_at).getTime()) / (24 * 3600 * 1000);
    if (ageDays > SLUG_TTL_DAYS) return undefined; // expired
    memCache.set(slug, data.image_url || null);
    return data.image_url || null;
  } catch {
    return undefined;
  }
}

async function persist(slug: string, query: string, url: string | null, source: string) {
  memCache.set(slug, url);
  const supabase = sb();
  if (!supabase) return;
  try {
    await supabase.from('trend_thumbnails').upsert({
      slug,
      query,
      image_url: url,
      source,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* table may not exist yet — ignore */
  }
}

/**
 * Wikipedia REST API summary endpoint — returns a thumbnail image for
 * any article title. Works great for named entities (people, places,
 * events, brands). Free, no auth, fast.
 */
async function wikipediaThumbnail(query: string, lang: 'fr' | 'en' = 'fr'): Promise<string | null> {
  const title = encodeURIComponent(query.replace(/\s+/g, '_'));
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'KeiroAI/1.0 (https://keiroai.com)' },
    });
    if (!r.ok) return null;
    const data: any = await r.json();
    // originalimage is usually a larger version; thumbnail is small (~50-300px)
    return data?.originalimage?.source || data?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

async function resolveOne(rawQuery: string): Promise<string | null> {
  const query = (rawQuery || '').trim();
  if (!query) return null;
  const slug = slugify(query);
  if (!slug) return null;

  const cached = await lookupCached(slug);
  if (cached !== undefined) return cached;

  let imageUrl: string | null = null;
  let source = 'none';

  // 1) Wikipedia FR — most trends are named entities (people, events).
  imageUrl = await wikipediaThumbnail(query, 'fr');
  if (imageUrl) source = 'wikipedia-fr';

  // 2) Wikipedia EN — for non-French entities ("hbo max", "spacex").
  if (!imageUrl) {
    imageUrl = await wikipediaThumbnail(query, 'en');
    if (imageUrl) source = 'wikipedia-en';
  }

  // 3) Pixabay — only if a key is configured; cheap free fallback for
  //    generic topics like "marketing" or "entrepreneur".
  if (!imageUrl && process.env.PIXABAY_API_KEY) {
    try {
      const hits = await searchPixabayImages({ query, count: 3, orientation: 'horizontal' });
      if (hits.length > 0) {
        imageUrl = hits[0].webformatURL || hits[0].largeImageURL || hits[0].previewURL || null;
        if (imageUrl) source = 'pixabay';
      }
    } catch {
      /* swallow */
    }
  }

  // 4) Last resort: retry with the first significant word if multi-word
  if (!imageUrl) {
    const head = query.split(/\s+/).find((w) => w.length >= 3);
    if (head && head !== query) {
      imageUrl = await wikipediaThumbnail(head, 'fr');
      if (imageUrl) source = 'wikipedia-fr-head';
      if (!imageUrl) {
        imageUrl = await wikipediaThumbnail(head, 'en');
        if (imageUrl) source = 'wikipedia-en-head';
      }
    }
  }

  await persist(slug, query, imageUrl, source);
  return imageUrl;
}

/**
 * Enrich an array of trend items (in place) by filling in their
 * thumbnail URL when missing. Concurrency-bound so we don't hammer
 * Pixabay; expected to run in a few hundred ms total per call.
 */
export async function enrichTrendThumbnails<T extends Record<string, any>>(
  items: T[],
  opts: { imageKey?: keyof T; titleKey?: keyof T; concurrency?: number } = {}
): Promise<T[]> {
  const imageKey = (opts.imageKey || 'imageUrl') as keyof T;
  const titleKey = (opts.titleKey || 'title') as keyof T;
  const concurrency = Math.max(1, Math.min(8, opts.concurrency ?? 4));

  const queue = items
    .map((it, idx) => ({ idx, query: String(it[titleKey] || '') }))
    .filter((q) => q.query && !items[q.idx][imageKey]);

  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (true) {
      const next = cursor++;
      if (next >= queue.length) return;
      const { idx, query } = queue[next];
      const url = await resolveOne(query);
      if (url) {
        (items[idx] as any)[imageKey] = url;
      }
    }
  });

  await Promise.all(workers);
  return items;
}
