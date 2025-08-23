import { NextResponse } from "next/server";
import Replicate from "replicate";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    const token = process.env.REPLICATE_API_TOKEN;
    const model = process.env.REPLICATE_VIDEO_MODEL || "stability-ai/stable-diffusion";

    if (!token || !model) {
      return NextResponse.json(
        { error: "Missing Replicate config", token: !!token, model: !!model },
        { status: 500 }
      );
    }

    const replicate = new Replicate({ auth: token });

    // Test simple avec stable-diffusion (génère une image)
    const output = await replicate.run(model, {
      input: {
        prompt: prompt || "a futuristic city skyline at sunset, cinematic lighting"
      },
    });

    return NextResponse.json({ output });
  } catch (err: any) {
    console.error("Replicate error", err);
    return NextResponse.json(
      { error: "Replicate create failed", detail: err },
      { status: 422 }
    );
  }
}
