import { NextResponse } from "next/server";
import Replicate from "replicate";

export async function GET() {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
    }
    const replicate = new Replicate({ auth: token });
    const model = "stability-ai/stable-diffusion" as `${string}/${string}`;

    const output = (await replicate.run(model, {
      input: {
        prompt: "an astronaut riding a horse on mars, hd, dramatic lighting",
        num_outputs: 1,
        width: 512,
        height: 512
      }
    })) as string[] | string;

    const urls = Array.isArray(output) ? output : [output];
    return NextResponse.json({ ok: true, model, urls });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "Replicate test failed", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
    }
    const { prompt = "an astronaut riding a horse on mars, hd, dramatic lighting" } =
      await req.json().catch(() => ({} as any));

    const replicate = new Replicate({ auth: token });
    const model = "stability-ai/stable-diffusion" as `${string}/${string}`;

    const output = (await replicate.run(model, {
      input: {
        prompt,
        num_outputs: 1,
        width: 512,
        height: 512
      }
    })) as string[] | string;

    const urls = Array.isArray(output) ? output : [output];
    return NextResponse.json({ ok: true, model, prompt, urls });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "Replicate test failed", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
