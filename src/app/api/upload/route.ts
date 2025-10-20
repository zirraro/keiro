export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { dataUrl } = await req.json();
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/'))
      return NextResponse.json({ ok:false, error:'BAD_DATA_URL' }, { status:400 });

    const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
    if (!m) return NextResponse.json({ ok:false, error:'BAD_DATA_URL' }, { status:400 });

    const [, mime, b64] = m;
    const ext = mime.split('/')[1].split('+')[0] || 'jpg';
    const id = `${randomUUID()}.${ext}`;
    const filePath = path.join('/tmp', id);
    const buf = Buffer.from(b64, 'base64');
    await fs.writeFile(filePath, buf);
    return NextResponse.json({ ok:true, url:`/api/tmp/${id}` });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:'UPLOAD_ERROR', detail:String(e) }, { status:500 });
  }
}
