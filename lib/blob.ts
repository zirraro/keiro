import { put } from "@vercel/blob";

type UploadOpts = {
  filename: string;
  content: Buffer | Uint8Array | ArrayBuffer;
  contentType?: string;
};

/** Upload public vers Vercel Blob (signature par objet) */
export async function uploadPublicBlob(opts: UploadOpts): Promise<string> {
  const { filename, content, contentType = "image/jpeg" } = opts;
  const file = Buffer.isBuffer(content) ? content : Buffer.from(content as ArrayBuffer);
  const { url } = await put(filename, file, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });
  return url;
}
