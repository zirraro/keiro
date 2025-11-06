import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, ctx: any) {
  try {
    const id = ctx?.params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
    }

    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      // Pas de cache côté Vercel
      cache: "no-store",
      // Evite certains proxy issues
      next: { revalidate: 0 },
    });

    const json = await res.json();
    // Normalise la réponse pour le front
    return NextResponse.json({
      ok: res.ok && !json?.error,
      id: json?.id ?? id,
      status: json?.status ?? res.status,
      output: json?.output ?? null,
      error: json?.error ?? null,
      logs: json?.logs ?? "",
      metrics: json?.metrics ?? null,
      raw: !res.ok ? json : undefined,
    }, { status: res.ok ? 200 : (json?.status ?? 500) });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
