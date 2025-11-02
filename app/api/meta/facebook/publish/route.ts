import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Body = {
  pageId: string;
  pageAccessToken: string;
  message?: string;
  link?: string;
  imageUrl?: string; // si présent => /photos, sinon /feed
};

export async function POST(req: Request) {
  try {
    const { pageId, pageAccessToken, message, link, imageUrl } = (await req.json()) as Body;

    if (!pageId || !pageAccessToken) {
      return NextResponse.json({ ok: false, error: "Missing pageId or pageAccessToken" }, { status: 400 });
    }

    const base = `https://graph.facebook.com/v19.0/${pageId}`;
    const endpoint = imageUrl ? `${base}/photos` : `${base}/feed`;

    const params = new URLSearchParams({ access_token: pageAccessToken });
    if (message) params.set("message", message);
    if (link && !imageUrl) params.set("link", link);
    if (imageUrl) params.set("url", imageUrl);

    const res = await fetch(endpoint, { method: "POST", body: params });
    const json = await res.json();

    if (!res.ok || json.error) {
      return NextResponse.json({ ok: false, error: json.error?.message || "FB publish failed", detail: json }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: json.id || json.post_id || json?.result_id || null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
