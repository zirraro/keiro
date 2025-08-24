import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

type Body = {
  prompt?: string;
  imageUrl?: string;
  fps?: number;
  num_frames?: number;
};

const DEFAULT_IMAGE =
  "https://replicate.delivery/pbxt/8o3w3vN9/test-square.png"; // fallback démo (public)
const MODEL = "stability-ai/stable-video-diffusion-img2vid";   // img2vid (besoin d'une image)

export async function POST(req: Request) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const prompt = body.prompt || "short dynamic social clip, aesthetic lighting, cinematic";
    const imageUrl = (body.imageUrl && body.imageUrl.trim()) || DEFAULT_IMAGE; // <-- fallback auto
    const fps = Number.isFinite(body.fps) ? Number(body.fps) : 24;
    const num_frames = Number.isFinite(body.num_frames) ? Number(body.num_frames) : 25;

    // validation rapide
    if (!/^https?:\/\/.+/i.test(imageUrl)) {
      return NextResponse.json({ ok: false, error: "imageUrl must be a valid http(s) URL" }, { status: 400 });
    }

    const replicate = new Replicate({ auth: token });

    const input: Record<string, unknown> = {
      prompt,
      image: imageUrl,
      fps,
      num_frames,
    };

    // Appel Replicate (modèle public)
    const output = (await replicate.run(MODEL as `${string}/${string}`, { input })) as unknown;

    return NextResponse.json({
      ok: true,
      model: MODEL,
      usedImage: imageUrl,
      input,
      output,
    });
  } catch (err: any) {
    const message =
      err?.response?.data || err?.message || "Video generation failed";
    return NextResponse.json({ ok: false, error: String(message) }, { status: 500 });
  }
}
