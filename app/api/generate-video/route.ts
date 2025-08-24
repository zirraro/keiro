import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

// Fallback démo (vidéo publique légère)
const DEMO_VIDEO =
  "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4"; // remplaçable par un asset hébergé chez toi

type ReqBody = {
  prompt?: string;
  imageUrl?: string;             // si présent => image-to-video
  ratio?: "16:9" | "9:16" | "1:1";
  duration?: number;             // secondes
};

// Modèle Replicate (ex: Luma Ray)
const OWNER = process.env.REPLICATE_OWNER || "luma";
const NAME  = process.env.REPLICATE_NAME  || "ray";
// Version connue (tu peux la garder configurable via env)
const VERSION = process.env.REPLICATE_VERSION || "ec16dc44af18758ec1ff7998f5779896f84f5834ea53991d15f65711686a9a79";

// Permet d'activer un mode démo forçé (sans crédit) si besoin
const DEMO_MODE = process.env.VIDEO_DEMO_MODE === "1";

export async function POST(req: Request) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const prompt   = (body.prompt || "").trim();
    const imageUrl = (body.imageUrl || "").trim();
    const ratio    = body.ratio || "16:9";
    const duration = Math.max(2, Math.min(10, body.duration || 5));

    // Si DEMO_MODE ou pas de token → renvoie direct une vidéo de démo
    if (DEMO_MODE || !token) {
      return NextResponse.json({
        ok: true,
        model: `${OWNER}/${NAME}`,
        demo: true,
        videos: [DEMO_VIDEO],
      });
    }

    const replicate = new Replicate({ auth: token! });

    // Création de prediction (SDK v1)
    const prediction = await replicate.predictions.create({
      version: VERSION,
      input: imageUrl
        ? { prompt: prompt || "cinematic shot", image: imageUrl, aspect_ratio: ratio, duration }
        : { prompt: prompt || "cinematic shot", aspect_ratio: ratio, duration },
    });

    // Deux options :
    // 1) On renvoie l'ID et le frontend poll via /api/replicate/prediction/[id]
    // 2) (optionnel) On attend la complétion ici. Pour l’instant on choisit 1).
    return NextResponse.json({
      ok: true,
      model: `${OWNER}/${NAME}`,
      predictionId: prediction?.id,
      versionId: prediction?.version,
    });
  } catch (e: any) {
    // Si le provider renvoie 402/404/… => démo pour ne pas cramer de crédits.
    const msg = e?.message || String(e);
    return NextResponse.json({
      ok: true,
      model: `${OWNER}/${NAME}`,
      demo: true,
      videos: [DEMO_VIDEO],
      note: "Fallback démo (pas de crédit consommé).",
      detail: msg,
    });
  }
}
