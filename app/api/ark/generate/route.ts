import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ARK_BASE   = process.env.ARK_BASE   || 'https://ark.ap-southeast-1.bytepluses.com';
  const ARK_MODEL  = process.env.ARK_T2I_MODEL || process.env.ARK_MODEL || 'seedream-3-0-t2i-250415';
  const ARK_API_KEY= process.env.ARK_API_KEY || '';

  if (!ARK_API_KEY) {
    return NextResponse.json({ error: 'missing_key', message: 'ARK_API_KEY is not set in .env.local' }, { status: 400 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const payload = {
    model: ARK_MODEL,
    prompt: body.prompt || '',
    response_format: body.response_format || 'url',
    size: body.size || '1024x1024',
    guidance_scale: body.guidance_scale ?? 3,
    watermark: body.watermark ?? false,
  };

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
