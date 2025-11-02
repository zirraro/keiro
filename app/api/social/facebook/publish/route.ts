import { NextResponse } from "next/server";
import { publishToFacebookPage } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { pageId, pageAccessToken, message, link } = await req.json().catch(()=>({}));
  if (!pageId || !pageAccessToken || !message) {
    return NextResponse.json({ ok: false, error: "Missing pageId/pageAccessToken/message" }, { status: 400 });
  }
  try {
    const res = await publishToFacebookPage(pageId, pageAccessToken, message, link);
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}
