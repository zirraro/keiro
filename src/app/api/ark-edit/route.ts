export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const ARK_BASE = process.env.ARK_BASE || 'https://ark.ap-southeast.bytepluses.com';
const ARK_API_KEY = process.env.ARK_API_KEY || '';

function bad(status:number, payload:unknown){ return NextResponse.json(payload, { status }); }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(()=> ({}));
    const { prompt, imageUrl, variation=0.35, guidance_scale=5.5, size='adaptive', watermark=false } = body || {};
    if (!prompt || !imageUrl) return bad(400, { ok:false, error:'NEED_prompt_and_image' });
    if (!/^https:\/\//.test(imageUrl)) return bad(400, { ok:false, error:'NEED_HTTPS_IMAGE_URL' });
    if (!ARK_API_KEY) return bad(500, { ok:false, error:'NEED_ARK_API_KEY' });

    const arkRes = await fetch(`${ARK_BASE}/api/v3/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ARK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'seededit-3-0-i2i-250628',
        prompt,
        image: imageUrl,
        response_format: 'url',
        size,
        seed: Math.floor(Math.random()*10_000),
        guidance_scale,
        watermark,
        variation,
      }),
    });

    const j = await arkRes.json().catch(()=> ({}));
    if (!arkRes.ok || j?.error) {
      return bad(400, { ok:false, error:'ARK_NOT_OK', status: arkRes.status, detail: j });
    }
    return NextResponse.json({ ok:true, ...j });
  } catch (e) {
    return bad(500, { ok:false, error:'ARK_EDIT_ROUTE_ERROR', detail:String(e) });
  }
}
