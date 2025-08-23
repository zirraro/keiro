import { NextResponse } from "next/server";
import Replicate from "replicate";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    const token = process.env.REPLICATE_API_TOKEN;
    const model = process.env.REPLICATE_VIDEO_MODEL;

    if (!token || !model) {
      return NextResponse.json(
        { error: "Missing Replicate config", token: !!token, model: !!model },
        { status: 500 }
      );
    }

    const replicate = new Replicate({ auth: token });

    const output = await replicate.run(model as any, {
      input: {
        prompt: prompt || "A demo video of a cat playing piano",
      },
    });

    return NextResponse.json({ output });
  } catch (err: any) {
    console.error("Replicate error", err);
    return NextResponse.json(
      {
        error: "Replicate create failed",
        detail: err, // 👈 envoie tout le message Replicate
      },
      { status: 422 }
    );
  }
}
