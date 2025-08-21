import { NextResponse } from "next/server";

export const runtime = "nodejs"; // assure un runtime Node (pas Edge)

type OpenAIImageItem = { b64_json: string };
type OpenAIImageResponse = { data: OpenAIImageItem[] };

// GET = test rapide dans le navigateur
export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST here with {sector,context,offer,headline,cta}" });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY absente sur Vercel → Project → Settings → Environment Variables." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as {
      sector: string; context: string; offer: string; headline: string; cta: string;
    };

    const { sector, context, offer, headline, cta } = body || {};
    if (!sector || !context || !offer || !headline || !cta) {
      return NextResponse.json(
        { error: "Champs manquants. Attendus: sector, context, offer, headline, cta." },
        { status: 400 }
      );
    }

    const prompt = `
Crée une affiche moderne 9:16 pour ${sector}.
Contexte: ${context}. Offre: ${offer}.
Accroche: "${headline}". Bouton/CTA: "${cta}".
Style: clair, lisible mobile, look innovant pour réseaux sociaux.
Zones de texte bien contrastées.
`;

    // Modèle: certains comptes n'ont pas "gpt-image-1". On tente d'abord, puis fallback "dall-e-3".
    async function callOpenAI(model: "gpt-image-1" | "dall-e-3") {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 3,
          size: "1024x1024",
        }),
      });
      return res;
    }

    let res = await callOpenAI("gpt-image-1");
    if (res.status === 404 || res.status === 400) {
      // modèle indisponible → on retente avec dall-e-3
      res = await callOpenAI("dall-e-3");
    }

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "OpenAI error", status: res.status, details: text },
        { status: 500 }
      );
    }

    const data = (await res.json()) as OpenAIImageResponse;
    return NextResponse.json({ data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erreur interne côté API" }, { status: 500 });
  }
}
