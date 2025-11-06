import { put } from "@vercel/blob";

type ObjSig = { filename: string; content: Buffer | Uint8Array | ArrayBuffer; contentType?: string };

/** Supporte:
 *  uploadPublicBlob("name.jpg", buffer, "image/jpeg")
 *  uploadPublicBlob({ filename, content, contentType })
 */
export async function uploadPublicBlob(a: string|ObjSig, b?: Buffer|Uint8Array|ArrayBuffer, c?: string): Promise<string> {
  let filename: string;
  let content: Buffer|Uint8Array|ArrayBuffer;
  let contentType: string|undefined;

  if (typeof a === "string") { filename = a; content = b as any; contentType = c; }
  else { filename = a.filename; content = a.content; contentType = a.contentType; }

  const file = Buffer.isBuffer(content) ? content : Buffer.from(content as ArrayBuffer);
  const { url } = await put(filename, file, {
    access: "public",
    contentType: contentType || "image/jpeg",
    addRandomSuffix: false,
  });
  return url;
}
