import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Body = {
  sector?: string;
  context?: string;
  offer?: string;
  headline?: string;
  cta?: string;
  meta?: Record<string, unknown>;
};

async function createReplicatePrediction(version: string, prompt: string, token: string) {
  // Crée la prédiction
  const resp = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({
      version,
      input: {
        prompt,               // texte de prompt
        // ⚠️ adapte ces champs au modèle que tu utilises réellement
        // par exemple pour un modèle "video generation", certains attendent: "fps", "duration", "resolution", etc.
        // on reste minimal ici pour éviter les erreurs de schéma
      },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Replicate create failed (${resp.status}): ${t}`);
  }

  return resp.json() as Promise<{
    id: string;
    status: string;
    urls: { get: string };
  }>;
}

async function pollPrediction(getUrl: string, token: string, timeoutMs = 45000, intervalMs = 2500) {
  const started = Date.now();
  // On poll jusqu'à 45s pour essayer de récupérer une URL de sortie
  while (Date.now() - started < timeoutMs) {
    const r = await fetch(getUrl, {
      headers: { Authorization: `Token ${token}` },
      cache: "no-store",
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`Replicate get failed (${r.status}): ${t}`);
    }
    const j = await r.json();
    if (j.status === "succeeded") {
      // beaucoup de modèles retournent output: string[] ou string
      const out = j.output;
      if (Array.isArray(out) && out.length > 0) return { url: out[0], raw: j };
      if (typeof out === "string") return { url: out, raw: j };
      return { url: null, raw: j };
    }
    if (j.status === "failed" || j.status === "canceled") {
      throw new Error(`Replicate status=${j.status}: ${JSON.stringify(j)}`);
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return { url: null, raw: { timeout: true } };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    // petit contrôle d’input (non bloquant)
    const sector = body?.sector ?? "commerce";
    const context = body?.context ?? "actualité locale";
    const offer = body?.offer ?? "mise en avant";
    const headline = body?.headline ?? "Titre vidéo";
    const cta = body?.cta ?? "Découvrir";

    // Compose un prompt simple
    const prompt = `Créer une courte vidéo promo ${sector}, contexte: ${context}, mise en avant: ${offer}, accroche: "${headline}", CTA: "${cta}".`;

    const token = process.env.REPLICATE_API_TOKEN;
    const videoModel = process.env.REPLICATE_VIDEO_MODEL || 'stability-ai/stable-video-diffusion-img2vid'; // doit pointer vers un modèle vidéo compatible

    // Fallback démo si l’API n’est pas prête côté env
    if (!token || !version) {
      return NextResponse.json(
        {
          demo: true,
          note:
            "REPLICATE_API_TOKEN ou REPLICATE_MODEL_VERSION manquant(s). Retour d’une vidéo démo.",
          url: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4",
        },
        { status: 200 }
      );
    }

    const created = await createReplicatePrediction(version, prompt, token);
    const polled = await pollPrediction(created.urls.get, token);

    if (polled.url) {
      return NextResponse.json(
        { url: polled.url, status: "succeeded" },
        { status: 200 }
      );
    }

    // pas d'URL dans le temps imparti -> propose polling côté client
    return NextResponse.json(
      {
        status: "processing",
        predictionUrl: created.urls.get,
        note:
          "Traitement en cours côté Replicate. Re-poller l’URL 'predictionUrl' depuis le client si besoin.",
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const err = e as Error;
    console.error("generate-video error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
