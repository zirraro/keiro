import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

type ReqBody = {
  prompt?: string;
  imageUrl?: string; // si fourni => image-to-video ; sinon text-to-video
  ratio?: "16:9" | "9:16" | "1:1";
  duration?: number; // secondes
};

const OWNER = "luma";
const NAME = "ray";

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
    const prompt =
      body.prompt ??
      "cinematic coffee shop b-roll, shallow depth of field, natural light";
    const imageUrl = body.imageUrl;
    const ratio = body.ratio ?? "1:1";
    const duration = body.duration ?? 5;

    const replicate = new Replicate({ auth: token });

    // 1) Récupère la dernière version du modèle (SDK v1)
    const mdl: any = await replicate.models.get(OWNER, NAME);
    const versionId: string | undefined =
      mdl?.latest_version?.id ?? mdl?.default_example?.version;
    if (!versionId) {
      return NextResponse.json(
        { ok: false, error: "Cannot resolve model version", mdl },
        { status: 500 }
      );
    }

    // 2) Construit l'input
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

    // 3) Lance la prediction
    let pred = await replicate.predictions.create({
      version: versionId,
      input,
    });

    // 4) Polling
    const start = Date.now();
    while (pred.status === "starting" || pred.status === "processing") {
      await new Promise((r) => setTimeout(r, 1500));
      pred = await replicate.predictions.get(pred.id);
      if (Date.now() - start > 120000) break; // 2 minutes max
    }

    if (pred.status !== "succeeded") {
      return NextResponse.json(
        {
          ok: false,
          error: "Prediction failed",
          status: pred.status,
          logs: pred.logs,
          output: pred.output,
        },
        { status: 502 }
      );
    }

    // 5) Normalise la sortie
    let videos: string[] = [];
    const out: any = pred.output;
    if (typeof out === "string") videos = [out];
    else if (Array.isArray(out))
      videos = out.filter((x: unknown) => typeof x === "string");
    else if (out?.video) videos = [out.video];

    if (!videos.length) {
      return NextResponse.json(
        { ok: false, error: "No video URL in output", output: out },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, model: `${OWNER}/${NAME}`, versionId, videos });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Replicate video generation failed",
        detail: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
