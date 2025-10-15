export const runtime = "nodejs";

/* ---------- Cache mémoire ---------- */
type CacheEntry = { t: number; body: any };
const CACHE_TTL_MS = Math.max(1, Number(process.env.NEWS_CACHE_TTL_HOURS || "24")) * 60 * 60 * 1000;
// @ts-ignore
const __cache: Map<string, CacheEntry> = (globalThis as any).__newsCache ||= new Map<string, CacheEntry>();
const kCache = (q:string, period:string, limit:number) => JSON.stringify({ q, period, limit });
const getCached = (q:string,p:string,l:number)=>{const e=__cache.get(kCache(q,p,l)); if(!e) return null; if(Date.now()-e.t>CACHE_TTL_MS){__cache.delete(kCache(q,p,l)); return null;} return e.body;};
const setCached = (q:string,p:string,l:number,body:any)=>__cache.set(kCache(q,p,l),{t:Date.now(),body});

/* ---------- Types & utils ---------- */
type Item = { title:string; url:string; source?:string; publishedAt?:string; imageUrl?:string; description?:string; _provider?:string; _score?:number; };
const sinceISO=(tf?:string|null)=>{ const p=(tf||"24h").toLowerCase(), d=new Date(); if(p==="24h") d.setHours(d.getHours()-24); else if(p==="48h") d.setHours(d.getHours()-48); else if(p==="7d"||p==="7j") d.setDate(d.getDate()-7); else return null; return d.toISOString(); };
const domainFromUrl=(u?:string)=>{try{return u?new URL(u).hostname.replace(/^www\./,'').toLowerCase():null}catch{return null}};
const sourceKey=(it:Item)=>domainFromUrl(it.url) || (it.source||"").toLowerCase().trim();

/* ---------- Providers (GNews, Newsdata, Newsapi.ai) ---------- */
async function fetchGNews(query:string, fromISO:string|null, max=30):Promise<Item[]>{
  const key=process.env.GNEWS_KEY; if(!key) return [];
  const url=new URL("https://gnews.io/api/v4/search");
  url.searchParams.set("q",query); url.searchParams.set("lang","fr"); url.searchParams.set("max",String(max)); if(fromISO) url.searchParams.set("from",fromISO);
  url.searchParams.set("token",key);
  const r=await fetch(url); if(!r.ok) return []; const j:any=await r.json();
  return (j.articles||[]).map((a:any)=>({ title:a.title, url:a.url, source:a.source?.name, publishedAt:a.publishedAt||a.published_at, imageUrl:a.image, description:a.description, _provider:"gnews" }));
}
async function fetchNewsdata(query:string, fromISO:string|null, size=30):Promise<Item[]>{
  const key=process.env.NEWSDATA_KEY; if(!key) return [];
  const url=new URL("https://newsdata.io/api/1/news");
  url.searchParams.set("apikey",key); url.searchParams.set("q",query); url.searchParams.set("language","fr");
  if(fromISO) url.searchParams.set("from_date",(fromISO||"").slice(0,10)); url.searchParams.set("page","1");
  const r=await fetch(url); if(!r.ok) return []; const j:any=await r.json();
  return (j.results||[]).slice(0,size).map((a:any)=>({ title:a.title, url:a.link, source:a.source_id||a.source||(a.creator?.[0]), publishedAt:a.pubDate||a.pub_date, imageUrl:a.image_url, description:a.description||a.content, _provider:"newsdata" }));
}
async function fetchNewsapiAI(query:string, fromISO:string|null, size=30):Promise<Item[]>{
  const key=process.env.NEWSAPIAI_KEY; if(!key) return [];
  try{
    const url=new URL("https://newsapi.ai/api/v1/article/getArticles");
    url.searchParams.set("token",key);
    url.searchParams.set("query",query);
    url.searchParams.set("size",String(Math.min(size,50)));
    const r=await fetch(url); if(!r.ok) return []; const j:any=await r.json();
    const arts=(j && (j.articles||j.data||j.results))||[];
    return arts.map((a:any)=>({
      title:a.title||a.title_full||a.titleShort||"",
      url:a.url||a.webUrl||a.link||"",
      source:a.source?.title||a.source?.name||a.sourceTitle||a.sourceName,
      publishedAt:a.dateTimePub||a.publishedAt||a.pubDate||a.date,
      imageUrl:a.image||a.imageUrl||a.thumbnail,
      description:a.body||a.description||a.snippet,
      _provider:"newsapi.ai",
    })).filter((x:Item)=>x.title && x.url);
  }catch{return [];}
}

/* ---------- Scoring + 1/article/source ---------- */
const TRUSTED_BOOST=new Map<string,number>([
  ["lemonde.fr",1.0],["lesechos.fr",1.0],["lefigaro.fr",0.8],["france24.com",0.8],["lequipe.fr",0.9],
  ["numerama.com",0.9],["frandroid.com",0.9],["clubic.com",0.8],["01net.com",0.7],["nextinpact.com",0.9],
]);
const textScore=(t:string,inc:string[],exc:string[])=>{const s=(t||"").toLowerCase();let x=0;inc.forEach(k=>{if(s.includes(k.toLowerCase()))x+=1.2});exc.forEach(k=>{if(s.includes(k.toLowerCase()))x-=1.5});return x;}
const scoreItem=(it:Item,inc:string[],exc:string[])=>{let s=0;s+=textScore(it.title||"",inc,exc)*1.4;s+=textScore(it.description||"",inc,exc)*0.8;const d=domainFromUrl(it.url);if(d&&TRUSTED_BOOST.has(d))s+=TRUSTED_BOOST.get(d)!;if((it.title||"").length<40)s-=0.3;return Math.round(s*10)/10;}
const onePerSource=(items:Item[])=>{const seen=new Set<string>(),out:Item[]=[];for(const it of items){const k=sourceKey(it);if(!k||seen.has(k))continue;seen.add(k);out.push(it);}return out;}

/* ---------- GET handler ---------- */
export async function GET(req: Request){
  try{
    const u=new URL(req.url);
    const q=(u.searchParams.get("query")||"").trim();
    if(!q) return Response.json({items:[],error:"Missing 'query' parameter"}, {status:400});
    const period=(u.searchParams.get("period")||"24h").toLowerCase();
    const limit=Math.max(1,Math.min(24,Number(u.searchParams.get("limit")||"12")));
    const minScore=Number(process.env.NEWS_MIN_SCORE||"1.8");

    // cache
    const cached=getCached(q,period,limit);
    if(cached) return new Response(JSON.stringify(cached),{status:200,headers:{"content-type":"application/json","x-cache":"HIT","x-cache-ttl-hours":String(process.env.NEWS_CACHE_TTL_HOURS||"24")}});

    const fromISO=sinceISO(period);
    let items:Item[]=[];
    for(const p of [()=>fetchGNews(q,fromISO,50),()=>fetchNewsdata(q,fromISO,50),()=>fetchNewsapiAI(q,fromISO,50)]){
      const batch=await p().catch(()=>[]);
      items=items.concat(batch);
      if(items.length>=120) break;
    }

    // heuristique include/exclude: on tente d’extraire ("...") NOT ("...")
    const mInclude=[...q.matchAll(/"([^"]+)"/g)].map(x=>x[1]).filter(Boolean);
    const mExclude=[...q.matchAll(/NOT\s+\(([^)]+)\)/gi)]
      .flatMap(x=>x[1].split(/"\s*OR\s*"/i).map(s=>s.replace(/^"+|"+$/g,"").trim()))
      .filter(Boolean);

    const inc = mInclude.length ? mInclude : [q];
    const exc = mExclude;

    const scored=items.map(it=>({...it,_score:scoreItem(it,inc,exc)}))
      .filter(it=>(it._score||0)>=minScore)
      .sort((a,b)=>(b._score||0)-(a._score||0) || (Date.parse(b.publishedAt||"")-Date.parse(a.publishedAt||"")));
    const unique=onePerSource(scored).slice(0,limit).map(({_score,...rest})=>rest);

    const body={items:unique,meta:{query:q,minScore,cached:false}};
    setCached(q,period,limit,body);

    return new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json","x-cache":"MISS","x-cache-ttl-hours":String(process.env.NEWS_CACHE_TTL_HOURS||"24")}});
  }catch(e:any){
    return Response.json({items:[],error:e?.message||"error"},{status:500});
  }
}
