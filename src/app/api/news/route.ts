export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function demoItems() {
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

export async function GET() {
  const body = JSON.stringify({ ok: true, signature: 'demo-v4', items: demoItems(), cached: false });
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-demo-items': '8',
      'x-demo-signature': 'demo-v4',
    },
  });
}
