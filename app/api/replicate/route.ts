import { NextResponse } from "next/server";
import Replicate from "replicate";

export const runtime = "nodejs";

type ModelId = `${string}/${string}` | `${string}/${string}:${string}`;

function sanitize(val?: string | null) {
  if (!val) return null;
  let raw = String(val).trim();
  const eq = raw.indexOf("=");
  if (raw.startsWith("export ") && eq !== -1) raw = raw.slice(eq + 1).trim();
  raw = raw.replace(/^["']|["']$/g, "");
  raw = raw.split(/\s+/)[0];
  return raw;
}

function safeModelId(envVal?: string | null): ModelId {
  const DEFAULT: ModelId = "stability-ai/stable-diffusion";
  const s = sanitize(envVal);
  if (!s || !s.includes("/")) return DEFAULT;
  return s as ModelId;
}

export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN ?? "";
  const modelId = safeModelId(process.env.REPLICATE_MODEL_VERSION);

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Missing REPLICATE_API_TOKEN" },
      { status: 500 }
    );
  }

  try {
    const replicate = new Replicate({ auth: token });

    // Décomposition safe sans supposer "owner/name" correct
    const parts = modelId.split("/");
    const owner = parts[0] || "stability-ai";
    const nameAndMaybeVersion = parts[1] || "stable-diffusion";
    const name = nameAndMaybeVersion.split(":")[0] || "stable-diffusion";

    // API Replicate v1: models.get(owner, name)
    const mdl = await replicate.models.get(owner, name);

    return NextResponse.json({
      ok: true,
      modelId,
      visibility: (mdl as any)?.visibility ?? null
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        modelId,
        error: err?.title || "Model fetch failed",
        detail: err?.detail || err?.message || String(err),
        status: Number(err?.status) || 500
      },
      { status: Number(err?.status) || 500 }
    );
  }
}
