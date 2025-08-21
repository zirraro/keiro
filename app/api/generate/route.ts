import { NextResponse } from "next/server";

export const runtime = "nodejs";

type OpenAIImageItem = { b64_json: string };
type OpenAIImageResponse = { data: OpenAIImageItem[] };

function demoImageUrl(seed: string) {
  // Image démo 1024x1024 (gratuite) avec un "seed" pour varier
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/1024/1024`;
}

// GET = test santé
export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST {sector, context, offer, headline, cta}" });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
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

    // Si pas de clé → renvoie direct une image démo (permet de montrer le produit)
    if (!apiKey) {
      return NextResponse.json({
        demo: true,
        url: demoImageUrl(`${sector}-${context}-${offer}`)
      });
    }

    const prompt = `
Crée une affiche moderne 9:16 pour ${sector}.
Contexte: ${context}. Offre: ${offer}.
Accroche: "${headline}". Bouton/CTA: "${cta}".
Style: clair, lisible mobile, innovant pour réseaux sociaux.
Zones de texte bien contrastées, composition publicitaire nette.
`;

    async function callOpenAI(model: "gpt-image-1" | "dall-e-3") {
      return fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          size: "1024x1024",
          n: 1, // l’API n’autorise que 1
        }),
      });
    }

    let res = await callOpenAI("gpt-image-1");
    if (res.status === 404 || res.status === 400) {
      res = await callOpenAI("dall-e-3");
    }

    if (!res.ok) {
      const text = await res.text();

      // 🔁 Fallback démo si le blocage vient de la facturation
      if (text.includes("billing_hard_limit_reached")) {
        return NextResponse.json({
          demo: true,
          url: demoImageUrl(`${sector}-${context}-${offer}`),
          note: "OpenAI billing hard limit reached – image démo renvoyée.",
        });
      }

      return NextResponse.json(
        { error: "OpenAI error", status: res.status, details: text },
        { status: 500 }
      );
    }

    const data = (await res.json()) as OpenAIImageResponse; // { data: [{b64_json}] }
    return NextResponse.json({ data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erreur interne côté API" }, { status: 500 });
  }
}
