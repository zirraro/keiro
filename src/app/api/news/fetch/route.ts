export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { promises as fs } from 'fs';
const CACHE_PATH = '/tmp/news-cache.json';

type NewsItem = {
  id: string;
  title: string;
  url: string;
  image: string;
  source: string;
  publishedAt: string;
};

function demoItems(): NewsItem[] {
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

// TODO: remplace par la vraie collecte (RSS/API) quand prête
async function collectItems(): Promise<NewsItem[]> {
  return demoItems();
}

async function writeSafe(payload: unknown) {
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(payload));
    return { wrote: true };
  } catch (e) {
    console.error('write error', e);
    return { wrote: false };
  }
}

async function handle() {
  try {
    const items = await collectItems();
    const payload = { items, at: Date.now() };
    await writeSafe(payload);
    return Response.json({ ok: true, items, cached: false });
  } catch (e) {
    console.error('handler error', e);
    return Response.json({ ok: false, items: demoItems(), cached: false });
  }
}

export async function POST() { return handle(); }
export async function GET()  { return handle(); }
