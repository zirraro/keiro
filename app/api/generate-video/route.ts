import { NextResponse } from "next/server";
import Replicate from "replicate";

type Body = {
  sector?: string;
  context?: string;
  offer?: string;
  headline?: string;
  cta?: string;
  meta?: { objective?: string; brandColor?: string; businessType?: string; platform?: string };
  variants?: 1 | 3;
};

export async function POST(req: Request) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    const model = process.env.REPLICATE_MODEL_VERSION || "stability-ai/stable-diffusion";

    // sécurité env
    if (!token) {
      return NextResponse.json(
        { error: "Missing REPLICATE_API_TOKEN" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Body;

    const {
      sector = "",
      context = "",
      offer = "",
      headline = "",
      cta = "",
      meta = {},
      variants = 1,
    } = body || {};

    // Prompt simple mais propre
    const prompt = [
      headline && `Headline: ${headline}`,
      sector && `Sector: ${sector}`,
      meta?.businessType && `Business: ${meta.businessType}`,
      context && `Context: ${context}`,
      offer && `Highlight: ${offer}`,
      meta?.objective && `Objective: ${meta.objective}`,
      meta?.platform && `Platform: ${meta.platform}`,
      meta?.brandColor && `Brand color accent: ${meta.brandColor}`,
      "style: clean, bold, highly legible social ad, professional, photographic quality, soft lighting",
    ]
      .filter(Boolean)
      .join(", ");

    const replicate = new Replicate({ auth: token });

    // Stable Diffusion (image) — gratuit pour vérifier toute la chaîne
    const output = (await replicate.run(model as `${string}/${string}`, {
      input: {
        prompt,
        num_outputs: variants,
        // tailles raisonnables pour un premier test
        width: 768,
        height: 768,
        num_inference_steps: 30,
        guidance_scale: 7.5,
      },
    })) as string[] | string;

    const images = Array.isArray(output) ? output : [output];

    return NextResponse.json({
      images,
      note:
        "Démo via Stable Diffusion (Replicate) — la chaîne fonctionne ✅. On branchera ensuite un vrai modèle vidéo.",
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Replicate create failed",
        detail: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
