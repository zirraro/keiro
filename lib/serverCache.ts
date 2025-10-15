type Entry<T> = { data: T; ts: number; ttl: number };
const store = new Map<string, Entry<any>>();
export function cacheGet<T=any>(key: string, maxAgeMs: number): T | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > Math.min(maxAgeMs, e.ttl)) { store.delete(key); return null; }
  return e.data as T;
}
export function cacheSet<T=any>(key: string, data: T, ttlMs: number) {
  store.set(key, { data, ts: Date.now(), ttl: ttlMs });
}
