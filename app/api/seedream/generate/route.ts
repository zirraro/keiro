import { NextResponse } from 'next/server';
import { Agent } from 'undici';

export const runtime = 'nodejs';

function envs() {
  const base = (process.env.SEEDREAM_BASE_URL || 'https://api.seedream.ai').replace(/\/+$/, '');
  const key  = (process.env.SEEDREAM_API_KEY || '').trim();
  const rawSni = (process.env.SEEDREAM_SNI || new URL(base).hostname).trim().toLowerCase();
  // Permet de désactiver SNI avec 'none' ou 'disable'
  const sni: string | undefined = (rawSni === 'none' || rawSni === 'disable') ? undefined : rawSni;
  const insecure = process.env.SEEDREAM_INSECURE === '1';
  const mock     = process.env.SEEDREAM_MOCK === '1';
  return { base, key, sni, insecure, mock };
}

export async function POST(req: Request) {
  const { base, key, sni, insecure, mock } = envs();

  let body: any = {};
  try { body = await req.json(); } catch {}
  const prompt = body?.prompt;
  const size   = body?.size || '1024x1024';

  if (!prompt) {
    return NextResponse.json({ error: 'bad_request', message: 'prompt manquant' }, { status: 400 });
  }

  if (mock) {
    const [w,h] = String(size).split('x');
    const url = `https://picsum.photos/seed/${encodeURIComponent(prompt)}/${w}/${h}`;
    return NextResponse.json({ url, debug: { mock: true } });
  }

  if (!key) {
    return NextResponse.json({ error: 'missing_key' }, { status: 500 });
  }

  // Agent undici avec SNI optionnel et TLS facultatif (diagnostic)
  const dispatcher = new Agent({
    connect: {
      servername: sni,               // undefined => sans SNI
      rejectUnauthorized: !insecure, // INSECURE=1 pour diagnose uniquement
    }
  });

  try {
    const res = await fetch(`${base}/v1/images/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type' : 'application/json',
      },
      body: JSON.stringify({ prompt, size }),
      dispatcher
    });

    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
      console.error('Seedream HTTP error', res.status, data);
      return NextResponse.json({
        error: 'seedream_error',
        status: res.status,
        data,
        _ctx: { base, sni: sni ?? '(none)', insecure }
      }, { status: 502 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('Seedream network_error:', e?.message || e);
    return NextResponse.json({
      error: 'network_error', message: String(e?.message || e),
      _ctx: { base, sni: sni ?? '(none)', insecure }
    }, { status: 500 });
  } finally {
    dispatcher.close();
  }
}
