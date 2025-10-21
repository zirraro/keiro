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
  return new Response(JSON.stringify({
    ok: true,
    signature: 'news-demo-fixed',
    items: demoItems(),
    cached: false
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
export const POST = GET;
