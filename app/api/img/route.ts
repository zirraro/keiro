export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const u = searchParams.get("u");
  if (!u) return new Response("missing u", { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const upstream = await fetch(u, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "image/*,*/*;q=0.8",
        "Accept-Language": "fr,en;q=0.9",
      },
      signal: controller.signal
    });

    if (!upstream.ok) {
      return new Response(`upstream ${upstream.status}`, { status: 502 });
    }
    const ct = upstream.headers.get("content-type") || "image/jpeg";
    const body = upstream.body!;
    const headers = new Headers({
      "cache-control": "public, max-age=3600",
      "content-type": ct
    });
    return new Response(body, { headers });
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
    return new Response(`proxy error: ${msg}`, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
