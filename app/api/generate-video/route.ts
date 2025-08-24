import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

type Body = {
  prompt?: string;
  imageUrl?: string;
  fps?: number;
  num_frames?: number;
  seed?: number;
};

const DEMO_IMAGE =
  "https://replicate.delivery/pbxt/8o3w3vN9/test-square.png"; // image publique carrée

export async function POST(req: Request) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    const model = process.env.REPLICATE_VIDEO_MODEL || "stability-ai/stable-video-diffusion-img2vid";

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing REPLICATE_API_TOKEN" },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const prompt = (body.prompt || "").trim();
    const imageUrl = (body.imageUrl || "").trim() || DEMO_IMAGE; // <- fallback démo
    const fps = body.fps ?? 24;
    const num_frames = body.num_frames ?? 25;

    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: "imageUrl is required for this video model" },
        { status: 400 }
      );
    }

    const replicate = new Replicate({ auth: token });
    const input = {
      input_image: imageUrl,
      prompt,
      fps,
      num_frames,
    };

    // La plupart des modèles img2vid sur Replicate acceptent replicate.run("<owner>/<name>", { input })
    const output = (await replicate.run(model as `${string}/${string}`, { input })) as any;

    return NextResponse.json({ ok: true, model, output });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Replicate create failed",
        detail: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
