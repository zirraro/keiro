export const dynamic = 'force-dynamic';

async function check(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, { ...init, cache: 'no-store' });
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function GET() {
  const checks: any = { uptime: process.uptime() };

  if (process.env.OPENAI_API_KEY) {
    checks.openai = await check('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
    });
  }
  if (process.env.REPLICATE_API_TOKEN) {
    checks.replicate = await check('https://api.replicate.com/v1/models', {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` }
    });
  }

  return Response.json({ ok: true, checks });
}
