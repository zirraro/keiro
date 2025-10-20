import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

type RawItem = {
  title?: string; description?: string; url?: string; image?: string;
  source?: { name?: string } | string; publishedAt?: string;
};
type Card = {
  id: string; title: string; description: string; url: string;
  image?: string; source?: string; date?: string; category?: string;
};

// -------- CATEGORIES → requêtes/sujets selon les API
const CAT_MAP: Record<string, { gnews?: string; query?: string }> = {
  'À la une':            { gnews: 'world' },
  'Politique':           { query: 'politique OR gouvernement OR élection' },
  'Économie':            { query: 'économie OR croissance OR inflation' },
  'Business':            { gnews: 'business' },
  'Sport':               { gnews: 'sports' },
  'People':              { query: 'people OR célébrités' },
  'Santé':               { gnews: 'health' },
  'Restauration':        { query: 'restaurant OR gastronomie OR restauration' },
  'Tech':                { gnews: 'technology' },
  'Culture':             { gnews: 'entertainment' },
  'Monde':               { gnews: 'world' },
  'Auto':                { query: 'automobile OR voiture OR électrique' },
  'Climat':              { gnews: 'science', query: 'climat OR météo OR environnement' },
  'Immo':                { query: 'immobilier OR logement' },
  'Lifestyle':           { query: 'lifestyle OR tendance' },
  'Gaming':              { query: 'jeu vidéo OR gaming' },
};

const CACHE_FILE = path.join('/tmp', 'news_cache_v1.json');
const MAX_ITEMS = 30;
const ONE_DAY = 24 * 60 * 60 * 1000;

async function readCache() {
  try {
    const buf = await fs.readFile(CACHE_FILE, 'utf-8'); return JSON.parse(buf);
  } catch { return {}; }
}
async function writeCache(obj: any) {
  try { await fs.writeFile(CACHE_FILE, JSON.stringify(obj)); } catch {}
}
function key(cat: string, q: string) { return `${cat}::${q}`.toLowerCase(); }

// ---------- Normalisation
function normalize(list: any[], cat: string): Card[] {
  return (list || []).map((a: any, idx: number) => {
    const srcName =
      typeof a?.source === 'string' ? a.source :
      a?.source?.name || a?.source?.title || '';
    return {
      id: a?.url || String(idx),
      title: a?.title || '',
      description: a?.description || a?.content || '',
      url: a?.url || '#',
      image: a?.image || a?.urlToImage || a?.thumbnail || undefined,
      source: srcName,
      date: a?.publishedAt || a?.pubDate || a?.date || '',
      category: cat
    };
  }).filter((c: Card) => c.title && c.url);
}

function dedupe(items: Card[]): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const it of items) {
    const k = (it.url || it.title).toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(it); }
  }
  return out;
}

// ---------- Fetchers
async function fetchGNews(cat: string, q: string) {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const topic = CAT_MAP[cat]?.gnews;
  const base = 'https://gnews.io/api/v4/top-headlines?lang=fr&max=30';
  const url = topic
    ? `${base}&topic=${encodeURIComponent(topic)}&apikey=${key}`
    : `${base}&q=${encodeURIComponent(q || CAT_MAP[cat]?.query || cat)}&apikey=${key}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('gnews failed');
  const j = await res.json();
  return normalize(j?.articles || [], cat);
}

async function fetchNewsdata(cat: string, q: string) {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) return [];
  const query = q || CAT_MAP[cat]?.query || CAT_MAP[cat]?.gnews || cat;
  const url = `https://newsdata.io/api/1/latest?apikey=${key}&language=fr&q=${encodeURIComponent(query)}&country=fr`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('newsdata failed');
  const j = await res.json();
  const list = (j?.results || []).map((r: any) => ({
    title: r?.title, description: r?.description, url: r?.link,
    image: r?.image_url, source: r?.source_id, publishedAt: r?.pubDate
  }));
  return normalize(list, cat);
}

async function fetchNewsAPIAI(cat: string, q: string) {
  const key = process.env.NEWSAPI_AI_KEY;
  if (!key) return [];
  const query = q || CAT_MAP[cat]?.query || CAT_MAP[cat]?.gnews || cat;
  const url = `https://eventregistry.org/api/v1/article/getArticles?apiKey=${key}&keyword=${encodeURIComponent(query)}&keywordOper=or&lang=fra&resultType=articles&articlesSortBy=date&articlesCount=30`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('newsapi.ai failed');
  const j = await res.json();
  const list = (j?.articles?.results || []).map((r: any) => ({
    title: r?.title, description: r?.body || r?.snippet, url: r?.url,
    image: r?.image, source: r?.source?.title, publishedAt: r?.dateTime
  }));
  return normalize(list, cat);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cat = searchParams.get('cat') || 'Tech';
    const q   = searchParams.get('q')   || '';
    const k   = key(cat, q);

    // 1) cache
    const cache = await readCache();
    const hit   = cache[k];
    if (hit && Date.now() - hit.ts < ONE_DAY) {
      return NextResponse.json({ ok: true, items: hit.items.slice(0, MAX_ITEMS), cached: true });
    }

    // 2) sources en cascade (évite les doublons)
    let items: Card[] = [];
    try   { items = await fetchGNews(cat, q); } catch {}
    if (items.length === 0) { try { items = await fetchNewsdata(cat, q); } catch {} }
    if (items.length === 0) { try { items = await fetchNewsAPIAI(cat, q); } catch {} }

    items = dedupe(items).slice(0, MAX_ITEMS);

    // 3) write cache
    cache[k] = { ts: Date.now(), items };
    writeCache(cache).catch(()=>{});

    return NextResponse.json({ ok: true, items, cached: false });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'NEWS_ERROR' }, { status: 500 });
  }
}
