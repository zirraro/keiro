export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { promises as fs } from 'fs';
const CACHE_PATH = '/tmp/news-cache.json';

function demoItems() {
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

export async function GET() {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8').catch(() => '');
    if (!raw) {
      return Response.json({ ok: true, items: demoItems(), cached: false });
    }
    const data = JSON.parse(raw);
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0) {
      return Response.json({ ok: true, items: demoItems(), cached: false });
    }
    return Response.json({ ok: true, items, cached: true });
  } catch (e) {
    console.error('GET /api/news error', e);
    return Response.json({ ok: false, items: demoItems(), cached: false });
  }
}
