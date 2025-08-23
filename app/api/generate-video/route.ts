import { NextResponse } from 'next/server';

type GenRequest = {
  prompt: string;
  seconds?: number;
  aspect?: '9:16' | '1:1' | '16:9';
  seed?: number;
};

type ReplicatePrediction =
  | { id: string; status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'; output?: string | string[]; error?: string }
  | { [k: string]: unknown };

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

export async function POST(req: Request) {
  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json({ error: 'Missing REPLICATE_API_TOKEN' }, { status: 500 });
  }

  let body: GenRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { prompt, seconds = 3, aspect = '9:16', seed } = body;
  if (!prompt || prompt.trim().length < 5) {
    return NextResponse.json({ error: 'Prompt insuffisant' }, { status: 400 });
  }

  // Exemple: modèle vidéo générique via Replicate (tu pourras en changer facilement)
  // NOTE: certains modèles attendent d’autres champs d’entrée (guidance, fps, resolution, etc.).
  const model = "luma-ai/phoenix:latest"; // remplaçable par un autre modèle vidéo compatible

  try {
    // 1) Créer une prédiction
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: model,
        input: {
          prompt,
          // champs courants, à ajuster selon le modèle
          width: aspect === '9:16' ? 576 : aspect === '1:1' ? 768 : 1024,
          height: aspect === '9:16' ? 1024 : aspect === '1:1' ? 768 : 576,
          duration: Math.max(1, Math.min(8, seconds)),
          seed,
        },
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      return NextResponse.json({ error: 'API video: create failed', details: text }, { status: 500 });
    }

    const prediction = (await createRes.json()) as ReplicatePrediction & { urls?: { get: string } };
    if (!('id' in prediction) || !prediction?.urls?.get) {
      return NextResponse.json({ error: 'API video: invalid response' }, { status: 500 });
    }

    // 2) Poll jusqu’à completion
    const statusUrl = prediction.urls.get;
    const startedAt = Date.now();
    const timeoutMs = 1000 * 120; // 2 minutes max pour le MVP

    async function poll(): Promise<ReplicatePrediction> {
      while (Date.now() - startedAt < timeoutMs) {
        const r = await fetch(statusUrl, {
          headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` },
          cache: 'no-store',
        });
        const j = (await r.json()) as ReplicatePrediction;
        if ('status' in j) {
          if (j.status === 'succeeded' || j.status === 'failed' || j.status === 'canceled') {
            return j;
          }
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
      return { status: 'failed', error: 'Timeout' } as ReplicatePrediction;
    }

    const final = await poll();

    if ('status' in final && final.status === 'succeeded') {
      // selon le modèle, output peut être une string (mp4) ou une liste
      const out = (final as any).output;
      const url = Array.isArray(out) ? out[out.length - 1] : out;
      return NextResponse.json({ ok: true, video: url }, { status: 200 });
    } else {
      const err = (final as any)?.error || 'Video generation failed';
      return NextResponse.json({ error: err }, { status: 500 });
    }
  } catch (e) {
    const msg = (e as { message?: string })?.message || 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
