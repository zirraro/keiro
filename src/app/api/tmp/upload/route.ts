import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getPublicBaseUrl } from '@/lib/base';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { dataUrl, srcUrl } = body || {};

    let buf: Buffer;
    let ext = 'jpg';

    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
      const m = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (!m) return NextResponse.json({ ok:false, error:'BAD_DATA_URL' }, { status:400 });
      const meta = m[1];
      const b64  = m[2];
      buf = Buffer.from(b64, 'base64');
      ext = (meta.split('/')[1] || 'jpg').split('+')[0];
    } else if (typeof srcUrl === 'string' && /^https?:\/\//.test(srcUrl)) {
      const r = await fetch(srcUrl);
      if (!r.ok) return NextResponse.json({ ok:false, error:'FETCH_SRC_FAILED', status:r.status }, { status:502 });
      const ab = await r.arrayBuffer();
      buf = Buffer.from(ab);
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('png')) ext='png';
      else if (ct.includes('webp')) ext='webp';
      else ext='jpg';
    } else {
      return NextResponse.json({ ok:false, error:'NEED_dataUrl_OR_srcUrl' }, { status:400 });
    }

    const id = crypto.randomUUID();
    const file = `${id}.${ext}`;
    const dst  = path.join('/tmp', file);
    await fs.promises.writeFile(dst, buf);

    const base = getPublicBaseUrl();
    return NextResponse.json({ ok:true, url: `${base}/api/tmp/${file}` });
  } catch (e) {
    return NextResponse.json({ ok:false, error:'UPLOAD_ERROR', detail:String(e) }, { status:500 });
  }
}
