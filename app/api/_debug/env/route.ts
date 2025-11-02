import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  const mask = (v?: string) => (!v ? null : v.length <= 8 ? "***" : `${v.slice(0,4)}***${v.slice(-4)}`);
  return NextResponse.json({
    ok: true,
    env: {
      REPLICATE_API_TOKEN_present: !!process.env.REPLICATE_API_TOKEN,
      REPLICATE_API_TOKEN_preview: mask(process.env.REPLICATE_API_TOKEN || undefined),
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
  });
}
