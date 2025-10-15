import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ARK_BASE   = process.env.ARK_BASE   || 'https://ark.ap-southeast-1.bytepluses.com';
  const ARK_MODEL  = process.env.ARK_EDIT_MODEL || 'seededit-3-0-i2i-250628';
  const ARK_API_KEY= process.env.ARK_API_KEY || '';

  if (!ARK_API_KEY) {
    return NextResponse.json({ error: 'missing_key', message: 'ARK_API_KEY is not set in .env.local' }, { status: 400 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const image = (body.image || '').trim();
  if (!image) {
    return NextResponse.json({ error: 'missing_image', message: 'image URL required' }, { status: 400 });
  }

  const payload: any = {
    model: ARK_MODEL,
    prompt: body.prompt || '',
    image,
    response_format: body.response_format || 'url',
    size: body.size || 'adaptive',
  };
  if (body.guidance_scale != null) payload.guidance_scale = body.guidance_scale;
  if (body.seed != null)            payload.seed = body.seed;
  if (body.watermark != null)       payload.watermark = body.watermark;
  if (body.fidelity != null)        payload.fidelity = body.fidelity; // si Ark supporte ce champ plus tard
  if (body.mask)                    payload.mask = body.mask;         // DataURL (png) – optionnel

  try {
    const res = await fetch(`${ARK_BASE}/api/v3/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ARK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: 'ark_error', status: res.status, body: data }, { status: 500 });
    }
    const url = data?.data?.[0]?.url;
    if (!url) {
      return NextResponse.json({ error: 'ark_no_url', body: data }, { status: 500 });
    }
    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: 'network_error', message: String(e?.message || e) }, { status: 500 });
  }
}
