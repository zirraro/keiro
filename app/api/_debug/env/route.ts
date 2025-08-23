import { NextResponse } from "next/server";

function sanitize(val?: string | null) {
  if (!val) return null;
  let raw = String(val).trim();
  // Si quelqu'un a collé "export VAR=xxx"
  const eq = raw.indexOf("=");
  if (raw.startsWith("export ") && eq !== -1) raw = raw.slice(eq + 1).trim();
  raw = raw.replace(/^["']|["']$/g, "");   // enlève guillemets
  raw = raw.split(/\s+/)[0];               // 1er token uniquement
  return raw;
}

export async function GET() {
  const rawModel = process.env.REPLICATE_MODEL_VERSION ?? null;
  const rawToken = process.env.REPLICATE_API_TOKEN ?? null;

  const cleanedModel = sanitize(rawModel);
  const okModel = cleanedModel && cleanedModel.includes("/")
    ? cleanedModel
    : "stability-ai/stable-diffusion";

  return NextResponse.json({
    ok: true,
    hasToken: !!rawToken,
    raw: { REPLICATE_MODEL_VERSION: rawModel },
    cleaned: { REPLICATE_MODEL_VERSION: okModel }
  });
}
