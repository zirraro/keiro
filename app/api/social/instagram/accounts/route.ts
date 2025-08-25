import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getPageInstagramAccount } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userToken = (session as any)?.fbUserAccessToken;
  if (!userToken) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const { pageId, pageAccessToken } = await req.json().catch(()=>({}));
  if (!pageId || !pageAccessToken) {
    return NextResponse.json({ ok: false, error: "Missing pageId or pageAccessToken" }, { status: 400 });
  }

  try {
    const ig = await getPageInstagramAccount(pageId, pageAccessToken);
    return NextResponse.json({ ok: true, ig });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}
