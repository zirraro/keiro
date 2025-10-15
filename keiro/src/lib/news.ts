import Parser from "rss-parser";

export type NewsItem = {
  id: string;
  source?: string;
  title: string;
  snippet?: string;
  url?: string;
  published?: string;
  tags?: string[];
  hot?: boolean;
  image?: string | null;
};

const HL="fr", GL="FR", CEID="FR:fr";
const parser = new Parser({ headers: { "User-Agent": "Keiro/1.0 (+github)" } });

function hostOf(link?: string){ try{ return new URL(link||"").hostname.replace(/^www\./,""); }catch{return ""} }
function feedUrl({q,topic}:{q?:string;topic?:string}){
  const map:Record<string,string>={ business:"BUSINESS", technology:"TECHNOLOGY", science:"SCIENCE", world:"WORLD", health:"HEALTH", sports:"SPORTS" };
  if(q) return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${HL}&gl=${GL}&ceid=${CEID}`;
  if(topic && map[topic]) return `https://news.google.com/rss/headlines/section/topic/${map[topic]}?hl=${HL}&gl=${GL}&ceid=${CEID}`;
  return `https://news.google.com/rss?hl=${HL}&gl=${GL}&ceid=${CEID}`;
}
async function read(url:string, max=24):Promise<NewsItem[]>{
  const feed = await parser.parseURL(url);
  return (feed.items||[]).slice(0,max).map((it:any, i:number)=>({
    id: String(it.link || `${url}#${i}`),
    source: it?.source?.title || hostOf(it.link) || "source",
    title: it.title || "(Sans titre)",
    snippet: it.contentSnippet || it.content || "",
    url: it.link || undefined,
    published: it.isoDate || it.pubDate || undefined,
  }));
}
export async function fetchByQuery(q:string, topic?:string, max=9){
  const url = feedUrl({q, topic});
  const raw = await read(url, max*3);
  const seen = new Set<string>(); const out:NewsItem[]=[];
  for(const it of raw){
    const k=(it.source||"").toLowerCase().trim(); if(!k || seen.has(k)) continue;
    seen.add(k); out.push(it); if(out.length>=max) break;
  }
  return out.map((x,i)=>({...x, hot:i<2}));
}
export async function fetchTrending(topic?:string, max=9){
  try{
    // Optionnel: Trends → 1 article par requête (si module dispo)
    // @ts-ignore
    const gt:any = await import("google-trends-api");
    const raw = await gt.dailyTrends({ geo:"FR" });
    const json = JSON.parse(raw);
    const queries:string[] = Array.from(new Set(
      (json?.default?.trendingSearchesDays||[]).flatMap((d:any)=>
        (d?.trendingSearches||[]).map((s:any)=>s?.title?.query).filter(Boolean)
      )
    ));
    const bySource = new Map<string, NewsItem>();
    for(const q of queries){
      if(bySource.size>=max) break;
      const arr = await fetchByQuery(q, topic, 1);
      const it = arr[0]; if(!it) continue;
      const key=(it.source||"").toLowerCase().trim(); if(!key || bySource.has(key)) continue;
      bySource.set(key, it);
    }
    if(bySource.size) return Array.from(bySource.values()).slice(0,max).map((x,i)=>({...x, hot:i<2}));
  }catch{/* ignore */}
  // Fallback : top headlines (RSS)
  const raw = await read(feedUrl({topic}), max*3);
  const seen = new Set<string>(); const out:NewsItem[]=[];
  for(const it of raw){
    const k=(it.source||"").toLowerCase().trim(); if(!k || seen.has(k)) continue;
    seen.add(k); out.push(it); if(out.length>=max) break;
  }
  return out.map((x,i)=>({...x, hot:i<2}));
}
