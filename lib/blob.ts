import { put } from "@vercel/blob";

/**
 * Upload a public blob to Vercel Blob.
 * @param content Buffer | Uint8Array | string
 * @param opts { filename: string; contentType?: string }
 * @returns public URL string
 */
export async function uploadPublicBlob(
  content: Buffer | Uint8Array | string,
  opts: { filename: string; contentType?: string }
): Promise<string> {
  const { filename, contentType } = opts;
  const res = await put(filename, content, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });
  return res.url;
}

export default uploadPublicBlob;
