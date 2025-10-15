export const runtime = "nodejs";

type Check = { name: string; configured: boolean; ok: boolean; status?: number; sampleCount?: number; error?: string };

async function pingNewsAPI(): Promise<Check> {
  const key = process.env.NEWSAPI_KEY || "";
  const out: Check = { name: "newsapi", configured: !!key, ok: false };
  if (!key) return out;
  try {
    const url = new URL("https://newsapi.org/v2/everything");
    url.searchParams.set("q", "openai");
    url.searchParams.set("language", "fr");
    url.searchParams.set("pageSize", "1");
    const r = await fetch(url, { headers: { "X-Api-Key": key } });
    out.status = r.status;
    out.ok = r.ok;
    if (r.ok) {
      const j: any = await r.json();
      out.sampleCount = (j.articles || []).length;
    } else {
      out.error = await r.text().catch(() => undefined);
    }
  } catch (e: any) {
    out.error = e?.message;
  }
  return out;
}

async function pingGNews(): Promise<Check> {
  const key = process.env.GNEWS_KEY || "";
  const out: Check = { name: "gnews", configured: !!key, ok: false };
  if (!key) return out;
  try {
    const url = new URL("https://gnews.io/api/v4/search");
    url.searchParams.set("q", "openai");
    url.searchParams.set("lang", "fr");
    url.searchParams.set("max", "1");
    url.searchParams.set("token", key);
    const r = await fetch(url);
    out.status = r.status;
    out.ok = r.ok;
    if (r.ok) {
      const j: any = await r.json();
      out.sampleCount = (j.articles || []).length;
    } else {
      out.error = await r.text().catch(() => undefined);
    }
  } catch (e: any) {
    out.error = e?.message;
  }
  return out;
}

async function pingNewsdata(): Promise<Check> {
  const key = process.env.NEWSDATA_KEY || "";
  const out: Check = { name: "newsdata", configured: !!key, ok: false };
  if (!key) return out;
  try {
    const url = new URL("https://newsdata.io/api/1/news");
    url.searchParams.set("apikey", key);
    url.searchParams.set("q", "openai");
    url.searchParams.set("language", "fr");
    url.searchParams.set("page", "1");
    const r = await fetch(url);
    out.status = r.status;
    out.ok = r.ok;
    if (r.ok) {
      const j: any = await r.json();
      out.sampleCount = (j.results || []).length;
    } else {
      out.error = await r.text().catch(() => undefined);
    }
  } catch (e: any) {
    out.error = e?.message;
  }
  return out;
}

export async function GET() {
  const minScore = Number(process.env.NEWS_MIN_SCORE || "1.8");
  const checks = await Promise.all([pingNewsAPI(), pingGNews(), pingNewsdata()]);
  const env = {
    NEWSAPI_KEY: process.env.NEWSAPI_KEY ? "set" : "unset",
    GNEWS_KEY: process.env.GNEWS_KEY ? "set" : "unset",
    NEWSDATA_KEY: process.env.NEWSDATA_KEY ? "set" : "unset",
    NEWS_MIN_SCORE: minScore,
  };
  return new Response(JSON.stringify({ env, checks }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
