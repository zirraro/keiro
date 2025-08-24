import { NextResponse } from "next/server";
import Replicate from "replicate";

const OWNER = "stability-ai";
const NAME  = "stable-diffusion";

export async function GET() {
  return handle({ prompt: "an astronaut riding a horse on mars, hd, dramatic lighting" });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const prompt = typeof body?.prompt === "string" && body.prompt.trim()
    ? body.prompt.trim()
    : "an astronaut riding a horse on mars, hd, dramatic lighting";
  return handle({ prompt });
}

async function handle({ prompt }: { prompt: string }) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
    }

    const replicate = new Replicate({ auth: token });

    // 1) Récupère la dernière version du modèle (signature: get(owner, name))
    const mdl = await (replicate as any).models.get(OWNER, NAME);
    const versionId =
      (mdl as any)?.latest_version?.id ||
      (mdl as any)?.default_example?.version;

    if (!versionId) {
      return NextResponse.json(
        { ok: false, error: "No version found for model", model: `${OWNER}/${NAME}`, mdl },
        { status: 500 }
      );
    }

    // 2) owner/name:version
    const modelWithVersion = `${OWNER}/${NAME}:${versionId}` as `${string}/${string}:${string}`;

    const output = (await replicate.run(modelWithVersion, {
      input: {
        prompt,
        num_outputs: 1,
        width: 512,
        height: 512
      }
    })) as string[] | string;

    const urls = Array.isArray(output) ? output : [output];

    return NextResponse.json({
      ok: true,
      model: `${OWNER}/${NAME}`,
      versionId,
      modelWithVersion,
      prompt,
      urls
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Replicate test failed",
        detail: err?.message || String(err)
      },
      { status: 500 }
    );
  }
}
