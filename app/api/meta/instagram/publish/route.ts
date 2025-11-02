import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Body = {
  igUserId: string;           // ex: 1784… (Business/Creator)
  pageAccessToken: string;    // token de la Page
  imageUrl: string;           // image publique
  caption?: string;
};

export async function POST(req: Request) {
  try {
    const { igUserId, pageAccessToken, imageUrl, caption } = (await req.json()) as Body;
    if (!igUserId || !pageAccessToken || !imageUrl) {
      return NextResponse.json({ ok: false, error: "Missing igUserId/pageAccessToken/imageUrl" }, { status: 400 });
    }

    // 1) Créer un media container
    const createRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: "POST",
      body: new URLSearchParams({
        access_token: pageAccessToken,
        image_url: imageUrl,
        caption: caption || "",
      }),
    });
    const createJson = await createRes.json();
    if (!createRes.ok || createJson.error || !createJson.id) {
      return NextResponse.json({ ok: false, error: createJson.error?.message || "IG container failed", detail: createJson }, { status: 500 });
    }

    // 2) Publier le container
    const pubRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({
        access_token: pageAccessToken,
        creation_id: createJson.id,
      }),
    });
    const pubJson = await pubRes.json();
    if (!pubRes.ok || pubJson.error) {
      return NextResponse.json({ ok: false, error: pubJson.error?.message || "IG publish failed", detail: pubJson }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: pubJson.id || null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
