import { CleanCat } from './rssFeeds';

export type Item = {
  title: string;
  description?: string;
  url: string;
  image?: string;
  source?: string;
  publishedAt?: string;
};

const CAT_TO_TOPIC_GNEWS: Partial<Record<CleanCat,string>> = {
  'a-la-une':'world',
  politique:'nation',
  economie:'business',
  business:'business',
  sport:'sports',
  people:'entertainment',
  sante:'health',
  tech:'technology',
  culture:'entertainment',
  monde:'world',
  climat:'science',
};

const CAT_TO_TOPIC_NEWSDATA: Partial<Record<CleanCat,string>> = {
  'a-la-une':'top',
  politique:'politics',
  economie:'business',
  business:'business',
  sport:'sports',
  people:'entertainment',
  sante:'health',
  tech:'technology',
  culture:'entertainment',
  monde:'world',
  climat:'environment'
};

function since(tf:'24h'|'7j'){
  const ms = tf==='24h' ? 24*3600*1000 : 7*24*3600*1000;
  return new Date(Date.now()-ms).toISOString().slice(0,19)+'Z';
}

export async function fetchGNews(params:{
  cat:CleanCat, q:string, tf:'24h'|'7j', limit:number, lang?:string, key?:string
}):Promise<Item[]>{
  const {cat,q,tf,limit,lang='fr',key} = params;
  if(!key) return [];
  const base = 'https://gnews.io/api/v4/top-headlines';
  const topic = CAT_TO_TOPIC_GNEWS[cat];
  const url = new URL(base);
  if(topic) url.searchParams.set('topic', topic);
  if(q)     url.searchParams.set('q', q);
  url.searchParams.set('lang', lang);
  url.searchParams.set('max', String(Math.min(50, Math.max(1, limit))));
  url.searchParams.set('token', key);
  // Pas de param dateStart officiel sur /top-headlines → on filtre côté client
  const res = await fetch(url.toString(), { cache: 'no-store' });
  const js  = await res.json().catch(()=>({}));
  const arr = Array.isArray(js.articles)? js.articles : [];
  const minDate = new Date(since(tf)).getTime();
  return arr.map((a:any)=>({
    title: a.title,
    description: a.description,
    url: a.url,
    image: a.image,
    source: a.source?.name,
    publishedAt: a.publishedAt
  })).filter(it=>{
    const t = new Date(it.publishedAt||0).getTime();
    return !Number.isNaN(t) ? t>=minDate : true;
  });
}

export async function fetchNewsData(params:{
  cat:CleanCat, q:string, tf:'24h'|'7j', limit:number, lang?:string, key?:string
}):Promise<Item[]>{
  const {cat,q,tf,limit,lang='fr',key} = params;
  if(!key) return [];
  const base = 'https://newsdata.io/api/1/news';
  const url = new URL(base);
  url.searchParams.set('apikey', key);
  url.searchParams.set('language', lang);
  const ndCat = CAT_TO_TOPIC_NEWSDATA[cat];
  if(ndCat) url.searchParams.set('category', ndCat);
  if(q)     url.searchParams.set('q', q);
  url.searchParams.set('page', '1');
  url.searchParams.set('size', String(Math.min(50, Math.max(1, limit))));
  // pas de date précise → filtrage client
  const res = await fetch(url.toString(), { cache: 'no-store' });
  const js  = await res.json().catch(()=>({}));
  const arr = Array.isArray(js.results)? js.results : [];
  const minDate = new Date(since(tf)).getTime();
  return arr.map((a:any)=>({
    title: a.title,
    description: a.description,
    url: a.link,
    image: a.image_url,
    source: a.source_id,
    publishedAt: a.pubDate
  })).filter(it=>{
    const t = new Date(it.publishedAt||0).getTime();
    return !Number.isNaN(t) ? t>=minDate : true;
  });
}

export async function fetchNewsApiAI(params:{
  cat:CleanCat, q:string, tf:'24h'|'7j', limit:number, lang?:string, key?:string
}):Promise<Item[]>{
  // NewsAPI.ai (EventRegistry) → on passe par getArticles en "keyword" (cat peu variable)
  const {q,tf,limit,lang='fr',key} = params;
  if(!key) return [];
  const base = 'https://newsapi.ai/api/v1/article/getArticles';
  const url = new URL(base);
  url.searchParams.set('apiKey', key);
  url.searchParams.set('resultType', 'articles');
  url.searchParams.set('lang', lang);
  url.searchParams.set('articlesSortBy', 'date');
  url.searchParams.set('articlesCount', String(Math.min(50, Math.max(1, limit))));
  const startISO = since(tf);
  url.searchParams.set('dateStart', startISO);
  if(q) url.searchParams.set('keyword', q);
  // NOTE: on reste défensif, le format peut être {articles:{results:[]}}
  const res = await fetch(url.toString(), { method:'POST', cache:'no-store' });
  const js  = await res.json().catch(()=>({}));
  const arr = js?.articles?.results || js?.articles || [];
  return (Array.isArray(arr)? arr : []).map((a:any)=>({
    title: a.title || a?.title?.title,
    description: a.body || a?.body?.body,
    url: a.url || a?.url,
    image: a.image || a?.image,
    source: a.source?.title || a.source || a?.source?.uri,
    publishedAt: a.date || a?.dateTime || a?.dateTimePub
  })).filter(it=> it.title && it.url);
}
