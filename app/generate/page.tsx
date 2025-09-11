"use client";
import { useEffect, useState } from "react";
type NewsItem = { id:string; source:string; title:string; url:string; summary:string; publishedAt?:string; image?:string; angles:string[]; };

export default function GeneratePage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [selected, setSelected] = useState<NewsItem|null>(null);
  const [chosenAngle, setChosenAngle] = useState("");
  const [imageUrl, setImageUrl] = useState(""); const [caption, setCaption] = useState("");
  const [loadingGen, setLoadingGen] = useState(false); const [loadingPub, setLoadingPub] = useState(false);

  useEffect(() => { (async () => {
    try { const r = await fetch("/api/news"); const j = await r.json(); if (j.ok) setNews(j.items); } catch {}
  })(); }, []);

  const onGenerate = async () => {
    setLoadingGen(true);
    try {
      const r = await fetch("/api/generate", { method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ news: selected ? { title:selected.title, summary:selected.summary, url:selected.url, angle:chosenAngle||selected.angles[0], source:selected.source } : null }) });
      const j = await r.json(); if (j.ok) { setImageUrl(j.imageUrl); setCaption(j.caption); } else alert(j.error||"Erreur");
    } finally { setLoadingGen(false); }
  };
  const onPublish = async () => {
    if (!imageUrl) return alert("Rien à publier");
    setLoadingPub(true);
    try {
      const r = await fetch("/api/publish", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ imageUrl, caption, userId:"keiroai" }) });
      const j = await r.json(); if (j.ok) alert("Envoyé à Make ✅"); else alert(j.error||"Erreur");
    } finally { setLoadingPub(false); }
  };
  const prettyDate = (d?:string) => (d ? new Date(d).toLocaleString() : "");

  return (<main style={{ padding:24, maxWidth:1100, margin:"0 auto", fontFamily:"system-ui" }}>
    <h1>Actu → Carte → Génération</h1>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:16 }}>
      {news.map(n => {
        const isSel = selected?.id===n.id;
        return (<article key={n.id} style={{ border:isSel?"2px solid #111":"1px solid #ddd", borderRadius:12, overflow:"hidden", boxShadow:isSel?"0 6px 22px rgba(0,0,0,.15)":"0 1px 8px rgba(0,0,0,.08)" }}>
          {n.image ? <img src={n.image} alt="" style={{ width:"100%", height:150, objectFit:"cover" }}/> : <div style={{ height:150, background:"#f3f3f3" }} />}
          <div style={{ padding:12 }}>
            <div style={{ fontSize:12, opacity:.7 }}>{n.source} · {prettyDate(n.publishedAt)}</div>
            <h3 style={{ margin:"6px 0 8px" }}>{n.title}</h3>
            <p style={{ fontSize:14, opacity:.85 }}>{n.summary}</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:8 }}>
              {n.angles.map(a => <button key={a} onClick={() => { setSelected(n); setChosenAngle(a); }}
                style={{ padding:"6px 10px", borderRadius:999, border:(chosenAngle===a && selected?.id===n.id)?"2px solid #111":"1px solid #ccc",
                background:"#fff", cursor:"pointer", fontSize:12 }}>{a}</button>)}
            </div>
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <a href={n.url} target="_blank" rel="noreferrer" style={{ fontSize:13 }}>Lire la source</a>
              <button onClick={() => { setSelected(n); if (!chosenAngle) setChosenAngle(n.angles[0]); }}
                style={{ marginLeft:"auto", padding:"6px 10px", borderRadius:8, border:"1px solid #111", background:"#111", color:"#fff" }}>
                Utiliser cette actu
              </button>
            </div>
          </div>
        </article>);
      })}
    </div>

    <section style={{ marginTop:24 }}>
      <h2>Générer</h2>
      <button onClick={onGenerate} disabled={loadingGen} style={{ padding:12 }}>
        {loadingGen ? "Génération..." : "Générer à partir de l’actu sélectionnée"}
      </button>
      {imageUrl && (<div style={{ marginTop:24 }}>
        <img src={imageUrl} alt="preview" style={{ width:360, borderRadius:12 }} />
        <textarea value={caption} onChange={e=>setCaption(e.target.value)} rows={6} style={{ width:"100%", marginTop:12 }} />
        <button onClick={onPublish} disabled={loadingPub} style={{ padding:12, marginTop:12 }}>
          {loadingPub ? "Publication..." : "Publier (Make → Instagram)"}
        </button>
      </div>)}
    </section>
  </main>);
}
