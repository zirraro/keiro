import { NextResponse } from "next/server";
import OpenAI from "openai";
import { GeneratePayloadSchema } from "@/lib/validators";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL, // optionnel
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const payload = GeneratePayloadSchema.parse(json);

    const newsBullets = payload.selectedNews
      .map((n, i) => `- [${i+1}] ${n.title}${n.source ? ` — ${n.source}` : ""}${n.snippet ? ` | ${n.snippet}` : ""}`)
      .join("\n");

    const system = [
      "Tu es un stratège marketing sénior.",
      "Tu rédiges dans un style clair, concis, orienté business, sans jargon inutile.",
      payload.lang === "fr" ? "Réponds en français." : payload.lang === "it" ? "Rispondi in italiano." : "Reply in English."
    ].join(" ");

    const user = `
Contexte Marque: ${payload.brand}
Audience: ${payload.audience}
Objectif: ${payload.objective}
Tonalité: ${payload.ton}
Format souhaité: ${payload.format}
Sélection d'actualités:
${newsBullets}

Contraintes:
- ${payload.safeMode ? "Évite toute promesse excessive/réglementaire et tout contenu à risque réputationnel." : "Tu peux utiliser un ton plus incisif si pertinent."}
- Donne d’abord une "Idée globale" (1 paragraphe synthèse).
- Puis propose 3 variations prêtes à publier au format demandé (bullet points si utile).
- Termine par 5 hashtags pertinents (si format social).
    `.trim();

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ result: text });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "GENERATION_FAILED" }, { status: 400 });
  }
}

cat > app/lib/catMap.ts <<'TS'
import { slugFromAny, UI_OPTIONS } from "@/app/lib/newsCategories";
export { UI_OPTIONS };
export function buildNewsUrlFixed(categoryDisplay: string, period: string, limit: number) {
  const cat = slugFromAny(categoryDisplay);
  return `/api/news/search?cat=${encodeURIComponent(cat)}&timeframe=${encodeURIComponent(period)}&limit=${limit}`;
}
TS


