import { NextResponse } from "next/server";
import Replicate from "replicate";

export const runtime = "nodejs";

type ModelId = `${string}/${string}` | `${string}/${string}:${string}`;

// FREE sanity-check model (image) — just to validate your token/SDK pipeline.
// (You can override with env REPLICATE_VIDEO_MODEL if you want.)
const DEFAULT_MODEL: ModelId = "stability-ai/stable-diffusion";

export async function POST(req: Request) {
  const token = process.env.REPLICATE_API_TOKEN;
  const modelId = (process.env.REPLICATE_VIDEO_MODEL?.trim() || DEFAULT_MODEL) as ModelId;

  if (!token) {
    return NextResponse.json(
      { error: "Missing REPLICATE_API_TOKEN in env" },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<{
      prompt: string;
    }>;
    const prompt =
      body?.prompt ||
      "a futuristic city skyline at sunset, cinematic lighting, ultra detailed";

    const replicate = new Replicate({ auth: token });

    // We only test the pipe with an image model (cheapest), to isolate auth/model issues.
    const output = (await replicate.run(modelId, {
      input: { prompt },
    })) as unknown;

    return NextResponse.json({ ok: true, modelId, output }, { status: 200 });
  } catch (err: any) {
    // Replicate errors usually carry {title, detail, status}
    const title = err?.title || "Replicate create failed";
    const detail =
      err?.detail ||
      err?.message ||
      (typeof err === "string" ? err : JSON.stringify(err));
    const status = Number(err?.status) || 422;

    console.error("Replicate error:", { title, detail, status });
    return NextResponse.json({ error: title, detail, status }, { status });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
