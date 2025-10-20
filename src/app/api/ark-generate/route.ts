export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const ARK_BASE = process.env.ARK_BASE || 'https://ark.ap-southeast.bytepluses.com';

function sizeForPlatform(p?: string) {
  switch ((p || '').toLowerCase()) {
    case 'instagram':
      return '1024x1024';
    case 'story':
    case 'tiktok':
      return '1080x1920';
    case 'facebook':
    case 'linkedin':
      return '1200x628';
    case 'x':
      return '1600x900';
    default:
      return '1024x1024';
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok:false, error:'NO_ARK_API_KEY' }, { status:500 });
    }

    const body = await req.json().catch(()=> ({}));
    const { prompt, platform } = body || {};
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ ok:false, error:'NEED_PROMPT' }, { status:400 });
    }

    const size = sizeForPlatform(platform);

    const arkRes = await fetch(`${ARK_BASE}/api/v3/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'seedream-3-0-t2i-250415',
        prompt,
        response_format: 'url',
        size,
        guidance_scale: 3,
        watermark: false,
      }),
    });

    const arkJson = await arkRes.json().catch(()=>null);
    if (!arkRes.ok || arkJson?.error) {
      return NextResponse.json({ ok:false, error:'ARK_NOT_OK', detail: arkJson }, { status:400 });
    }

    const url = arkJson?.data?.[0]?.url || null;
    return NextResponse.json({ ok:true, url, model: arkJson?.model, usage: arkJson?.usage });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:'ARK_GENERATE_ROUTE_ERROR', detail: String(e) }, { status:500 });
  }
}
