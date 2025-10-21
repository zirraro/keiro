export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type NewsItem = {
  id: string;
  title: string;
  url: string;
  image?: string;
  source?: string;
  publishedAt?: string;
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

async function handle() {
  return Response.json({ ok: true, items: demoItems(), cached: false });
}

export async function GET()  { return handle(); }
export async function POST() { return handle(); }
