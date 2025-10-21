export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return new Response(
    JSON.stringify({
      ok: true,
      signature: 'keiro-debug-v2',
      vercelUrl: process.env.VERCEL_URL || 'local',
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
      now: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-debug-signature': 'keiro-debug-v2',
      },
    },
  );
}
