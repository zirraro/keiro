import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

type Body = {
  prompt?: string;
  imageUrl?: string;
  fps?: number;
  num_frames?: number;
};

const DEFAULT_IMAGE =
  "https://replicate.delivery/pbxt/8o3w3vN9/test-square.png"; // fallback public (démo)
const PRIMARY = { owner: "stability-ai", name: "stable-video-diffusion" };            // input_image
const SECONDARY = { owner: "stability-ai", name: "stable-video-diffusion-img2vid" };  // image

async function createWithLatestVersion(
  replicate: Replicate,
  model: { owner: string; name: string },
  input: Record<string, unknown>
) {
  // Récupère la dernière version; le SDK attend (owner, name)
  const mdl = await replicate.models.get(model.owner, model.name);
  const versionId =
    (mdl as any)?.latest_version?.id ||
    (mdl as any)?.default_example?.version;

  if (!versionId) {
    throw new Error(`No version found for ${model.owner}/${model.name}`);
  }

  // Lance une prediction avec un identifiant de version concret
  const pred = await replicate.predictions.create({
    version: versionId,
    input,
  });

  // Option: attendre le résultat (simple polling)
  // Tu peux sinon retourner pred.id et faire un /status séparé coté client
  let last = pred;
  const started = Date.now();
  while (
    last.status === "starting" ||
    last.status === "processing" ||
    last.status === "queued"
  ) {
    // délai court (1s)
    await new Promise((r) => setTimeout(r, 1000));
    last = await replicate.predictions.get(pred.id);
    // coupe après ~60s pour éviter les timeouts
    if (Date.now() - started > 60000) break;
  }

  return last;
}

export async function POST(req: Request) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing REPLICATE_API_TOKEN" },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const prompt =
      body.prompt ||
      "short dynamic social clip, aesthetic lighting, cinematic";
    const imageUrl =
      (body.imageUrl && body.imageUrl.trim()) || DEFAULT_IMAGE; // fallback image
    const fps = Number.isFinite(body.fps) ? Number(body.fps) : 24;
    const num_frames = Number.isFinite(body.num_frames)
      ? Number(body.num_frames)
      : 25;

    if (!/^https?:\/\/.+/i.test(imageUrl)) {
      return NextResponse.json(
        { ok: false, error: "imageUrl must be a valid http(s) URL" },
        { status: 400 }
      );
    }

    const replicate = new Replicate({ auth: token });

    // 1) Tente d'abord le modèle "stable-video-diffusion" (clé: input_image)
    try {
      const inputPrimary: Record<string, unknown> = {
        input_image: imageUrl,
        prompt,
        fps,
        // selon modèles, d’autres params existent (motion_bucket_id, cond_aug, decoding_t, cfg_scale…)
        // on reste minimal pour compat
        num_frames, // certains builds l’ignorent; pas grave
      };

      const out1 = await createWithLatestVersion(replicate, PRIMARY, inputPrimary);
      if (out1?.output) {
        return NextResponse.json({
          ok: true,
          model: `${PRIMARY.owner}/${PRIMARY.name}`,
          usedImage: imageUrl,
          output: out1.output,
          status: out1.status,
          id: out1.id,
        });
      }
      // s’il n’y a pas d’output, on essaie le second
      // (ça arrive si version lente/timeouts; on retourne quand même l’id)
      return NextResponse.json({
        ok: true,
        model: `${PRIMARY.owner}/${PRIMARY.name}`,
        usedImage: imageUrl,
        output: out1?.output || null,
        status: out1?.status,
        id: out1?.id,
        note:
          "Prediction started for primary model; poll /v1/predictions/{id} client-side if needed.",
      });
    } catch (e: any) {
      // si c’est un 404 (modèle non trouvé), on bascule sur le secondaire
      const msg =
        e?.response?.data || e?.message || String(e);
      const is404 =
        (e?.response?.status === 404) ||
        /404|not\s*found/i.test(String(msg));
      if (!is404) {
        // autre erreur => on remonte
        throw e;
      }
    }

    // 2) Fallback : "stable-video-diffusion-img2vid" (clé: image)
    try {
      const inputSecondary: Record<string, unknown> = {
        image: imageUrl,
        prompt,
        fps,
        num_frames,
      };

      const out2 = await createWithLatestVersion(replicate, SECONDARY, inputSecondary);
      if (out2?.output) {
        return NextResponse.json({
          ok: true,
          model: `${SECONDARY.owner}/${SECONDARY.name}`,
          usedImage: imageUrl,
          output: out2.output,
          status: out2.status,
          id: out2.id,
        });
      }
      return NextResponse.json({
        ok: true,
        model: `${SECONDARY.owner}/${SECONDARY.name}`,
        usedImage: imageUrl,
        output: out2?.output || null,
        status: out2?.status,
        id: out2?.id,
        note:
          "Prediction started for secondary model; poll /v1/predictions/{id} client-side if needed.",
      });
    } catch (e2: any) {
      const detail = e2?.response?.data || e2?.message || String(e2);
      return NextResponse.json(
        { ok: false, error: "Both models failed", detail },
        { status: 500 }
      );
    }
  } catch (err: any) {
    const message = err?.response?.data || err?.message || "Video generation failed";
    return NextResponse.json({ ok: false, error: String(message) }, { status: 500 });
  }
}
