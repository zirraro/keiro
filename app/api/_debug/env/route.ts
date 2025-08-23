export const dynamic = 'force-dynamic';

export async function GET() {
  const data = {
    NODE_ENV: process.env.NODE_ENV,
    has: {
      REPLICATE_API_TOKEN: !!process.env.REPLICATE_API_TOKEN,
      REPLICATE_MODEL_VERSION: !!process.env.REPLICATE_MODEL_VERSION,
      OPENAI_API_KEY:       !!process.env.OPENAI_API_KEY,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    }
  };
  return Response.json(data);
}
