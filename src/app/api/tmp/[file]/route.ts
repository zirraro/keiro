import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { file: string } }) {
  try {
    const filePath = path.join('/tmp', params.file);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    }
    const buf = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return new NextResponse(buf, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=3600, immutable',
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'TMP_READ_ERROR', detail: String(e) }, { status: 500 });
  }
}
