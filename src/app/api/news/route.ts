export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const now = new Date().toISOString();
  const items = Array.from({ length: 8 }, (_, i) => ({
    id: String(i + 1),
    title: `Actu démo #${i + 1}`,
    url: `https://example.com/news/${i + 1}`,
    image: `https://picsum.photos/seed/keiro-${i}/800/500`,
    source: 'demo',
    publishedAt: now,
  }));

  return new Response(JSON.stringify({
    ok: true,
    signature: 'news-force-v4',
    items,
    cached: false
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-handler': 'news-force-v4',
      'x-items-count': String(items.length),
      'x-vercel-url': process.env.VERCEL_URL || 'local',
      'x-git-sha': process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    },
  });
}
export const POST = GET;
