export type GenResult = { dataUrl: string };

async function ensureOk(r: Response) {
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`upstream ${r.status}: ${txt || r.statusText}`);
  }
}

export async function generateWithSeeDream({
  apiKey,
  baseUrl,
  prompt,
  width = 1024,
  height = 1024,
}: {
  apiKey: string;
  baseUrl: string;
  prompt: string;
  width?: number;
  height?: number;
}): Promise<GenResult> {
  // NOTE: adapte si besoin au schéma exact de SeeDream.
  // Ici on suppose un endpoint JSON qui renvoie du base64 dans "image" ou "b64"
  const url = `${baseUrl.replace(/\/$/, "")}/v1/images/generate`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      width,
      height,
      // ajoute/ajuste d'autres paramètres SeeDream ici :
      // guidance, steps, style, seed, upscale, etc.
      response_format: "b64", // <-- s'il faut "b64_json", change aussi le parsing en bas
    }),
  });
  await ensureOk(r);
  const j = await r.json();

  // essaie plusieurs clés courantes possibles
  const b64 =
    j?.image ||
    j?.b64 ||
    j?.data?.[0]?.b64 ||
    j?.data?.[0]?.b64_json ||
    j?.data?.b64 ||
    j?.output?.[0]?.b64;

  if (!b64 || typeof b64 !== "string") {
    throw new Error("SeeDream: payload without base64 image");
  }
  const dataUrl = /^data:image/.test(b64) ? b64 : `data:image/png;base64,${b64}`;
  return { dataUrl };
}
