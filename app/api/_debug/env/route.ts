import { NextResponse } from "next/server";

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      has: {
        REPLICATE_API_TOKEN: !!process.env.REPLICATE_API_TOKEN,
        REPLICATE_MODEL_VERSION: !!process.env.REPLICATE_MODEL_VERSION,
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      },
      model: process.env.REPLICATE_MODEL_VERSION || "stability-ai/stable-diffusion",
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
