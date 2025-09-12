import { put } from "@vercel/blob";

type UploadOpts = {
  filename: string;
  content: Buffer | Uint8Array | ArrayBuffer;
  contentType?: string;
};

/** Signature officielle (objet) */
export async function uploadPublicBlob(opts: UploadOpts): Promise<string> {
  const { filename, content, contentType = "image/jpeg" } = opts;
  const file = typeof Buffer !== "undefined" && Buffer.isBuffer(content)
    ? content
    : Buffer.from(content as ArrayBuffer);

  const { url } = await put(filename, file, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });
  return url;
}

/** Wrapper rétro-compatible : uploadPublicBlob(filename, content) */
export async function uploadPublicBlobLegacy(filename: string, content: Buffer | ArrayBuffer, contentType = "image/jpeg") {
  return uploadPublicBlob({ filename, content: Buffer.isBuffer(content) ? content : Buffer.from(content as ArrayBuffer), contentType });
}
