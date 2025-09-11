import { put } from "@vercel/blob";

/** Upload public to Vercel Blob and return URL */
export async function uploadPublicBlob(filename: string, data: ArrayBuffer | Buffer) {
  const { url } = await put(filename, data, { access: "public" });
  return url;
}
