export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

// Catégories + mots-clés pour pertinence (fr + en, court et ciblé)
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  IA: ['intelligence artificielle','IA','artificial intelligence','AI','large language model','LLM','genAI','générative','openai','anthropic','google ai','meta ai','copilot','chatbot'],
  Tech: ['startup','software','app','saas','fintech','cloud','cyber','cybersécurité','data','blockchain','crypto','semiconductor','puce'],
  Business: ['acquisition','levée de fonds','funding','IPO','partenariat','merger','M&A','chiffre d’affaires','croissance','market share'],
  Marketing: ['campagne','branding','publicité','ads','social media','seo','sea','influence','tiktok','instagram','linkedin'],
  Économie: ['inflation','PIB','GDP','taux','intérêt','banque centrale','BCE','FED','emploi','marché','bourse','indices'],
  Santé: ['santé','health','biotech','pharma','médicament','clinique','medical','hôpital','épidémie','WHO','OMS'],
  Énergie: ['énergie','energy','nucléaire','nuclear','solaire','solar','éolien','wind','hydrogène','hydrogen','batterie'],
  Environnement: ['climat','climate','carbone','CO2','décarbonation','biodiversité','durable','sustainability','ESG','écologie'],
  Politique: ['élections','parlement','gouvernement','policy','loi','réglementation','UE','EU','diplomatie'],
};

type Article = {
  title: string; url: string; image?: string; source?: string;
  publishedAt?: string; description?: string; category?: string;
};

function keepRelevant(a: Article, kws: string[]) {
  const hay = `${a.title || ''} ${a.description || ''}`.toLowerCase();
  return kws.some(k => hay.includes(k.toLowerCase()));
}
function dedupe(list: Article[]) {
  const seen = new Set<string>();
  return list.filter(a=>{
    const key = (a.title||'') + '|' + (a.source||'');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// Providers — on interroge plusieurs, puis on filtre localement
async function fetchGNews(q: string): Promise<Article[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=fr&max=20&apikey=${key}`;
  const r = await fetch(url); if (!r.ok) return [];
  const j = await r.json();
  return (j.articles||[]).map((x:any)=>({
    title: x.title, url: x.url, image: x.image, source: x.source?.name, publishedAt: x.publishedAt, description: x.description
  }));
}
async function fetchNewsdata(q: string): Promise<Article[]> {
  const key = process.env.NEWSDATA_API_KEY; if (!key) return [];
  const url = `https://newsdata.io/api/1/news?apikey=${key}&q=${encodeURIComponent(q)}&language=fr&size=20`;
  const r = await fetch(url); if (!r.ok) return [];
  const j = await r.json();
  return (j.results||[]).map((x:any)=>({
    title: x.title, url: x.link, image: x.image_url, source: x.source_id, publishedAt: x.pubDate, description: x.description
  }));
}
async function fetchNewsapiAI(q: string): Promise<Article[]> {
  const key = process.env.NEWSAPI_AI_KEY; if (!key) return [];
  const url = `https://eventregistry.org/api/v1/article/getArticles?apiKey=${key}&keyword=${encodeURIComponent(q)}&lang=fra&resultType=articles&articlesCount=20`;
  const r = await fetch(url); if (!r.ok) return [];
  const j = await r.json();
  const arts = j?.articles?.results || [];
  return arts.map((x:any)=>({
    title: x.title, url: x.url, image: x.image, source: x.source?.title, publishedAt: x.date, description: x.body
  }));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || 'IA';
    const kws = CATEGORY_KEYWORDS[category] || CATEGORY_KEYWORDS.IA;

    // On construit une requête "OR" courte pour rester robuste
    const q = kws.slice(0,6).join(' OR ');

    const [a,b,c] = await Promise.all([
      fetchGNews(q), fetchNewsdata(q), fetchNewsapiAI(q)
    ]);
    let all = [...a, ...b, ...c].map(x => ({...x, category}));
    all = all.filter(x => keepRelevant(x, kws));
    all = dedupe(all).slice(0,18);

    return NextResponse.json({ ok:true, category, count: all.length, articles: all });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:'NEWS_FETCH_ERROR', detail: String(e) }, { status:500 });
  }
}
