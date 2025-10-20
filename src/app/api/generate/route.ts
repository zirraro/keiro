export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const ARK_BASE = process.env.ARK_BASE || 'https://ark.ap-southeast.bytepluses.com';
const ARK_KEY  = process.env.ARK_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(()=> ({}));
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return NextResponse.json({ ok:false, error:'MISSING_PROMPT' }, { status:400 });

    const payload = {
      model: 'seedream-3-0-t2i-250415',
      prompt,
      response_format: 'b64_json',    // force le base64
      size: body.size || '1024x1024',
      guidance_scale: body.guidance_scale ?? 3,
      watermark: !!body.watermark,
    };

    const r = await fetch(`${ARK_BASE}/api/v3/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ARK_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const txt = await r.text();
    let data: any = {};
    try { data = JSON.parse(txt); } catch { data = { _raw: txt }; }

    if (!r.ok) {
      return NextResponse.json({
        ok:false,
        error:'ARK_NOT_OK',
        status:r.status,
        detail:data
      }, { status:r.status });
    }

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ ok:false, error:'NO_B64_IN_RESPONSE', detail:data }, { status:502 });
    }

    return NextResponse.json({
      ok:true,
      result:{ image_url:`data:image/jpeg;base64,${b64}` },
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:'ARK_ROUTE_ERROR', detail:String(e) }, { status:500 });
  }
}
