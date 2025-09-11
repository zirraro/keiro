import { put } from "@vercel/blob";

/**
 * Uploade un Buffer sur Vercel Blob (public) et renvoie l'URL.
 */
export async function uploadPublicBlob(filename: string, data: ArrayBuffer | Buffer) {
  const { url } = await put(filename, data, { access: "public" });
  return url;
}
