export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN;
  const version = process.env.REPLICATE_MODEL_VERSION;

  if (!token || !version) {
    return new Response(JSON.stringify({
      ok: false,
      where: 'env',
      error: 'Missing REPLICATE_API_TOKEN or REPLICATE_MODEL_VERSION'
    }, null, 2), { status: 500, headers: { 'Content-Type': 'application/json' }});
  }

  // simple call → on essaye de récupérer la version du modèle
  const resp = await fetch(`https://api.replicate.com/v1/models/civitai/${encodeURIComponent(version)}`, {
    headers: { Authorization: `Bearer ${token}` }
  }).catch((e) => ({ ok:false, status:0, json: async()=>({ error:String(e) }) } as any));

  if (!('ok' in resp) || !resp.ok) {
    let body: any = {};
    try { body = await (resp as any).json(); } catch {}
    return new Response(JSON.stringify({
      ok: false,
      where: 'replicate',
      status: (resp as any).status,
      error: body?.error || body
    }, null, 2), { status: 502, headers: { 'Content-Type': 'application/json' }});
  }

  // si la route ci-dessus est trop fragile selon ton modèle, on fait un ping générique
  return new Response(JSON.stringify({ ok: true }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
