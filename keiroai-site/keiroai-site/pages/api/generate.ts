import type { NextApiRequest, NextApiResponse } from "next";
import { ensureInstagramImage } from "../../lib/ensureInstagramImage";
import { uploadPublicBlob } from "../../lib/blob";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const imgRes = await fetch("https://picsum.photos/1080/1080");
    const arr = Buffer.from(await imgRes.arrayBuffer());

    // Ratio IG 4:5 (1080x1350)
    const finalImg = await ensureInstagramImage(arr, "4:5");

    // Upload public → URL accessible par l’API Instagram (via Make)
    const imageUrl = await uploadPublicBlob(`ig-${Date.now()}.jpg`, finalImg);

    const caption = "Post généré automatiquement ✨ #keiroai #ai #marketing";
    res.status(200).json({ ok: true, imageUrl, caption });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
