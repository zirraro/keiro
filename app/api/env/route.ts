import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const mask = (v?: string) =>
    !v ? null : v.length <= 8 ? "***" : `${v.slice(0,4)}***${v.slice(-4)}`;

  return NextResponse.json({
    ok: true,
    env: {
      REPLICATE_API_TOKEN_present: Boolean(process.env.REPLICATE_API_TOKEN),
      REPLICATE_API_TOKEN_preview: mask(process.env.REPLICATE_API_TOKEN || undefined),
      REPLICATE_MODEL_VERSION_present: Boolean(process.env.REPLICATE_MODEL_VERSION),
      REPLICATE_MODEL_VERSION_preview: mask(process.env.REPLICATE_MODEL_VERSION || undefined),
      OPENAI_API_KEY_present: Boolean(process.env.OPENAI_API_KEY),
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
  });
}
