import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

type ReqBody = {
  prompt?: string;
  imageUrl?: string;
  ratio?: "16:9" | "9:16" | "1:1";
  duration?: number;
};

const VERSION = process.env.REPLICATE_VIDEO_VERSION
  || "ec16dc44af18758ec1ff7998f5779896f84f5834ea53991d15f65711686a9a79"; // luma/ray

function mapAspect(r?: string) {
  switch ((r || "").trim()) {
    case "9:16": return "9:16";
    case "1:1":  return "1:1";
    default:     return "16:9";
  }
}

export async function POST(req: Request) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
  }

  let body: ReqBody = {};
  try { body = await req.json(); } catch {}

  const input: any = {
    prompt: body.prompt || "test prompt",
    aspect_ratio: mapAspect(body.ratio),
    duration: Math.min(Math.max(Number(body.duration) || 5, 5), 6),
    loop: false,
    seed: 123,
  };
  if (body.imageUrl) input.image = body.imageUrl;

  const replicate = new Replicate({ auth: token });

  try {
    const pred = await replicate.predictions.create({ version: VERSION, input });
    return NextResponse.json({ ok: true, id: pred.id, status: pred.status, input });
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (/402/.test(msg) || /Payment Required/i.test(msg)) {
      // Mode gratuit démo
      return NextResponse.json({
        ok: true,
        demo: true,
        note: "Pas de crédits — vidéos démo renvoyées",
        videos: [
          "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4"
        ]
      });
    }
    return NextResponse.json({ ok: false, error: "Replicate call failed", detail: msg }, { status: 500 });
  }
}
