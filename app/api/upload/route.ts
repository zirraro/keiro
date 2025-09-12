export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { uploadPublicBlob } from "@/lib/blob";

/**
 * POST /api/upload (multipart/form-data)
 * field: file (required)
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return Response.json({ ok: false, error: "file manquant" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = file.name?.split(".").pop()?.toLowerCase() || "jpg";
    const safeExt = ["jpg","jpeg","png","webp"].includes(ext) ? ext : "jpg";
    const filename = `upload-${Date.now()}.${safeExt}`;

    const url = await uploadPublicBlob({
      content: buf,
      contentType: file.type || "image/jpeg",
      filename,
    });

    return Response.json({ ok: true, url });
  } catch (e: any) {
    console.error("upload error:", e);
    return Response.json({ ok: false, error: e?.message || "upload error" }, { status: 500 });
  }
}
