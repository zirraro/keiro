import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

type ReqBody = {
  prompt?: string;
  imageUrl?: string;           // si présent => image-to-video, sinon text-to-video
  ratio?: "16:9" | "9:16" | "1:1";
  duration?: number;           // secondes (Ray supporte ~5–6s)
};

const OWNER = "luma";
const NAME = "ray";
// Version stable publique de Ray (tu peux aussi la mettre en var d'env si tu veux)
const VERSION = process.env.REPLICATE_VIDEO_VERSION
  || "ec16dc44af18758ec1ff7998f5779896f84f5834ea53991d15f65711686a9a79";

function mapAspect(ratio?: string) {
  switch ((ratio || "16:9").trim()) {
    case "9:16": return "9:16";
    case "1:1":  return "1:1";
    default:     return "16:9";
  }
}

function clampDuration(s?: number) {
  let d = Number.isFinite(Number(s)) ? Number(s) : 5;
  // Ray accepte ~5–6s
  if (d < 5) d = 5;
  if (d > 6) d = 6;
  return Math.round(d);
}

async function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

export async function POST(req: Request) {
  let body: ReqBody = {};
  try { body = await req.json(); } catch {}

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Missing REPLICATE_API_TOKEN" },
      { status: 500 }
    );
  }

  const prompt = (body.prompt || "").toString().trim();
  const aspect_ratio = mapAspect(body.ratio);
  const duration = clampDuration(body.duration);
  const imageUrl = body.imageUrl?.toString().trim();

  // Entrées communes recommandées pour Ray
  const input: Record<string, any> = {
    prompt,
    aspect_ratio,
    duration,
    loop: false,
    seed: 123, // optionnel, pour un rendu plus stable
  };
  if (imageUrl) input.image = imageUrl;

  const replicate = new Replicate({ auth: token });

  try {
    // 1) Crée la prédiction
    let pred = await replicate.predictions.create({
      version: VERSION,
      input,
    });

    // 2) Poll jusqu’au résultat
    while (pred.status === "starting" || pred.status === "processing") {
      await sleep(1500);
      pred = await replicate.predictions.get(pred.id);
    }

    if (pred.error) {
      throw new Error(typeof pred.error === "string" ? pred.error : JSON.stringify(pred.error));
    }

    // 3) Normalise la sortie en liste de MP4
    let videos: string[] = [];
    const out: any = pred.output;

    if (Array.isArray(out)) {
      videos = out.filter((x: any) => typeof x === "string" && x.endsWith(".mp4"));
    } else if (out && typeof out === "object") {
      if (typeof out.video === "string") videos = [out.video];
      if (!videos.length && typeof out.url === "string" && out.url.endsWith(".mp4")) videos = [out.url];
    }

    return NextResponse.json({
      ok: true,
      model: `${OWNER}/${NAME}`,
      versionId: VERSION,
      id: pred.id,
      videos,
      raw: videos.length ? undefined : out, // utile en debug si pas de MP4 détecté
    });
  } catch (e: any) {
    // Cas crédits insuffisants → on renvoie des vidéos démo pour tester le front
    const msg = e?.message || String(e);
    const detail = e?.response?.data || e?.data || msg;
    if (/402/.test(msg) || /Payment Required/i.test(msg)) {
      return NextResponse.json({
        ok: true,
        demo: true,
        note: "Replicate 402 (no credits) — returning demo videos",
        videos: [
          "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
          "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
        ],
      });
    }

    return NextResponse.json(
      { ok: false, error: "Replicate video generation failed", detail },
      { status: 500 }
    );
  }
}
