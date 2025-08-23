import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    has: {
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      REPLICATE_API_TOKEN: !!process.env.REPLICATE_API_TOKEN,
      REPLICATE_MODEL_VERSION: !!process.env.REPLICATE_MODEL_VERSION,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    },
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
}
