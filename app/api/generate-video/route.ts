import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

// Types léger côté input
type ReqBody = {
  prompt?: string;
  imageUrl?: string; // si présent => image-to-video, sinon text-to-video
  ratio?: "16:9" | "9:16" | "1:1";
  duration?: number; // en secondes (ex: 5)
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
      prompt = "cinematic city b-roll at golden hour, soft camera moves, film look",
      imageUrl,
      ratio = "1:1",
      duration = 5,
    } = body;

    const replicate = new Replicate({ auth: token! });

    // ⚠️ Modèle vidéo Luma (Dream Machine) hébergé sur Replicate
    // - text-to-video: fournir "prompt"
    // - image-to-video: fournir "image"
    // Docs modèle: https://replicate.com/luma/ray (API)
    const model = "luma/ray" as `${string}/${string}`;

    // Prépare l'input selon le mode
    const input: Record<string, unknown> = {
      aspect_ratio: ratio,    // "16:9" | "9:16" | "1:1"
      duration,               // 5..10s en général
    };

    if (imageUrl) {
      // image-to-video
      input.image = imageUrl;
      if (prompt) input.prompt = prompt;
    } else {
      // text-to-video
      input.prompt = prompt;
    }

    // Exécute la génération
    // Le SDK peut renvoyer soit une string (URL vidéo), soit un objet/array selon le modèle
    const output = (await replicate.run(model, { input })) as any;

    // Essaie d’en tirer des URLs vidéos
    let videos: string[] = [];
    if (typeof output === "string") {
      videos = [output];
    } else if (Array.isArray(output)) {
      videos = output.filter((x) => typeof x === "string");
    } else if (output?.video) {
      videos = [output.video];
    } else if (output?.output) {
      // parfois { output: [url] }
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

    return NextResponse.json({ ok: true, videos, raw: output });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Replicate video generation failed",
        detail: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
