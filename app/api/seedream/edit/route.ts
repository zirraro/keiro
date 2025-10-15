export const runtime = "nodejs";

function env(k: string, d?: string) {
  return process.env[k] ?? d ?? "";
}

function pickUrlLike(obj: any): string | undefined {
  if (!obj) return;
  if (typeof obj.url === "string") return obj.url;
  if (Array.isArray(obj.data) && obj.data[0]?.url) return obj.data[0].url;
  if (Array.isArray(obj.images) && obj.images[0]?.url) return obj.images[0].url;
  if (typeof obj.image_base64 === "string")
    return `data:image/png;base64,${obj.image_base64}`;
  return undefined;
}

export async function POST(req: Request) {
  const BASE  = env("SEEDREAM_BASE_URL", "https://api.seedream.ai");
  const PATH  = env("SEEDREAM_EDIT_PATH", "/v1/images/edit");
  const KEY   = env("SEEDREAM_API_KEY");
  const ORG   = env("SEEDREAM_ORG_ID", "");

  if (!KEY) {
    return Response.json(
      { error: "config_error", message: "SEEDREAM_API_KEY manquant" },
      { status: 400 }
    );
  }

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "bad_request", message: "JSON invalide" }, { status: 400 });
  }

  const source = payload.source;           // URL (http/https) ou data:
  const edits  = payload.edits || {};      // { instruction: string, ... }

  if (!source) {
    return Response.json({ error: "bad_request", message: "source manquante" }, { status: 400 });
  }

  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), +(process.env.SEEDREAM_TIMEOUT_MS||"45000"));

  try {
    const url = `${BASE.replace(/\/+$/,'')}${PATH}`;
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Authorization": `Bearer ${KEY}`,
        "Content-Type": "application/json",
        ...(ORG ? { "X-Organization": ORG } : {}),
        "Accept": "application/json",
      },
      body: JSON.stringify({
        source,
        ...edits,
      }),
    });

    let body: any = null;
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = text; }

    if (!res.ok) {
      return Response.json(
        { error: "upstream_error", status: res.status, body },
        { status: 502 }
      );
    }

    let img = pickUrlLike(body) || pickUrlLike((body as any)?.result);
    if (!img) {
      return Response.json(
        { error: "invalid_response", body },
        { status: 502 }
      );
    }

    return Response.json({ url: img }, { status: 200 });
  } catch (e:any) {
    const message = e?.name === "AbortError" ? "timeout" : (e?.message || "fetch failed");
    return Response.json({ error: "network_error", message }, { status: 502 });
  } finally {
    clearTimeout(t);
  }
}
