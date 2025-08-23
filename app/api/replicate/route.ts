import { NextResponse } from "next/server";
import Replicate from "replicate";

export const runtime = "nodejs";

/** Modèles acceptés: "owner/name" ou "owner/name:version" */
type ModelId = `${string}/${string}` | `${string}/${string}:${string}`;

function splitModel(modelId: ModelId): { owner: string; name: string } {
  const [owner, right] = modelId.split("/");
  const name = right.split(":")[0]; // on ignore :version pour models.get
  if (!owner || !name) throw new Error(`Invalid model id: ${modelId}`);
  return { owner, name };
}

export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN;
  // Tu peux aussi pointer vers REPLICATE_VIDEO_MODEL si tu veux tester celui-là:
  const modelId = (process.env.REPLICATE_MODEL_VERSION?.trim() ||
                   "stability-ai/stable-diffusion") as ModelId;

  if (!token) {
    return NextResponse.json(
      { ok: false, hasToken: false, message: "Missing REPLICATE_API_TOKEN" },
      { status: 500 }
    );
  }

  try {
    const replicate = new Replicate({ auth: token });
    const { owner, name } = splitModel(modelId);

    // SDK typings: get(owner, name, options?)
    const mdl = await replicate.models.get(owner, name);

    return NextResponse.json({
      ok: true,
      hasToken: true,
      modelId,
      modelOwner: (mdl as any)?.owner ?? owner,
      modelName: (mdl as any)?.name ?? name,
      visibility: (mdl as any)?.visibility ?? null,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        hasToken: true,
        modelId,
        error: err?.title || "Model fetch failed",
        detail: err?.detail || err?.message || String(err),
        status: Number(err?.status) || 500,
      },
      { status: Number(err?.status) || 500 }
    );
  }
}

// Petits helpers pour éviter 404 si tu testes via autre méthode HTTP
export async function HEAD() { return GET(); }
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
