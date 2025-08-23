import { NextResponse } from "next/server";

export async function GET() {
  const checks = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    REPLICATE_API_TOKEN: !!process.env.REPLICATE_API_TOKEN,
    NEXT_PUBLIC_SITE_URL: !!process.env.NEXT_PUBLIC_SITE_URL,
  };
  return NextResponse.json({ ok: true, checks });
}
