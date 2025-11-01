import Parser from "rss-parser";
import ogs from "open-graph-scraper";

export type NewsItem = {
  id: string;
  source: string;
  title: string;
  url: string;
  summary: string;
  publishedAt?: string;
  image?: string;
  angles: string[];
};

const FEEDS = [
  "https://www.reuters.com/world/europe/rss",      // Europe
  "https://apnews.com/hub/apf-topnews?output=rss", // World
  "https://www.theverge.com/rss/index.xml",       // Tech
  "https://www.lesechos.fr/rss/rss_tech_medias.xml" // FR Tech/Business
];

const parser = new Parser();

async function getOgImage(url: string) {
  try {
    const { result } = await ogs({ url, timeout: 5000 });
    const ogImage = (result as any).ogImage;
    if (Array.isArray(ogImage)) return ogImage[0]?.url as string | undefined;
    return ogImage?.url as string | undefined;
  } catch {
    return undefined;
  }
}

function proposeAngles(title: string, summary: string): string[] {
  const t = `${title} ${summary}`.toLowerCase();
  const angles = new Set<string>();
  angles.add("Educational: 3 key takeaways");
  angles.add("Consumer benefits: why it matters daily");
  angles.add("Product link: concrete use case");

  if (t.includes("ai") || t.includes("intelligence") || t.includes("ia")) {
    angles.add("AI: visual demo + practical tips");
  }
  if (t.includes("sante") || t.includes("santé") || t.includes("health") || t.includes("bein-etre") || t.includes("bein-eètre")) {
    angles.add("Wellbeing: routine + measurable benefits");
  }
  if (t.includes("startup") || t.includes("funding") || t.includes("invest")) {
    angles.add("Business: key numbers + call to action");
  }
  return Array.from(angles).slice(0, 4);
}

export async function fetchNews(): Promise<NewsItem[]> {
  try {
    const feeds = await Promise.allSettled(FEEDS.map((f) => parser.parseURL(f)));
    const items: NewsItem[] = [];
    for (const r of feeds) {
      if (r.status !== "fulfilled") continue;
      const feed = r.value;
      for (const it of feed.items.slice(0, 10)) {
        const url = it.link || "";
        if (!url) continue;
        const title = it.title || "";
        const summary = (it.contentSnippet || it.content || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 280);
        const source = (feed.title || "").split(" - ")[0];
        items.push({
          id: Buffer.from(url).toString("base64"),
          source, title, url, summary,
          publishedAt: (it as any).isoDate || it.pubDate,
          image: (it as any)?.enclosure?.url,
          angles: proposeAngles(title, summary),
        });
      }
    }
    const needOg = items.filter((i) => !i.image).slice(0, 10);
    await Promise.all(needOg.map(async (i) => {
      i.image = await getOgImage(i.url);
    }));
    const seen = new Set<string>();
    const result: NewsItem[] = [];
    for (const i of items) {
      if (seen.has(i.url)) continue;
      seen.add(i.url);
      result.push(i);
    }
    result.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
    if (result.length > 0) return result.slice(0, 30);
    throw new Error("Empty news aggregation");
  } catch (e) {
    console.warn("fetchNews failed, falling back to mock:", (e as any)?.message);
    const now = new Date().toISOString();
    const mock: NewsItem[] = [
      {
        id: "mock-1",
        source: "KeiroAI Mock",
        title: "AI marketing trend: short-form creative wins",
        url: "https://example.com/ai-marketing",
        summary: "Brands double down on AI-assisted visuals and captions for reactive campaigns.",
        publishedAt: now,
        image: "https://picsum.photos/seed/ai/600/400",
        angles: ["Educational: 3 key takeaways", "Business: key numbers + call to action", "AI: visual demo + practical tips"],
      },
      {
        id: "mock-2",
        source: "KeiroAI Mock",
        title: "Wellbeing products surge with adaptogens",
        url: "https://example.com/adaptogens",
        summary: "Consumers adopt functional coffees (Lion's Mane) for focus and clarity.",
        publishedAt: now,
        image: "https://picsum.photos/seed/mushu/600/400",
        angles: ["Consumer benefits: why it matters daily", "Product link: concrete use case"],
      },
    ];
    return mock;
  }
}
