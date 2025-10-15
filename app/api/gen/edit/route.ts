export const runtime = "nodejs";

type EditBody = {
  baseImageDataUrl: string;   // data:image/...;base64,...
  prompt?: string;
  negative_prompt?: string;
  aspect_ratio?: string;
  strength?: number;          // 0..1
  style?: string;
  seed?: number;
  steps?: number;
  cfg?: number;
};

function dataURLtoBlob(dataUrl: string) {
  const m = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!m) throw new Error("bad_data_url");
  const [, mime, b64] = m;
  const buf = Buffer.from(b64, "base64");
  return new Blob([buf], { type: mime });
}

async function callSeeDreamEdit(body: EditBody) {
  const KEY = process.env.SEEDREAM_API_KEY;
  if (!KEY) return { ok:false, error:"missing_key" as const };

  const ENDPOINT = process.env.SEEDREAM_EDIT_URL || "https://api.seedream.ai/v1/images/edits";
  const SEND_MP = process.env.SEEDREAM_SEND_MULTIPART === "1";

  const common: any = {
    prompt: body.prompt || "Améliorer lisibilité, cadrage soigné.",
  };
  if (body.negative_prompt) common.negative_prompt = body.negative_prompt;
  if (body.aspect_ratio) common.aspect_ratio = body.aspect_ratio;
  if (body.strength != null) common.strength = body.strength;
  if (body.style) common.style = body.style;
  if (body.seed != null) common.seed = body.seed;
  if (body.steps != null) common.steps = body.steps;
  if (body.cfg != null) common.cfg = body.cfg;

  try {
    let res;
    if (SEND_MP) {
      const form = new FormData();
      form.set("prompt", common.prompt);
      if (common.negative_prompt) form.set("negative_prompt", common.negative_prompt);
      if (common.aspect_ratio) form.set("aspect_ratio", common.aspect_ratio);
      if (common.strength != null) form.set("strength", String(common.strength));
      if (common.style) form.set("style", common.style);
      if (common.seed != null) form.set("seed", String(common.seed));
      if (common.steps != null) form.set("steps", String(common.steps));
      if (common.cfg != null) form.set("cfg", String(common.cfg));

      const blob = dataURLtoBlob(body.baseImageDataUrl);
      form.set("image", blob, "base.png");

      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Authorization": `Bearer ${KEY}` },
        body: form,
      });
    } else {
      // JSON (si l'API accepte dataURL direct)
      const payload = { ...common, image: body.baseImageDataUrl };
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

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
  const body = await req.json() as EditBody;
  const r = await callSeeDreamEdit(body);
  if (r.ok) return Response.json({ imageDataUrl: r.dataUrl, used:"seedream" });
  return new Response(r.error || "edit_failed", { status: 502 });
}
