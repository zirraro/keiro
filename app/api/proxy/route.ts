export const runtime = 'nodejs';

function bad(status: number, message: string) {
  return new Response(JSON.stringify({ kind: 'error', message }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const u = url.searchParams.get('u');
    if (!u) return bad(400, 'Missing query param u');
    const upstream = await fetch(u, { cache: 'no-store' });
    if (!upstream.ok) return bad(502, `Upstream ${upstream.status}`);
    // Stream binaire + content-type d’origine
    const ct = upstream.headers.get('content-type') ?? 'application/octet-stream';
    const body = upstream.body;
    const res = new Response(body, {
      status: 200,
      headers: {
        'content-type': ct,
        'cache-control': 'no-store'
      }
    });
    return res;
  } catch (e) {
    return bad(500, 'Proxy error');
  }
}
