import { NextResponse } from "next/server";
import Replicate from "replicate";

export const runtime = "nodejs";

type ModelId = `${string}/${string}` | `${string}/${string}:${string}`;

function safeModelId(envVal?: string | null): ModelId {
  // Valeur par défaut sûre (gratuit pour tester)
  const DEFAULT: ModelId = "stability-ai/stable-diffusion";

  if (!envVal) return DEFAULT;
  let raw = String(envVal).trim();

  // Si quelqu’un a collé "export VAR=xxx", on récupère juste la partie après '='
  const eq = raw.indexOf("=");
  if (raw.startsWith("export ") && eq !== -1) raw = raw.slice(eq + 1).trim();

  // On enlève les quotes éventuelles
  raw = raw.replace(/^["']|["']$/g, "");

  // On ne garde que le premier "mot" si espaces
  raw = raw.split(/\s+/)[0];

  // Doit ressembler à owner/name ou owner/name:version
  if (!raw.includes("/")) return DEFAULT;
  return raw as ModelId;
}

function splitModel(modelId: ModelId): { owner: string; name: string } {
  const [owner, right] = modelId.split("/");
  const name = right.split(":")[0];
  if (!owner || !name) throw new Error(`Invalid model id: ${modelId}`);
  return { owner, name };
}

export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN;
  const modelId = safeModelId(process.env.REPLICATE_MODEL_VERSION);

  if (!token) {
    return NextResponse.json(
      { ok: false, hasToken: false, message: "Missing REPLICATE_API_TOKEN" },
      { status: 500 }
    );
  }

  try {
    const replicate = new Replicate({ auth: token });
    const { owner, name } = splitModel(modelId);

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
