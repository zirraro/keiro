import { callUpstream, err, wrapViaProxy } from "../_shared";
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const upstream = await callUpstream('/from-news', body);
    if (!upstream?.url || typeof upstream.url !== 'string') {
      return err('error','UPSTREAM_BAD_PAYLOAD','Upstream did not return a valid url',502);
    }
    return Response.json({ kind: 'image', url: wrapViaProxy(upstream.url) });
  } catch (e: any) {
    if (e?.code === 'UPSTREAM_CONFIG_MISSING') {
      return err('error','UPSTREAM_UNAVAILABLE','Image generation service not configured (IMAGE_GEN_URL)',503);
    }
    if (e?.code === 'UPSTREAM_HTTP_ERROR') {
      return err('error','UPSTREAM_UNAVAILABLE',`Upstream error ${e.status}`,503);
    }
    return err('error','INTERNAL_ERROR','Unexpected error',500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Allow': 'POST, OPTIONS',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    }
  });
}
