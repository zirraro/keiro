import { XMLParser } from "fast-xml-parser";

export type NewsItem = {
  id: string;
  source?: string;
  title: string;
  snippet?: string;
  url?: string;
  published?: string;
  thumbnailUrl?: string | null;
  hot?: boolean;
  score?: number;
};

type FetchArgs = {
  q?: string;
  topic?: string;
  timeframe?: "24h"|"48h"|"72h"|"7d";
  limit?: number;
  locale?: string;
  gl?: string;
  ceid?: string;
};

const TOPIC_CODES: Record<string, string> = {
  world: "WORLD",
  business: "BUSINESS",
  technology: "TECHNOLOGY",
  science: "SCIENCE",
  health: "HEALTH",
  sports: "SPORTS",
  nation: "NATION",
  entertainment: "ENTERTAINMENT",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "", // => les attributs sont accessibles comme .url (pas @_url)
});

/** map timeframe -> cutoff Date */
function timeframeToCutoff(tf: string | undefined): Date | null {
  const now = Date.now();
  const hours =
    tf === "24h" ? 24 :
    tf === "48h" ? 48 :
    tf === "72h" ? 72 :
    tf === "7d"  ? 24*7 : null;
  return hours ? new Date(now - hours*3600*1000) : null;
}

/** parse RFC date */
function parseRfcDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** score simple selon récence (0..100) */
function hotScore(pub?: Date | null): number {
  if (!pub) return 0;
  const ageMs = Date.now() - pub.getTime();
  const oneDay = 24*3600*1000;
  return Math.max(0, 100 - Math.round((ageMs/oneDay)*100));
}

function rssUrlBase(locale = "fr", gl = "FR", ceid = "FR:fr") {
  return `https://news.google.com/rss?hl=${locale}&gl=${gl}&ceid=${ceid}`;
}

function rssSearchUrl(q: string, tf?: "24h"|"48h"|"72h"|"7d", locale = "fr", gl = "FR", ceid = "FR:fr") {
  const when = tf ? `+when:${tf}` : "";
  const encoded = encodeURIComponent(`${q}${when}`);
  return `https://news.google.com/rss/search?q=${encoded}&hl=${locale}&gl=${gl}&ceid=${ceid}`;
}

function rssTopicUrl(topicCode: string, locale = "fr", gl = "FR", ceid = "FR:fr") {
  return `https://news.google.com/rss/headlines/section/topic/${topicCode}?hl=${locale}&gl=${gl}&ceid=${ceid}`;
}

async function fetchRss(url: string): Promise<any> {
  const res = await fetch(url, { next: { revalidate: 0 }});
  if (!res.ok) throw new Error(`RSS fetch failed ${res.status}: ${url}`);
  const xml = await res.text();
  return parser.parse(xml);
}

function firstImgFromHtml(html?: string): string | null {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function pickThumb(it: any): string | null {
  // media:content (peut être objet ou tableau)
  const mc = it?.["media:content"];
  if (mc) {
    if (Array.isArray(mc)) {
      const u = mc[0]?.url || mc[0]?.["@_url"];
      if (u) return u;
    } else if (typeof mc === "object") {
      const u = mc.url || mc["@_url"];
      if (u) return u;
    }
  }
  // enclosure url
  const enc = it?.enclosure;
  if (enc) {
    const u = enc.url || enc["@_url"];
    if (u) return u;
  }
  // media:group.media:content
  const mg = it?.["media:group"]?.["media:content"];
  if (mg) {
    if (Array.isArray(mg)) {
      const u = mg[0]?.url || mg[0]?.["@_url"];
      if (u) return u;
    } else if (typeof mg === "object") {
      const u = mg.url || mg["@_url"];
      if (u) return u;
    }
  }
  // fallback : première <img> dans la description HTML
  const html = typeof it?.description === "string" ? it.description : "";
  const fromHtml = firstImgFromHtml(html);
  if (fromHtml) return fromHtml;

  return null;
}

function normalizeItems(feed: any, cutoff: Date | null, limit: number): NewsItem[] {
  const items = (feed?.rss?.channel?.item ?? []) as any[];
  const out: NewsItem[] = [];

  for (const it of items) {
    const title = (it?.title ?? "").toString();
    const url = (it?.link ?? it?.guid ?? "").toString();
    const pub = parseRfcDate(it?.pubDate);
    const source =
      typeof it?.source === "string"
        ? it.source
        : (it?.source?.["#text"] || it?.source?._) || undefined;
    const descRaw = (it?.description ?? "") as string;
    const desc = descRaw.replace(/<[^>]*>/g, "").trim() || undefined;

    if (cutoff && pub && pub < cutoff) continue;

    const thumbnailUrl = pickThumb(it);

    const item: NewsItem = {
      id: url || title,
      source,
      title,
      snippet: desc,
      url,
      published: pub?.toISOString(),
      thumbnailUrl: thumbnailUrl || null,
      score: hotScore(pub),
      hot: (hotScore(pub) >= 60),
    };
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** API principale */
export async function fetchNews(args: FetchArgs) {
  const {
    q,
    topic,
    timeframe = "24h",
    limit = 12,
    locale = "fr",
    gl = "FR",
    ceid = "FR:fr",
  } = args;

  const cutoff = timeframeToCutoff(timeframe);

  try {
    let url: string;
    if (q && q.trim()) {
      url = rssSearchUrl(q.trim(), timeframe, locale, gl, ceid);
    } else if (topic && TOPIC_CODES[topic]) {
      url = rssTopicUrl(TOPIC_CODES[topic], locale, gl, ceid);
    } else {
      url = rssUrlBase(locale, gl, ceid);
    }

    const feed = await fetchRss(url);
    const items = normalizeItems(feed, cutoff, limit);

    return { items, meta: { q: q ?? "", topic: topic ?? "", timeframe, limit, locale, gl, ceid } };
  } catch (e: any) {
    console.error("fetchNews error:", e?.message || e);
    return { items: [], meta: { q: q ?? "", topic: topic ?? "", timeframe, limit, locale, gl, ceid, error: String(e?.message || e) } };
  }
}
