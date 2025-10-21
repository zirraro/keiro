export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function makeItems() {
  const now = new Date().toISOString();
  return Array.from({ length: 8 }, (_, i) => ({
    id: String(i + 1),
    title: `Actu démo #${i + 1}`,
    url: `https://example.com/news/${i + 1}`,
    image: `https://picsum.photos/seed/keiro-${i}/800/500`,
    source: 'demo',
    publishedAt: now,
  }));
}

function json(data: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

export async function GET() {
  const items = makeItems();
  return json(
    { ok: true, signature: 'news-force-v5', items, cached: false },
    {
      'x-handler': 'news-force-v5',
      'x-items-count': String(items.length),
      'x-vercel-url': process.env.VERCEL_URL || 'local',
      'x-git-sha': process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    },
  );
}

export const POST = GET;
