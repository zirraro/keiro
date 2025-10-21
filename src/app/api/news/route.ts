export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { promises as fs } from 'fs';

const CACHE_PATH = '/tmp/news-cache.json';

async function readCache() {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    return JSON.parse(raw);
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
    return Response.json({ ok: true, items: cache.items ?? [], cached: !!cache.at });
  } catch (err) {
    console.error('[news] GET error', err);
    return new Response(null, { status: 500 });
  }
}
