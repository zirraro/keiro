import { NextResponse } from "next/server";
import Replicate from "replicate";

export const runtime = "nodejs";

type ModelId = `${string}/${string}` | `${string}/${string}:${string}`;

export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN;
  const modelId = (process.env.REPLICATE_VIDEO_MODEL?.trim() ||
    "stability-ai/stable-diffusion") as ModelId;

  const hasToken = Boolean(token);

  if (!hasToken) {
    return NextResponse.json(
      { ok: false, hasToken, message: "Missing REPLICATE_API_TOKEN" },
      { status: 500 }
    );
  }

  try {
    const replicate = new Replicate({ auth: token! });
    // Cheap call that doesn’t spend credits: fetch model metadata
    const mdl = await replicate.models.get(modelId);
    return NextResponse.json({
      ok: true,
      hasToken,
      modelId,
      modelOwner: mdl?.owner,
      modelName: mdl?.name,
      visibility: (mdl as any)?.visibility ?? null,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        hasToken,
        modelId,
        error: err?.title || "Model fetch failed",
        detail: err?.detail || err?.message || String(err),
        status: Number(err?.status) || 500,
      },
      { status: Number(err?.status) || 500 }
    );
  }
}
