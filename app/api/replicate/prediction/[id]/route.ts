import { NextResponse, NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id;
    const token = process.env.REPLICATE_API_TOKEN;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing REPLICATE_API_TOKEN" },
        { status: 500 }
      );
    }
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing prediction id" },
        { status: 400 }
      );
    }

    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const json = await r.json();

    return NextResponse.json(
      {
        ok: r.ok,
        id,
        status: json?.status,          // starting | processing | succeeded | failed | canceled
        output: json?.output ?? null,  // string | string[] | null
        error: json?.error ?? null,
        logs: json?.logs ?? "",
        metrics: json?.metrics ?? null,
      },
      { status: r.status }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
