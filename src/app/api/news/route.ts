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
async function readCache() {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch { return { items: [], at: 0 }; }
}
export async function GET(req) {
  try {
    const cache = await readCache();
    const useDemo = !cache.items?.length;
    return Response.json({ ok: true, items: useDemo ? demoItems() : cache.items, cached: !useDemo });
  } catch (e) {
    console.error('news error', e);
    return Response.json({ ok: false, items: demoItems(), cached: false });
  }
}
