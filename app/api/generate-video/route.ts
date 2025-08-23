import { NextResponse } from 'next/server';

type GenRequest = {
  prompt: string;
  seconds?: number;              // durée max conseillée 2–4s pour tests
  aspect?: '9:16' | '1:1' | '16:9';
  seed?: number;
};

// Replicate attend un "version" (hash) du modèle, pas ":latest"
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_MODEL_VERSION = process.env.REPLICATE_MODEL_VERSION; 
// Exemple attendu: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" (un hash de version fourni par Replicate)

export async function POST(req: Request) {
  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: 'Missing REPLICATE_API_TOKEN (Vercel > Settings > Environment Variables)' },
      { status: 500 }
    );
  }
  if (!REPLICATE_MODEL_VERSION) {
    return NextResponse.json(
      { error: 'Missing REPLICATE_MODEL_VERSION (set the model version hash from Replicate)' },
      { status: 500 }
    );
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

  // Dimensions simples selon aspect (ajuste si besoin selon le modèle choisi)
  const inputWidth  = aspect === '9:16' ? 576  : aspect === '1:1' ? 768  : 1024;
  const inputHeight = aspect === '9:16' ? 1024 : aspect === '1:1' ? 768  : 576;
  const duration = Math.max(1, Math.min(8, seconds)); // 1..8s pour MVP

  try {
    // 1) Créer la prédiction (avec "version" exigé par Replicate)
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: REPLICATE_MODEL_VERSION,
        input: {
          prompt,
          width: inputWidth,
          height: inputHeight,
          duration,
          seed,
        },
      }),
    });

    const createText = await createRes.text();
    if (!createRes.ok) {
      // On renvoie le détail brut pour aider au debug côté client
      return NextResponse.json({ error: 'API video: create failed', details: createText }, { status: 500 });
    }

    const created = JSON.parse(createText) as {
      id?: string;
      status?: string;
      urls?: { get?: string };
    };

    if (!created?.urls?.get) {
      return NextResponse.json({ error: 'API video: missing status URL', details: createText }, { status: 500 });
    }

    // 2) Poll jusqu’à completion
    const statusUrl = created.urls.get!;
    const startedAt = Date.now();
    const timeoutMs = 1000 * 120; // 2 min

    async function poll(): Promise<any> {
      while (Date.now() - startedAt < timeoutMs) {
        const r = await fetch(statusUrl, {
          headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` },
          cache: 'no-store',
        });
        const j = await r.json();
        if (j?.status === 'succeeded') return j;
        if (['failed', 'canceled'].includes(j?.status)) return j;
        await new Promise(res => setTimeout(res, 2000));
      }
      return { status: 'failed', error: 'Timeout' };
    }

    const final = await poll();
    if (final?.status === 'succeeded') {
      // Selon le modèle, output peut être une string ou un array de frames/urls
      const out = final?.output;
      const url = Array.isArray(out) ? out[out.length - 1] : out;
      if (!url) {
        return NextResponse.json({ error: 'API video: no output URL', details: JSON.stringify(final) }, { status: 500 });
      }
      return NextResponse.json({ ok: true, video: url }, { status: 200 });
    }

    return NextResponse.json(
      { error: 'API video: generation failed', details: JSON.stringify(final) },
      { status: 500 }
    );

  } catch (e: any) {
    return NextResponse.json({ error: 'Server error', details: e?.message || String(e) }, { status: 500 });
  }
}
