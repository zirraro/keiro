export async function callUpstream(path: string, payload: any) {
  const base = process.env.IMAGE_GEN_URL;
  if (!base) {
    const e: any = new Error('IMAGE_GEN_URL env not set');
    e.code = 'UPSTREAM_CONFIG_MISSING';
    throw e;
  }
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  if (!res.ok) {
    const e: any = new Error(`Upstream error ${res.status}`);
    e.code = 'UPSTREAM_HTTP_ERROR';
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export function err(kind: string, code: string, message: string, status = 500) {
  return Response.json({ kind, code, message }, { status });
}

/** Retourne une URL relative : /api/proxy?u=<encoded> */
export function wrapViaProxy(upstreamUrl: string) {
  const u = new URLSearchParams({ u: upstreamUrl }).toString();
  return `/api/proxy?${u}`;
}
