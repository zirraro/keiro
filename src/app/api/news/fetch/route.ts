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

async function writeSafe(payload: unknown) {
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(payload));
    return { wrote: true, error: null as string | null };
  } catch (e: any) {
    console.error('[news/fetch] write error', e?.message || e);
    return { wrote: false, error: String(e?.message || e) };
  }
}

async function handle() {
  try {
    // TODO: remplacer ce demoItems() par ta vraie collecte (RSS/API), garder writeSafe.
    const items = demoItems();
    const payload = { items, at: Date.now() };
    const res = await writeSafe(payload);
    return Response.json({ ok: res.wrote, items, at: payload.at, error: res.error });
  } catch (err: any) {
    console.error('[news/fetch] handler error', err?.message || err);
    // Même en cas d’erreur, renvoyer 200 + fallback pour éviter un 500 côté UI
    return Response.json({ ok: false, items: demoItems(), at: Date.now(), error: 'handler-failed' });
  }
}

export async function POST() { return handle(); }
export async function GET() { return handle(); }
