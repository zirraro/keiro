type Entry = { t: number; url: string | null };
const TTL = (Number(process.env.NEWS_IMG_TTL_DAYS || 3) || 3) * 24 * 60 * 60 * 1000;

// @ts-ignore
const store: Map<string, Entry> = (globalThis as any).__newsImgCache ||= new Map();

export function getFromCache(pageUrl: string): string | null | undefined {
  const e = store.get(pageUrl);
  if (!e) return undefined;
  if (Date.now() - e.t > TTL) { store.delete(pageUrl); return undefined; }
  return e.url;
}

export function putInCache(pageUrl: string, img: string | null) {
  store.set(pageUrl, { t: Date.now(), url: img });
}
