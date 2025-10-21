export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type NewsItem = {
  id: string
  title: string
  url: string
  image?: string
  source?: string
  publishedAt?: string
}

function demoItems(): NewsItem[] {
  const now = new Date().toISOString()
  return Array.from({ length: 8 }).map((_, i) => ({
    id: String(i + 1),
    title: `Actu démo #${i + 1}`,
    url: `https://example.com/news/${i + 1}`,
    image: `https://picsum.photos/seed/keiro-${i}/800/500`,
    source: 'demo',
    publishedAt: now,
  }))
}

function makeResponse() {
  const body = JSON.stringify({ ok: true, signature: 'demo-v2', items: demoItems(), cached: false })
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-demo-items': '8',
    'x-demo-signature': 'demo-v2'
  })
  return new Response(body, { status: 200, headers })
}

export async function GET()  { return makeResponse() }
export async function POST() { return makeResponse() }
