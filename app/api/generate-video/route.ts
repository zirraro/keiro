import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

type GenVideoRequest = {
  prompt?: string;
  imageUrl?: string;          // Required by stable-video-diffusion
  fps?: number;
  num_frames?: number;
  motion_bucket_id?: number;
  seed?: number;
};

export async function POST(req: Request) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing REPLICATE_API_TOKEN" },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as GenVideoRequest;
    const {
      prompt = "",
      imageUrl,
      fps = 24,
      num_frames = 25,
      motion_bucket_id = 127,
      seed,
    } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: "imageUrl is required for this video model" },
        { status: 400 }
      );
    }

    const replicate = new Replicate({ auth: token });

    // Model owner/name (no version needed for JS SDK)
    const model = (process.env.REPLICATE_VIDEO_MODEL ||
      "stability-ai/stable-video-diffusion-img2vid") as `${string}/${string}`;

    const output = (await replicate.run(model, {
      input: {
        prompt,
        image: imageUrl,
        fps,
        num_frames,
        motion_bucket_id,
        seed,
      },
    })) as unknown;

    return NextResponse.json({ ok: true, output });
  } catch (err: unknown) {
    const e = err as { message?: string; stack?: string };
    return NextResponse.json(
      {
        ok: false,
        error: "Video generation failed",
        detail: e?.message || String(err),
      },
      { status: 500 }
    );
  }
}
