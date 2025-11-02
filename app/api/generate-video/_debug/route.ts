import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    ok: true,
    usingModel: "luma/ray",
    note: "Ce handler ignore REPLICATE_VIDEO_MODEL et force luma/ray.",
    hasToken: !!process.env.REPLICATE_API_TOKEN,
    vercelEnv: process.env.VERCEL_ENV,
  });
}
