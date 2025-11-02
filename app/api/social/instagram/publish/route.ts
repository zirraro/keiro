import { NextResponse } from "next/server";
import { publishImageToInstagram } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { igUserId, pageAccessToken, imageUrl, caption } = await req.json().catch(()=>({}));
  if (!igUserId || !pageAccessToken || !imageUrl) {
    return NextResponse.json({ ok: false, error: "Missing igUserId/pageAccessToken/imageUrl" }, { status: 400 });
  }
  try {
    const res = await publishImageToInstagram(igUserId, pageAccessToken, imageUrl, caption);
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}
