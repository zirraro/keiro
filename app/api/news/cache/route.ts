export const runtime = "nodejs";
// @ts-ignore
const __cache = (globalThis as any).__newsCache as Map<string, {t:number,body:any}> | undefined;
export async function DELETE() {
  const n = __cache ? __cache.size : 0; if (__cache) __cache.clear();
  return Response.json({ cleared: n });
}
