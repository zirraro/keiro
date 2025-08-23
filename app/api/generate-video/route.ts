import { NextResponse } from "next/server";
import Replicate from "replicate";

export const runtime = "nodejs"; // ensure Node runtime on Vercel

type ModelId = `${string}/${string}` | `${string}/${string}:${string}`;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const prompt: string =
      body?.prompt ||
      "a futuristic city skyline at sunset, cinematic lighting, ultra detailed, artstation";

    const token = process.env.REPLICATE_API_TOKEN;
    // Use a guaranteed-free image model to validate your setup
    const fallbackModel: ModelId = "stability-ai/stable-diffusion";
    const modelEnv = process.env.REPLICATE_VIDEO_MODEL?.trim();
    const modelId = (modelEnv || fallbackModel) as ModelId;

    if (!token) {
      return NextResponse.json(
        { error: "Missing REPLICATE_API_TOKEN environment variable" },
        { status: 500 }
      );
    }

    const replicate = new Replicate({ auth: token });

    // This returns an image URL (or array of URLs). It's OK: we just want to test the pipeline.
    const output = (await replicate.run(modelId, {
      input: { prompt },
    })) as unknown;

    return NextResponse.json({ ok: true, modelId, output });
  } catch (err: unknown) {
    const msg =
      typeof err === "object" && err !== null
        ? (err as any).message || JSON.stringify(err)
        : String(err);
    console.error("Replicate error:", err);
    return NextResponse.json(
      { error: "Replicate create failed", detail: msg },
      { status: 422 }
    );
  }
}

// Optional: quick health check
export async function GET() {
  return NextResponse.json({ ok: true });
}
