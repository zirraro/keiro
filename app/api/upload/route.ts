export const runtime = "nodejs";
import { NextRequest } from "next/server";
import { uploadPublicBlob } from "@/lib/blob";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return Response.json({ ok: false, error: "file manquant" }, { status: 400 });

    const arrayBuf = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    const ext = (file.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const safeExt = ext || "jpg";
    const filename = `upload-${Date.now()}.${safeExt}`;

    const url = await uploadPublicBlob(buf, {
      filename,
      contentType: file.type || "image/jpeg",
    });

    return Response.json({ ok: true, url });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message || "upload failed" }, { status: 500 });
  }
}
