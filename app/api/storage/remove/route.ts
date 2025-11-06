import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let path = body?.path as string | undefined;
    if (!path) return NextResponse.json({ ok: false, error: "Missing path" }, { status: 400 });

    // On accepte "assets/library/file" ou "library/file"
    path = path.replace(/^assets\//, "");

    const sb = supabaseAdmin();
    const { error } = await sb.storage.from("assets").remove([path]);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
