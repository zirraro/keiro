import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/replicate/prediction/:id
 * Renvoie l'état de la prédiction Replicate (status, output, logs…)
 */
export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  try {
    const id = ctx?.params?.id;
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
    }

    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      // On ne met PAS de cache pour pouvoir poller
      cache: "no-store",
    });

    const json = await res.json();

    // Réponse normalisée
    return NextResponse.json({
      ok: res.ok,
      id,
      status: json?.status ?? null,
      output: json?.output ?? null,
      error: json?.error ?? null,
      logs: json?.logs ?? "",
      metrics: json?.metrics ?? null,
      raw: process.env.NODE_ENV === "development" ? json : undefined,
    }, { status: res.ok ? 200 : res.status });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message || String(e),
    }, { status: 500 });
  }
}
