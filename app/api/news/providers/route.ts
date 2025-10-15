export const runtime = "nodejs";

type Check = { name:string; configured:boolean; ok:boolean; count?:number; status?:number; error?:string };

async function callGNews(q:string):Promise<Check>{
  const key=process.env.GNEWS_KEY||""; const out:Check={name:"gnews",configured:!!key,ok:false};
  if(!key) return out;
  try{
    const u=new URL("https://gnews.io/api/v4/search");
    u.searchParams.set("q",q); u.searchParams.set("lang","fr"); u.searchParams.set("max","10"); u.searchParams.set("token",key);
    const r=await fetch(u); out.status=r.status; const j:any=await r.json();
    out.count=(j?.articles||[]).length; out.ok = r.ok;
  }catch(e:any){ out.error=String(e); }
  return out;
}
async function callNewsdata(q:string):Promise<Check>{
  const key=process.env.NEWSDATA_KEY||""; const out:Check={name:"newsdata",configured:!!key,ok:false};
  if(!key) return out;
  try{
    const u=new URL("https://newsdata.io/api/1/news");
    u.searchParams.set("apikey",key); u.searchParams.set("q",q); u.searchParams.set("language","fr");
    const r=await fetch(u); out.status=r.status; const j:any=await r.json();
    out.count=(j?.results||[]).length; out.ok = r.ok;
  }catch(e:any){ out.error=String(e); }
  return out;
}
async function callNewsapiAI(q:string):Promise<Check>{
  const key=process.env.NEWSAPIAI_KEY||""; const out:Check={name:"newsapi.ai",configured:!!key,ok:false};
  if(!key) return out;
  try{
    const u=new URL("https://newsapi.ai/api/v1/article/getArticles");
    u.searchParams.set("token",key); u.searchParams.set("query",q); u.searchParams.set("size","10");
    const r=await fetch(u); out.status=r.status; const j:any=await r.json();
    const arts=(j?.articles||j?.data||j?.results)||[];
    out.count=arts.length; out.ok = r.ok;
  }catch(e:any){ out.error=String(e); }
  return out;
}

export async function GET(req:Request){
  const u=new URL(req.url);
  const q = u.searchParams.get("q") || "football";
  const checks = await Promise.all([callGNews(q), callNewsdata(q), callNewsapiAI(q)]);
  return Response.json({ q, checks });
}
