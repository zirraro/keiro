import sharp from "sharp";

/**
 * Prépare une image conforme Instagram (4:5 ou 1:1), JPEG <= 8 Mo.
 */
export async function ensureInstagramImage(
  inputBuffer: Buffer,
  ratio: "1:1" | "4:5" = "4:5"
) {
  const target = ratio === "1:1" ? { w: 1080, h: 1080 } : { w: 1080, h: 1350 };

  let out = await sharp(inputBuffer)
    .resize(target.w, target.h, { fit: "cover", position: "centre" })
    .jpeg({ quality: 88 })
    .toBuffer();

  if (out.byteLength > 8 * 1024 * 1024) {
    out = await sharp(out).jpeg({ quality: 80 }).toBuffer();
  }
  return out;
}
