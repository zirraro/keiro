export async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function pollJson(
  url: string,
  {
    intervalMs = 2500,
    timeoutMs = 120000,
    isDone,
    onTick,
  }: {
    intervalMs?: number;
    timeoutMs?: number;
    isDone: (data: any) => boolean;
    onTick?: (data: any) => void;
  }
) {
  const start = Date.now();
  let last: any = null;
  // première requête
  last = await fetch(url, { cache: "no-store" }).then((r) => r.json());
  onTick?.(last);
  if (isDone(last)) return last;

  while (Date.now() - start < timeoutMs) {
    await sleep(intervalMs);
    last = await fetch(url, { cache: "no-store" }).then((r) => r.json());
    onTick?.(last);
    if (isDone(last)) return last;
  }
  throw new Error("Polling timeout");
}
