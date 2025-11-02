import { NextResponse } from "next/server";
import Replicate from "replicate";

export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN;
  const model = process.env.REPLICATE_MODEL_VERSION;

  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
  }
  if (!model) {
    return NextResponse.json({ ok: false, error: "Missing REPLICATE_MODEL_VERSION" }, { status: 500 });
  }

  try {
    const replicate = new Replicate({ auth: token });
    // Test: récupérer les métadonnées du modèle
    const [owner, name] = model.split("/");
    const mdl = await replicate.models.get(owner, name);

    return NextResponse.json({ ok: true, hasToken: true, model, mdl });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
