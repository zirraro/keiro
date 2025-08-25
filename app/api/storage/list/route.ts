import { NextResponse } from "next/server";
import { supabaseAdmin, publicUrlFromPath } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.storage.from("assets").list("library", {
      limit: 100,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const files = (data || []).map((f) => {
      const path = `assets/library/${f.name}`;
      return { name: f.name, path, url: publicUrlFromPath(path), created_at: (f as any).created_at };
    });

    return NextResponse.json({ ok: true, files });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
