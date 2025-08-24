import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

type ReqBody = {
  prompt?: string;
  imageUrl?: string; // si présent => image-to-video
  ratio?: "16:9" | "9:16" | "1:1";
  duration?: number; // secondes (5-10)
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

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const {
      prompt = "cinematic coffee shop b-roll, shallow depth of field, natural light",
      imageUrl,
      ratio = "1:1",
      duration = 5,
    } = body;

    const replicate = new Replicate({ auth: token });

    // 🚫 NE PAS LIRE process.env.REPLICATE_VIDEO_MODEL
    // ✅ Forcer le modèle Luma (Dream Machine) via Replicate
    const model = "luma/ray" as `${string}/${string}`;

    const input: Record<string, unknown> = {
      aspect_ratio: ratio,
      duration,
    };

    if (imageUrl) {
      input.image = imageUrl;
      if (prompt) input.prompt = prompt;
    } else {
      input.prompt = prompt;
    }

    const output = (await replicate.run(model, { input })) as any;

    let videos: string[] = [];
    if (typeof output === "string") {
      videos = [output];
    } else if (Array.isArray(output)) {
      videos = output.filter((x) => typeof x === "string");
    } else if (output?.video) {
      videos = [output.video];
    } else if (output?.output) {
      const out = output.output;
      if (typeof out === "string") videos = [out];
      else if (Array.isArray(out)) videos = out.filter((x: unknown) => typeof x === "string");
    }

    if (!videos.length) {
      return NextResponse.json(
        { ok: false, error: "No video URL in output", raw: output },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, model, videos });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "Replicate video generation failed", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
