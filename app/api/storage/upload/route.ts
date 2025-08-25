import { NextResponse } from "next/server";
import { supabaseAdmin, publicUrlFromPath } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "Missing file field" }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`.replace(/\s+/g, "_");
    const path = `assets/library/${filename}`; // bucket "assets", dossier "library"

    const { error } = await sb.storage.from("assets").upload(`library/${filename}`, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const publicPath = `assets/library/${filename}`;
    const url = publicUrlFromPath(publicPath);
    return NextResponse.json({ ok: true, path: publicPath, url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
