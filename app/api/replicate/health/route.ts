import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    ok: Boolean(process.env.REPLICATE_API_TOKEN),
    model: "luma/ray",
    env: {
      hasToken: !!process.env.REPLICATE_API_TOKEN,
      vercelEnv: process.env.VERCEL_ENV,
      nodeEnv: process.env.NODE_ENV,
    },
  });
}
