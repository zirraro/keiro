export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

export async function POST(_req: Request) {
  try {
    // TODO: remplacer par ta vraie collecte (RSS, API, etc.)
    const items = demoItems();
    const payload = { items, at: Date.now() };
    await fs.writeFile(CACHE_PATH, JSON.stringify(payload));
    return Response.json({ ok: true, written: items.length });
  } catch (err) {
    console.error('[news/fetch] POST error', err);
    return new Response(null, { status: 500 });
  }
}
