import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getUserPages } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userToken = (session as any)?.fbUserAccessToken;
  if (!userToken) {
    return NextResponse.json({ ok: false, error: "Not authenticated with Facebook" }, { status: 401 });
  }
  try {
    const pages = await getUserPages(userToken);
    return NextResponse.json({ ok: true, pages });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}
