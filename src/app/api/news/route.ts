export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { promises as fs } from 'fs';

const CACHE_PATH = '/tmp/news-cache.json';

type Item = {
  id: string;
  title: string;
  url: string;
  image?: string;
  source?: string;
  publishedAt?: string;
};

function demoItems(): Item[] {
  const now = new Date().toISOString();
  return Array.from({ length: 8 }).map((_, i) => ({
    id: String(i + 1),
    title: `Actu démo #${i + 1}`,
    url: `https://example.com/news/${i + 1}`,
    image: `https://picsum.photos/seed/keiro-${i}/800/500`,
    source: 'demo',
    publishedAt: now,
  }));
}

async function readCache() {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    return JSON.parse(raw) as { items: Item[]; at: number };
  } catch {
    return { items: [], at: 0 };
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('reset') === '1') {
      try { await fs.rm(CACHE_PATH, { force: true }); } catch {}
    }
    const cache = await readCache();
    const useDemo = !cache.items?.length;
    const items = useDemo ? demoItems() : cache.items;
    return Response.json({ ok: true, items, cached: !useDemo, at: cache.at || Date.now() });
  } catch (err) {
    console.error('[news] GET error', err);
    return Response.json({ ok: false, items: demoItems(), cached: false, error: 'read-failed' });
  }
}
