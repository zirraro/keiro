import { NextResponse } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const API_KEY = process.env.OPENAI_API_KEY;
    if (!API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 200 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      kind = "image",
      prompt,
      brand = "",
      goal = "",
      tone = "",
      constraints = "",
      cta = "",
      hashtags = "",
      article,
    } = body || {};

    if (kind !== "image") {
      return NextResponse.json({ error: "Only image generation is implemented." }, { status: 400 });
    }

    // Compose a robust prompt from provided fields (fallbacks if needed)
    const title =
      article?.title ||
      (body?.news?.title ?? "").trim() ||
      "Créer un visuel social percutant lié à l'actualité";
    const basePrompt =
      prompt ||
      [
        `Sujet: ${title}`,
        article?.url ? `Source: ${article?.source || ""} — ${article?.url}` : undefined,
        brand ? `Marque: ${brand}` : undefined,
        goal ? `Objectif: ${goal}` : undefined,
        tone ? `Tonalité: ${tone}` : undefined,
        constraints ? `Contraintes: ${constraints}` : undefined,
        cta ? `CTA: ${cta}` : undefined,
        hashtags ? `Hashtags: ${hashtags}` : undefined,
        `Plateforme: Instagram | Format: Portrait (1080x1350)`,
        `Sortie: visuel prêt à poster (pas de texte trop dense).`,
      ]
        .filter(Boolean)
        .join("\n");

    const openai = new OpenAI({ apiKey: API_KEY });

    // Génération synchronisée
    const res = await openai.images.generate({
      model: "gpt-image-1",
      prompt: basePrompt,
      size: "1024x1024", // ou "1024x1344" si tu veux portrait strict
    });

    const b64 = res?.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "No image content returned." }, { status: 500 });
    }

    const id = randomUUID();
    const outPath = path.join(process.cwd(), "public", "previews", `${id}.png`);
    await fs.writeFile(outPath, Buffer.from(b64, "base64"));

    const url = `/previews/${id}.png`;
    return NextResponse.json({ url, id }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Generation failed." },
      { status: 500 }
    );
  }
}
