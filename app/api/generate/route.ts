export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ensureInstagramImage } from "@/lib/ensureInstagramImage";
import { uploadPublicBlob } from "@/lib/blob";

type Body = {
  news?: { title: string; summary: string; url: string; angle: string; source?: string } | null;
  brandId?: string;
  campaignId?: string;
};

const BRAND_PRESETS: Record<string, { voice: string; hashtags: string[]; cta: string[] }> = {
  keiroai: {
    voice: "Clair, orienté impact, marketing temps réel",
    hashtags: ["#KeiroAI", "#Marketing", "#AI", "#Growth", "#Design"],
    cta: ["Lance ta campagne en 1 clic", "Teste KeiroAI", "Passe en Fast Marketing"],
  },
};

function buildCaption(body: Body) {
  const b = BRAND_PRESETS["keiroai"];
  if (!body.news) return `Post généré automatiquement ✨ ${b.hashtags.join(" ")}`;
  const { title, summary, url, angle, source } = body.news;
  const hook = `Actu : ${title}${source ? ` — ${source}` : ""}`;
  const value = `Angle : ${angle}. ${summary}`;
  const action = b.cta[0];
  const tags = b.hashtags.join(" ");
  return `${hook}\n\n${value}\n\n${action}\n${url}\n\n${tags}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const caption = buildCaption(body);

    // 1) Pas de token → fallback image publique (utile en dev)
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return Response.json({ ok: true, imageUrl: "https://picsum.photos/1080/1350", caption });
    }

    // 2) Token présent → tente l'upload; si échec → fallback public
    try {
      const imgRes = await fetch("https://picsum.photos/1080/1080");
      const arr = Buffer.from(await imgRes.arrayBuffer());
      const finalImg = await ensureInstagramImage(arr, "4:5");
      const imageUrl = await uploadPublicBlob({ filename: `ig-${Date.now()}.jpg`, content: finalImg, contentType: "image/jpeg" });
      return Response.json({ ok: true, imageUrl, caption });
    } catch (e) {
      console.error("Upload Blob KO → fallback public:", e);
      return Response.json({ ok: true, imageUrl: "https://picsum.photos/1080/1350", caption });
    }
  } catch (e: any) {
    console.error("Erreur /api/generate:", e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
