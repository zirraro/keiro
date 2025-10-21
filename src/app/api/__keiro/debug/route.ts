import { readFileSync } from 'fs';
import { createHash } from 'crypto';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fileHash(p: string) {
  try { return createHash('sha256').update(readFileSync(p)).digest('hex').slice(0,16); }
  catch { return null; }
}

export async function GET() {
  const newsFile = 'src/app/api/news/route.ts';
  const newsHash = fileHash(newsFile);
  const body = JSON.stringify({
    ok: true,
    signature: 'keiro-debug',
    newsFile,
    newsHash,
    sha: process.env.VERCEL_GIT_COMMIT_SHA || 'local-dev',
    url: process.env.VERCEL_URL || 'unknown',
    now: new Date().toISOString()
  });
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-keiro-news-hash': newsHash ?? ''
    }
  });
}
