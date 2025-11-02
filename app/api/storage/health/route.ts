import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const hasUrl = !!process.env.SUPABASE_URL;
    const hasAnon = !!process.env.SUPABASE_ANON_KEY;
    const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!hasUrl || !hasAnon) {
      return NextResponse.json(
        { ok: false, msg: "Missing SUPABASE_URL or SUPABASE_ANON_KEY", hasUrl, hasAnon, hasService },
        { status: 500 }
      );
    }

    // Si SERVICE_ROLE dispo, on s'assure que le bucket existe
    if (hasService) {
      const sb = supabaseAdmin();
      const { data: buckets } = await sb.storage.listBuckets();
      const exists = (buckets || []).some((b: any) => b.name === "assets");
      if (!exists) {
        await sb.storage.createBucket("assets", { public: true });
      }
    }

    return NextResponse.json({ ok: true, bucket: "assets", hasUrl, hasAnon, hasService });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
