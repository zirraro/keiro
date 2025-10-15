export const runtime = "nodejs";

type Body = {
  prompt?: string;
  selected?: { title?: string; description?: string; source?: string; url?: string; image?: string } | null;
  negative_prompt?: string;
  aspect_ratio?: string;   // "1:1", "4:5", "16:9"...
  seed?: number;
  steps?: number;
  cfg?: number;
  style?: string;
};

function escapeXML(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildFallbackSVG(body: Body) {
  const title = escapeXML(body.selected?.title || "Actu non sélectionnée");
  const src = escapeXML(body.selected?.source || "");
  const p = escapeXML((body.prompt || "Visuel social moderne et lisible.").slice(0, 180));
  const now = new Date().toLocaleDateString("fr-FR");
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#111"/><stop offset="100%" stop-color="#333"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <g transform="translate(80,80)">
    <rect x="0" y="0" width="1440" height="740" rx="28" fill="#fff" opacity="0.08"/>
    <text x="0" y="48" fill="#fff" font-family="Inter, system-ui" font-size="28" opacity="0.8">${now}${src ? " • " + src : ""}</text>
    <foreignObject x="0" y="80" width="1440" height="380">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter, system-ui; color:#fff; font-size:52px; line-height:1.15; font-weight:700;">${title}</div>
    </foreignObject>
    <foreignObject x="0" y="500" width="1440" height="200">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter, system-ui; color:#eaeaea; font-size:28px; line-height:1.35;">${p}</div>
    </foreignObject>
  </g>
</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

async function callSeeDreamGenerate(body: Body) {
  const KEY = process.env.SEEDREAM_API_KEY;
  if (!KEY) return { ok:false, error:"missing_key" as const };

  const ENDPOINT = process.env.SEEDREAM_GENERATE_URL || "https://api.seedream.ai/v1/images";

  const payload: any = {
    prompt: body.prompt || "Visuel social moderne et lisible.",
  };
  if (body.negative_prompt) payload.negative_prompt = body.negative_prompt;
  if (body.aspect_ratio) payload.aspect_ratio = body.aspect_ratio;
  if (body.seed != null) payload.seed = body.seed;
  if (body.steps != null) payload.steps = body.steps;
  if (body.cfg != null) payload.cfg = body.cfg;
  if (body.style) payload.style = body.style;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) return { ok:false, error:`HTTP ${res.status}: ${text}` };

    let data: any = {};
    try { data = JSON.parse(text); } catch { return { ok:false, error:"invalid_json" as const }; }

    if (data?.image_base64) return { ok:true, dataUrl:`data:image/png;base64,${data.image_base64}` };
    if (data?.image_url) {
      const r2 = await fetch(data.image_url);
      if (!r2.ok) return { ok:false, error:`download_fail ${r2.status}` };
      const buf = Buffer.from(await r2.arrayBuffer());
      return { ok:true, dataUrl:`data:image/png;base64,${buf.toString("base64")}` };
    }
    return { ok:false, error:"unknown_response" as const };
  } catch (e:any) {
    return { ok:false, error:`network_error: ${e?.message||e}` };
  }
}

export async function POST(req: Request) {
  const body = await req.json() as Body;
  const sd = await callSeeDreamGenerate(body);
  if (sd.ok) return Response.json({ imageDataUrl: sd.dataUrl, used:"seedream" });

  // Fallback + renvoie la raison du fallback pour debug UI
  const fallback = buildFallbackSVG(body);
  return Response.json({ imageDataUrl: fallback, used:"fallback", reason: sd.error ?? "unknown" });
}
