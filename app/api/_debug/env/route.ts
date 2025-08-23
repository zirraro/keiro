import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // pas de cache

const mask = (v?: string | null) =>
  !v ? null : v.length <= 8 ? "***" : `${v.slice(0,4)}***${v.slice(-4)}`;

export async function GET() {
  return NextResponse.json({
    ok: true,
    env: {
      REPLICATE_API_TOKEN_present: Boolean(process.env.REPLICATE_API_TOKEN),
      REPLICATE_API_TOKEN_preview: mask(process.env.REPLICATE_API_TOKEN ?? null),
      REPLICATE_MODEL_VERSION_present: Boolean(process.env.REPLICATE_MODEL_VERSION),
      REPLICATE_MODEL_VERSION_preview: mask(process.env.REPLICATE_MODEL_VERSION ?? null),
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
  });
}
