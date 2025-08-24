import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

type ReqBody = {
  prompt?: string;
  imageUrl?: string;
  ratio?: "16:9" | "9:16" | "1:1";
  duration?: number;
};

export async function POST(req: Request) {
  try {
    const DEMO = process.env.KEIRO_DEMO === "1";

    // URLs de démo (vidéos publiques déjà hébergées)
    const DEMO_VIDEOS: Record<string, string> = {
      "16:9": "https://samplelib.com/lib/preview/mp4/sample-5s.mp4",
      "1:1":  "https://replicate.delivery/xezq/rwFkDD2QRCYcD9vD6wB2iGgf7x6DFGSls7i9SRubOqjdiInKA/tmp_io0vsr0.mp4",
      "9:16": "https://samplelib.com/lib/preview/mp4/sample-5s.mp4"
    };

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const { prompt, imageUrl, ratio = "16:9", duration = 5 } = body;

    // MODE DEMO : on renvoie immédiatement une (fausse) vidéo générée
    if (DEMO) {
      const demoUrl = DEMO_VIDEOS[ratio] ?? DEMO_VIDEOS["16:9"];
      return NextResponse.json({
        ok: true,
        model: "demo",
        predictionId: `demo-${Date.now()}`,
        videos: [demoUrl],
        note: "Mode démo activé — aucun crédit consommé."
      });
    }

    // MODE RÉEL : utilise Replicate (Luma Ray)
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
    }

    const replicate = new Replicate({ auth: token });
    const owner = "luma";
    const name = "ray";

    // Récupérer la dernière version du modèle
    const mdl: any = await replicate.models.get(owner, name);
    const versionId: string | undefined =
      mdl?.latest_version?.id ?? mdl?.default_example?.version;

    if (!versionId) {
      return NextResponse.json({ ok: false, error: "No model version found" }, { status: 500 });
    }

    // Construire l'input (text->video ou image->video)
    const aspect_ratio =
      ratio === "16:9" ? "16:9" : ratio === "9:16" ? "9:16" : "1:1";

    const input: Record<string, any> = {
      prompt: prompt ?? "cinematic b-roll, natural light, soft motion",
      aspect_ratio,
      duration: Math.max(2, Math.min(duration, 10))
    };

    if (imageUrl) {
      // image-to-video
      input.image = imageUrl;
    }

    // Lancer la prédiction
    const prediction: any = await replicate.predictions.create({
      version: versionId,
      input
    });

    // Attendre la fin (polling simple ici côté serveur)
    let poll = prediction;
    const started = Date.now();
    const MAX_MS = 120000; // 120s max
    while (poll?.status && ["starting","processing"].includes(poll.status)) {
      if (Date.now() - started > MAX_MS) {
        break;
      }
      await new Promise(r => setTimeout(r, 3000));
      poll = await replicate.predictions.get(poll.id);
    }

    if (poll?.status === "succeeded" && poll?.output) {
      const out = Array.isArray(poll.output) ? poll.output : [poll.output];
      return NextResponse.json({
        ok: true,
        model: `${owner}/${name}`,
        versionId,
        predictionId: poll.id,
        videos: out
      });
    }

    return NextResponse.json({
      ok: false,
      error: "Video generation failed",
      detail: poll?.error || poll?.status || "unknown",
      predictionId: poll?.id ?? null
    }, { status: 500 });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
