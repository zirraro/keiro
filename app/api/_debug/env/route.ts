export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function mask(v?: string) {
  if (!v) return null;
  return v.length <= 8 ? v : `${v.slice(0,3)}***${v.slice(-3)}`;
}

export async function GET() {
  const data = {
    REPLICATE_API_TOKEN_present: Boolean(process.env.REPLICATE_API_TOKEN),
    REPLICATE_API_TOKEN_preview: mask(process.env.REPLICATE_API_TOKEN || undefined),
    REPLICATE_MODEL_VERSION_present: Boolean(process.env.REPLICATE_MODEL_VERSION),
    REPLICATE_MODEL_VERSION_preview: mask(process.env.REPLICATE_MODEL_VERSION || undefined),
    OPENAI_API_KEY_present: Boolean(process.env.OPENAI_API_KEY),
    OPENAI_API_KEY_preview: mask(process.env.OPENAI_API_KEY || undefined),
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
  return new Response(JSON.stringify({ ok: true, env: data }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
