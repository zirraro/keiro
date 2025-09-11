import type { NextApiRequest, NextApiResponse } from "next";

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL!; // défini dans .env.local

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { imageUrl, caption, userId } = req.body || {};
    if (!imageUrl) return res.status(400).json({ ok: false, error: "imageUrl manquant" });
    if (!MAKE_WEBHOOK_URL) return res.status(500).json({ ok: false, error: "MAKE_WEBHOOK_URL manquant" });

    const payload = {
      image_url: imageUrl,
      caption: caption || "",
      user_id: userId || "demo",
    };

    const r = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ ok: false, error: \`Erreur Make: \${r.status} \${text}\` });
    }

    res.status(200).json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
