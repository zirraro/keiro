import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Normalise la réponse API: renvoie toujours { images: string[], demo?: boolean, note?: string } */
type BodyIn = {
  sector: string;
  context: string;
  offer: string;      // (= "Mise en avant")
  headline: string;
  cta: string;
  meta?: {
    objective?: "promo" | "event" | "leads";
    brandColor?: string;
    businessType?: string;
    platform?: "instagram" | "tiktok" | "facebook" | "linkedin" | "x";
    format?: "auto" | "square" | "vertical" | "wide";
  };
  variants?: number;   // 1 ou 3 (défaut 1)
};

function demoImageUrl(seed: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/1024/1024`;
}

// GET = test santé
export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST JSON -> { sector, context, offer, headline, cta, meta?, variants? }" });
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  try {
    const body = (await req.json()) as BodyIn;
    const { sector, context, offer, headline, cta, meta = {}, variants = 1 } = body || {};
    if (!sector || !context || !offer || !headline || !cta) {
      return NextResponse.json(
        { error: "Champs manquants. Attendus: sector, context, offer, headline, cta." },
        { status: 400 }
      );
    }

    // Prompt enrichi (plateforme + format + businessType + couleur + objectif)
    const lines: string[] = [
      `Crée un visuel publicitaire moderne et net pour les réseaux sociaux.`,
      `Secteur: ${sector}${meta.businessType ? ` — ${meta.businessType}` : ""}.`,
      `Contexte (actualité / tendance): ${context}.`,
      `Mise en avant principale: ${offer}.`,
      `Accroche: "${headline}". CTA: "${cta}".`,
      `Objectif: ${meta.objective || "promo"} (adapte le ton).`,
      `Palette: privilégie ${meta.brandColor || "#2b82f6"} comme couleur primaire + bon contraste.`,
      `Composition mobile-first, lisible, zones de texte bien hiérarchisées.`,
    ];

    if (meta.platform) {
      lines.push(`Plateforme ciblée: ${meta.platform}.`);
    }
    if (meta.format && meta.format !== "auto") {
      lines.push(
        `Format souhaité: ${meta.format === "square" ? "carré (1:1)" : meta.format === "vertical" ? "vertical (9:16)" : "large (16:9/1.91:1)"}`
      );
    } else {
      lines.push(`Choisis automatiquement le meilleur ratio pour la plateforme visée.`);
    }

    const prompt = lines.join("\n");

    async function callOpenAIOnce(): Promise<string | { billingError: true }> {
      if (!apiKey) {
        return demoImageUrl(`${sector}-${context}-${offer}-${Math.random()}`);
      }
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          size: "1024x1024",
          n: 1, // l’API images n’autorise que 1
        }),
      });

      if (res.status === 404 || res.status === 400) {
        // Essai compat DALL·E 3 si dispo
        const fallback = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt,
            size: "1024x1024",
            n: 1,
          }),
        });
        if (!fallback.ok) {
          const text = await fallback.text();
          if (text.includes("billing_hard_limit_reached")) return { billingError: true };
          throw new Error(text);
        }
        const json = (await fallback.json()) as { data?: { b64_json?: string }[] };
        const b64 = json?.data?.[0]?.b64_json;
        if (!b64) throw new Error("Réponse inattendue (fallback).");
        return `data:image/png;base64,${b64}`;
      }

      if (!res.ok) {
        const text = await res.text();
        if (text.includes("billing_hard_limit_reached")) return { billingError: true };
        throw new Error(text);
      }

      const data = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new Error("Réponse inattendue.");
      return `data:image/png;base64,${b64}`;
    }

    const count = Math.min(Math.max(variants || 1, 1), 3); // borne 1..3
    const images: string[] = [];

    for (let i = 0; i < count; i++) {
      const res = await callOpenAIOnce();
      if (typeof res === "object" && "billingError" in res) {
        // Fallback démo: picsum
        while (images.length < count) {
          images.push(demoImageUrl(`${sector}-${context}-${offer}-${Math.random()}`));
        }
        return NextResponse.json({
          demo: true,
          note: "OpenAI: limite de facturation atteinte — images démo affichées.",
          images,
        });
      }
      images.push(res);
    }

    return NextResponse.json({ images });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Erreur interne", details: String(err?.message || err) }, { status: 500 });
  }
}
