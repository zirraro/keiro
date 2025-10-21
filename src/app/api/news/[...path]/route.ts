export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Item = {
  id: string; title: string; url: string; image: string; source: string; publishedAt: string;
};

function demoItems(): Item[] {
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

function respond() {
  return new Response(
    JSON.stringify({ ok: true, signature: 'demo-catchall-v1', items: demoItems(), cached: false }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-demo-items': '8',
        'x-demo-signature': 'demo-catchall-v1',
      },
    },
  );
}

export async function GET()  { return respond(); }
export async function POST() { return respond(); }
