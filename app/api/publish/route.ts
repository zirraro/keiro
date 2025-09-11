export const runtime = "nodejs";
import { NextRequest } from "next/server";

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL!;

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, caption, userId, brand, campaignId } = await req.json();
    if (!imageUrl) return new Response(JSON.stringify({ ok: false, error: "imageUrl manquant" }), { status: 400 });
    if (!MAKE_WEBHOOK_URL) return new Response(JSON.stringify({ ok: false, error: "MAKE_WEBHOOK_URL manquant" }), { status: 500 });

    const payload = {
      image_url: imageUrl,
      caption: caption || "",
      user_id: userId || "demo",
      brand: brand || "keiroai",
      campaign_id: campaignId || "default",
    };

    const r = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const text = await r.text();
      return new Response(JSON.stringify({ ok: false, error: `Erreur Make: ${r.status} ${text}` }), { status: 502 });
    }
    return Response.json({ ok: true });
  } catch (e: any) {
    console.error("Erreur /api/publish:", e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
