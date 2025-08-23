import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN;
  const version = process.env.REPLICATE_MODEL_VERSION;

  if (!token || !version) {
    return NextResponse.json(
      { ok: false, where: "env", error: "Missing REPLICATE_API_TOKEN or REPLICATE_MODEL_VERSION" },
      { status: 500 }
    );
  }

  try {
    const r = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version,
        input: { prompt: "Keiro health check" },
      }),
    });

    const json = await r.json();
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, where: "replicate", status: r.status, error: json?.error || json },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, id: json?.id ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, where: "network", error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
