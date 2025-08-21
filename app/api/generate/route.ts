import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sector, context, offer, headline, cta } = body;

    const prompt = `
Crée une affiche moderne 9:16 pour ${sector}.
Contexte: ${context}. Offre: ${offer}.
Accroche: "${headline}". Bouton/CTA: "${cta}".
Style: clair, lisible mobile, look innovant pour réseaux sociaux.
Intégrer des zones de texte bien contrastées.
`;

    // Appel OpenAI Images (serveur) — nécessite OPENAI_API_KEY sur Vercel
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 3,
        size: "1024x1024",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("OpenAI error:", res.status, text);
      return NextResponse.json({ error: "OpenAI error", details: text }, { status: 500 });
    }

    const data = await res.json(); // { data: [{b64_json: "..."}] }
    return NextResponse.json({ data });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Erreur lors de la génération" }, { status: 500 });
  }
}
