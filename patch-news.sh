sed -i '
/async function fromGNews()/,/return {items, used: items.length>0}/c\
async function fromGNews(category?:string){\
  const key=process.env.GNEWS_API_KEY;\
  if(!key) return {items:[],used:false};\
  const topics:Record<string,string>={\
    "Tech":"tech", "Politique":"politics", "Sport":"sports", "Business":"business", "Économie":"business",\
    "Santé":"health", "Monde":"world", "Culture":"entertainment", "People":"entertainment", "Gaming":"gaming"\
  };\
  const q = topics[category||""] ? \`&topic=\${topics[category]}\` : "";\
  const url=\`https://gnews.io/api/v4/top-headlines?lang=fr&country=fr&max=50\${q}&apikey=\${key}\`;\
  const j = await fetchJson(url);\
  const items=(j.articles||[]).map((a:any)=>({\
    id:safeId(a.url,a.title), title:a.title, description:a.description, url:a.url,\
    image:a.image||a.image_url||null, source:a.source?.name||"GNews", publishedAt:a.publishedAt } as Item));\
  return {items, used: items.length>0};\
}' src/app/api/news/route.ts

# Ajout : si matched=0, on relance GNews avec query spécifique
sed -i '/matched: annotated.filter/a\
    if (items.length===0 && want!=="À la une") {\
      try {\
        const retry = await fromGNews(want);\
        if (retry.items.length) {\
          const retryCat = withCategory(retry.items);\
          const scored = retryCat.map(a=>({it:a,score:catScore(\`\${a.title} \${a.description||""}\`,want)}));\
          items = scored.sort((a,b)=>b.score-a.score).map(a=>a.it).slice(0,12);\
        }\
      } catch {}\
    }' src/app/api/news/route.ts
