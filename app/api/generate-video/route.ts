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

    if (!token) {
      return NextResponse.json({ error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
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

    const prompt = [
      headline && `Headline: ${headline}`,
      sector && `Sector: ${sector}`,
      context && `Context: ${context}`,
      offer && `Highlight: ${offer}`,
      meta?.objective && `Objective: ${meta.objective}`,
      meta?.platform && `Platform: ${meta.platform}`,
      meta?.brandColor && `Brand color: ${meta.brandColor}`,
      "style: clean, professional, cinematic, trending on artstation",
    ]
      .filter(Boolean)
      .join(", ");

    const replicate = new Replicate({ auth: token });

    console.log(">>> Replicate model:", model);
    console.log(">>> Prompt:", prompt);

    // typage forcé
    const output = (await replicate.run(model as `${string}/${string}`, {
      input: {
        prompt,
        num_outputs: variants,
        width: 512,
        height: 512,
      },
    })) as string[] | string;

    const images = Array.isArray(output) ? output : [output];

    return NextResponse.json({ images, prompt });
  } catch (err: any) {
    console.error(">>> ERROR Replicate:", err);
    return NextResponse.json(
      {
        error: "Replicate create failed",
        detail: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
