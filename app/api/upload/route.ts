export const runtime = "nodejs";
import { NextRequest } from "next/server";
import { uploadPublicBlob } from "@/lib/blob";

const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED = ["image/jpeg","image/jpg","image/png","image/webp","image/gif","image/svg+xml"];

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("multipart/form-data")) {
      return new Response(JSON.stringify({ ok:false, error:"Use multipart/form-data" }), { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ ok:false, error:"Missing file field" }), { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ ok:false, error:"File too large" }), { status: 413 });
    }

    const type = (file.type || "image/jpeg").toLowerCase();
    if (!ALLOWED.includes(type)) {
      return new Response(JSON.stringify({ ok:false, error:`Unsupported type: ${type}` }), { status: 415 });
    }

    const ext = ({
      "image/jpeg":"jpg",
      "image/jpg":"jpg",
      "image/png":"png",
      "image/webp":"webp",
      "image/gif":"gif",
      "image/svg+xml":"svg",
    } as Record<string,string>)[type] || "jpg";

    const buf = Buffer.from(await file.arrayBuffer());
    const filename = `upload-${Date.now()}.${ext}`;

    const url = await uploadPublicBlob({ filename, content: buf, contentType: type });

    return new Response(JSON.stringify({ ok:true, url }), {
      status: 200,
      headers: { "content-type":"application/json" }
    });
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || "unexpected error" }), { status: 500 });
  }
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" }});
}
