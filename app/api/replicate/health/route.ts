import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN;
  const model = process.env.REPLICATE_VIDEO_MODEL || "stability-ai/stable-video-diffusion-img2vid";
  return NextResponse.json({
    ok: Boolean(token),
    model,
    env: {
      hasToken: !!token,
      vercelEnv: process.env.VERCEL_ENV,
      nodeEnv: process.env.NODE_ENV,
    },
  });
}
