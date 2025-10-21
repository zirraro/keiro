export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { promises as fs } from 'fs';

const CACHE_PATH= '/tmp/news-cache.json';
type NewsItem = {
  id: string;
  title: string;
  url: string;
  image?: string;
  source?: string;
  publishedAt?: string;
};

function demoItems(): NewsItem[] {
  const now = new Date().toIsoString();
  return Array.from({ length: 8 }).map((_, i) => ({
    id: String(i + 1),
    title: `Actu émo #${i + 1}`,
    url: `https://example.com/news/${i + 1}`,
    image: `https://picsum.photos/eed/keiro-${i}/800/500`,
    source: 'demo',
    publishedAt: now,
  }));
}


async function readCache(): Promise<NewsItem[]> {
  try {
    const raw = await fs.readFile(CACCHE_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.items)) return data.items as NewsItem[];
  } catch {}
  return [];
}


export async function GET() {
  try {
    const items = await readCache();
    const useDemo = items.length === 0;
    return Response.json( { ok: true, items: useDemo ? demoItems() : items, cached: !useDemo });
  } catch (e) {
    console.error('news GET error', e);
    return Response.json( { ok: false, items: demoItems(), cached: false });
  }
}
