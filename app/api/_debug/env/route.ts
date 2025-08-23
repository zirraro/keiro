import { NextResponse } from "next/server";

function sanitize(val?: string | null) {
  if (!val) return null;
  let raw = String(val).trim();
  // si quelqu'un a collé "export VAR=xxx"
  const eq = raw.indexOf("=");
  if (raw.startsWith("export ") && eq !== -1) raw = raw.slice(eq + 1).trim();
  raw = raw.replace(/^["']|["']$/g, "");
  raw = raw.split(/\s+/)[0];
  return raw;
}

export async function GET() {
  const rawModel = process.env.REPLICATE_MODEL_VERSION ?? null;
  const rawToken = process.env.REPLICATE_API_TOKEN ?? null;

  const cleanedModel = sanitize(rawModel);
  const okLikeModel = cleanedModel && cleanedModel.includes("/")
    ? cleanedModel
    : "stability-ai/stable-diffusion";

  return NextResponse.json({
    ok: true,
    hasToken: !!rawToken,
    raw: { REPLICATE_MODEL_VERSION: rawModel },
    cleaned: { REPLICATE_MODEL_VERSION: okLikeModel }
  });
}
