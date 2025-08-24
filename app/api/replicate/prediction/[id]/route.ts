import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const id = ctx?.params?.id;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
  }

  try {
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const json: any = await r.json().catch(() => null);

    return NextResponse.json({
      ok: r.ok,
      id,
      status: json?.status ?? r.status,
      output: json?.output ?? null,
      error: json?.error ?? null,
      logs: json?.logs ?? "",
      metrics: json?.metrics ?? null,
    }, { status: r.ok ? 200 : (json?.status ?? 500) });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      id,
      status: 500,
      output: null,
      error: e?.message || String(e),
      logs: "",
      metrics: null,
    }, { status: 500 });
  }
}
