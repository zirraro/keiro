import { readFileSync } from 'fs';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fileHash(p: string) {
  try {
    const buf = readFileSync(p);
    return createHash('sha256').update(buf).digest('hex').slice(0, 16);
  } catch { return null; }
}

export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_REF || 'local-dev';
  const url = process.env.VERCEL_URL || 'unknown';
  const newsFile = 'src/app/api/news/route.ts';
  const newsHash = fileHash(newsFile);

  const body = JSON.stringify({
    ok: true,
    signature: 'keiro-debug-v1',
    sha,
    url,
    now: new Date().toISOString(),
    newsFile,
    newsHash,
    note: 'newsHash doit apparaitre identique ici ET dans la build locale affichée ci-dessous'
  });

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-keiro-news-hash': newsHash || ''
    }
  });
}
