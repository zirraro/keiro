import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // éviter le cache

export async function GET() {
  // On ne renvoie JAMAIS la clé en clair : on masque
  const mask = (v?: string) =>
    !v ? null : v.length <= 8 ? "***" : `${v.slice(0,4)}***${v.slice(-4)}`;

  return NextResponse.json({
    ok: true,
    env: {
      REPLICATE_API_TOKEN_present: Boolean(process.env.REPLICATE_API_TOKEN),
      REPLICATE_API_TOKEN_preview: mask(process.env.REPLICATE_API_TOKEN || undefined),
      REPLICATE_MODEL_VERSION_present: Boolean(process.env.REPLICATE_MODEL_VERSION),
      REPLICATE_MODEL_VERSION_preview: mask(process.env.REPLICATE_MODEL_VERSION || undefined),
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV, // production | preview | development
    },
  });
}
