"use client";
import { useEffect, useMemo, useState } from "react";

type Heat = "very_hot" | "hot" | "warm" | "watch";
type NewsItem = {
  id?: string; source?: string; title?: string; url?: string; summary?: string;
  image?: string; publishedAt?: string; angles?: string[];
  _socialScore?: number; _heat?: Heat; _emoji?: string; _reasons?: string[];
};

const WINDOWS = [
  { label: "24h", hours: 24 }, { label: "48h", hours: 48 },
  { label: "72h", hours: 72 }, { label: "7j", hours: 168 },
];

function cls(...xs: (string | false | null | undefined)[]) { return xs.filter(Boolean).join(" "); }
function fmtDate(s?: string) { if(!s) return ""; const d=new Date(s); return isNaN(+d)?"":d.toLocaleString(); }

export default function GeneratePage() {
  // Onglets listes
  const [tab, setTab] = useState<"trending"|"latest">("trending");
  const [hours, setHours] = useState(48);
  const [strict, setStrict] = useState(false);

  // Données actus
  const [latest, setLatest] = useState<NewsItem[]>([]);
  const [trending, setTrending] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [selected, setSelected] = useState<NewsItem|null>(null);

  // Média à générer
  const [media, setMedia] = useState<"image"|"video">("image");

  // Champs de prompt
  const [audience, setAudience] = useState("Directeurs marketing PME");
  const [tone, setTone] = useState("Percutant");
  const [objective, setObjective] = useState("Booster les démos");
  const [hook, setHook] = useState("Gagnez 10h/semaine avec l’IA");
  const [cta, setCta] = useState("Démarrez avec KeiroAI");
  const [tags, setTags] = useState("KeiroAI, Fast Marketing, contenu instantané");
  const [platform, setPlatform] = useState("Instagram");
  const [format, setFormat] = useState("Portrait (1080×1350)");

  // Upload référence (logo/photo)
  const [referenceUrl, setReferenceUrl] = useState<string>("");
  const [refUploading, setRefUploading] = useState(false);
  const [refError, setRefError] = useState<string|null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Résultats
  const [imgUrl, setImgUrl] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [caption, setCaption] = useState<string>("");

  const [loadingGen, setLoadingGen] = useState(false);
  const [loadingPub, setLoadingPub] = useState(false);

  const list = useMemo(()=> (tab==="trending"?trending:latest), [tab,trending,latest]);

  // Aperçu prompt (comme sur ta capture)
  const promptPreview = useMemo(()=>[
    `Objectif: ${objective}`,
    `Audience: ${audience}`,
    `Tonalité: ${tone}`,
    `Hook: ${hook}`,
    `CTA: ${cta}`,
    `Plateforme: ${platform} • Format: ${format}`,
    `Hashtags: ${tags}`,
  ].join("\n"),[objective,audience,tone,hook,cta,platform,format,tags]);

  // Formats selon media
  const IMAGE_FORMATS = [
    "Portrait (1080×1350)",
    "Carré (1080×1080)",
    "Story (1080×1920)",
    "Paysage (1200×628)",
  ];
  const VIDEO_FORMATS = [
    "Portrait Reel (1080×1920)",
    "Carré (1080×1080)",
    "YouTube Shorts (1080×1920)",
    "16:9 Landscape (1920×1080)",
  ];
  useEffect(()=>{ setFormat(media==="image" ? IMAGE_FORMATS[0] : VIDEO_FORMATS[0]); },[media]);

  // Charger actus récentes
  useEffect(()=>{ (async ()=>{
    try { const r=await fetch("/api/news",{cache:"no-store"}); const j=await r.json(); if(j?.ok) setLatest(j.items||[]); } catch {}
  })(); },[]);

  // Charger trending
  useEffect(()=>{ (async ()=>{
    setLoading(true); setErr(null);
    try {
      const r=await fetch(`/api/news/social?hours=${hours}&strict=${strict?1:0}`,{cache:"no-store"});
      const j=await r.json(); if(!j?.ok) throw new Error(j?.error||"API error");
      setTrending(j.trending||[]);
    } catch(e:any){ setErr(e?.message||"Erreur réseau"); }
    finally { setLoading(false); }
  })(); },[hours,strict]);

  async function onGenerate(){
    if(!selected) return;
    setLoadingGen(true); setImgUrl(""); setVideoUrl(""); setCaption("");
    try{
      const body = {
        brandId:"keiroai",
        campaignId:"default",
        kind: media,                                  // <-- image | video
        news:{ title:selected.title, summary:selected.summary, url:selected.url, angle:hook, source:selected.source },
        guidance:{ audience,tone,objective,hook,cta,tags,platform,format, referenceImageUrl: referenceUrl || undefined }
      };
      // même endpoint côté serveur : on lui passe kind=video si besoin
      const r=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const j=await r.json(); if(!j?.ok) throw new Error(j?.error||"Échec génération");

      // Si le backend renvoie une vidéo, on l’affiche. Sinon image.
      if (j.videoUrl) { setVideoUrl(j.videoUrl); }
      if (j.imageUrl) { setImgUrl(j.imageUrl); }
      setCaption(j.caption||"");
    }catch(e:any){ alert(e?.message||"Erreur pendant la génération"); }
    finally{ setLoadingGen(false); }
  }

  async function onPublish(){
    const url = videoUrl || imgUrl;
    if(!url) return;
    setLoadingPub(true);
    try{
      const r=await fetch("/api/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageUrl:url,caption:caption||"",userId:"keiroai"})});
      const j=await r.json(); if(!j?.ok) throw new Error(j?.error||"Échec publication");
      alert("Envoyé à Make ✅");
    }catch(e:any){ alert(e?.message||"Erreur publication"); }
    finally{ setLoadingPub(false); }
  }

  async function uploadFile(file: File){
    setRefUploading(true); setRefError(null);
    try{
      const fd=new FormData(); fd.append("file",file);
      const r=await fetch("/api/upload",{method:"POST",body:fd});
      const j=await r.json(); if(!j?.ok) throw new Error(j?.error||"Upload échoué");
      setReferenceUrl(j.url);
    }catch(e:any){ setRefError(e?.message||"Erreur upload"); }
    finally{ setRefUploading(false); }
  }
  async function onReferenceChange(e: React.ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0]; if(!f) return; await uploadFile(f); e.target.value="";
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>){
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0]; if(f) uploadFile(f);
  }

  const listToShow = useMemo(()=> (tab==="trending"?trending:latest),[tab,trending,latest]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLONNE GAUCHE : cartes actus */}
        <div className="lg:col-span-7">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-neutral-500">KeiroAI — Actu → Cartes → Génération</div>
            <a className="text-sm underline opacity-70 hover:opacity-100" href="/trendy" target="_blank" rel="noreferrer">Ouvrir /trendy ↗</a>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <button className={cls("px-3 py-1 rounded-md text-sm", tab==="trending"?"bg-black text-white":"bg-neutral-100 hover:bg-neutral-200")} onClick={()=>setTab("trending")}>Trending</button>
            <button className={cls("px-3 py-1 rounded-md text-sm", tab==="latest"?"bg-black text-white":"bg-neutral-100 hover:bg-neutral-200")} onClick={()=>setTab("latest")}>Toutes</button>
            {tab==="trending" && (
              <>
                <div className="mx-2 h-5 w-px bg-neutral-200" />
                {WINDOWS.map(w=>(
                  <button key={w.hours} onClick={()=>setHours(w.hours)}
                          className={cls("px-3 py-1 rounded-md border text-sm",
                            hours===w.hours?"bg-black text-white border-black":"bg-white hover:bg-neutral-100 border-neutral-300")}>
                    {w.label}
                  </button>
                ))}
                <label className="ml-2 inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={strict} onChange={e=>setStrict(e.target.checked)} />
                  Mode strict
                </label>
              </>
            )}
          </div>

          <div className="text-sm text-neutral-500 mb-3">
            {tab==="trending"
              ? (loading?"Chargement…":err?<span className="text-red-600">Erreur: {err}</span>:`${trending.length} actus sélectionnées`)
              : `${latest.length} actus récentes`}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {listToShow.map((it,i)=>(
              <article key={(it.id||it.url||i) as any}
                       className={cls("rounded-xl border border-neutral-200 bg-white overflow-hidden transition",
                                      selected?.url===it.url?"ring-2 ring-black":"hover:shadow-md")}>
                {it.image && (
                  <a href={it.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.image} className="w-full h-40 object-cover" alt="" />
                  </a>
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {tab==="trending" && it._heat && (
                        <span className={cls(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          it._heat==="very_hot"?"bg-red-100 text-red-700":
                          it._heat==="hot"?"bg-orange-100 text-orange-700":
                          it._heat==="warm"?"bg-amber-100 text-amber-700":"bg-neutral-100 text-neutral-600"
                        )} title={(it._reasons||[]).join(" · ")}>
                          {it._emoji} {it._heat.replace("_"," ")}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">{it.source||"—"}{it.publishedAt?` · ${fmtDate(it.publishedAt)}`:""}</div>
                  </div>

                  <a href={it.url} target="_blank" rel="noreferrer" className="block font-semibold leading-snug hover:underline">{it.title}</a>
                  {it.summary && <p className="text-sm text-neutral-600 line-clamp-3 mt-2">{it.summary}</p>}
                  {it.angles?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {it.angles.slice(0,4).map((a,idx)=>(
                        <span key={idx} className="text-[11px] bg-blue-50 rounded px-2 py-0.5 text-blue-700">{a}</span>
                      ))}
                    </div>
                  ):null}

                  <div className="mt-3 flex items-center gap-2">
                    <a href={it.url} target="_blank" rel="noreferrer"
                       className="px-3 py-1.5 rounded-md border border-neutral-300 text-sm hover:bg-neutral-50">Voir la source</a>
                    <button onClick={()=>setSelected(it)}
                            className={cls("px-3 py-1.5 rounded-md text-sm",
                              selected?.url===it.url?"bg-black text-white":"bg-neutral-900 text-white hover:opacity-90")}>
                      Utiliser cette actu
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* COLONNE DROITE : Affiner le prompt (version formulaire + aperçu + toggle image/vidéo) */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-neutral-200 p-4 bg-white">
            <div className="flex items-center gap-2 mb-3">
              <button
                className={cls("px-3 py-1.5 rounded-md text-sm",
                  media==="image"?"bg-black text-white":"bg-neutral-100 hover:bg-neutral-200")}
                onClick={()=>setMedia("image")}
              >Image</button>
              <button
                className={cls("px-3 py-1.5 rounded-md text-sm",
                  media==="video"?"bg-black text-white":"bg-neutral-100 hover:bg-neutral-200")}
                onClick={()=>setMedia("video")}
              >Vidéo</button>
            </div>

            <h3 className="font-semibold mb-3">Affiner le prompt</h3>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Audience (qui ?)</label>
                <input className="w-full rounded-md border px-3 py-2" value={audience} onChange={e=>setAudience(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Tonalité</label>
                <select className="w-full rounded-md border px-3 py-2" value={tone} onChange={e=>setTone(e.target.value)}>
                  {["Percutant","Inspirant","Educatif","Humoristique","Éditorial"].map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Objectif (conversion attendue)</label>
                <select className="w-full rounded-md border px-3 py-2" value={objective} onChange={e=>setObjective(e.target.value)}>
                  {["Booster les démos","Collecter des leads","Faire connaître la marque","Promouvoir une offre"].map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Accroche (hook en 1 phrase)</label>
                <input className="w-full rounded-md border px-3 py-2" value={hook} onChange={e=>setHook(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">CTA</label>
                <input className="w-full rounded-md border px-3 py-2" value={cta} onChange={e=>setCta(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Mots-clés marque / USP</label>
                <input className="w-full rounded-md border px-3 py-2" value={tags} onChange={e=>setTags(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Plateforme</label>
                  <select className="w-full rounded-md border px-3 py-2" value={platform} onChange={e=>setPlatform(e.target.value)}>
                    {["Instagram","TikTok","LinkedIn","Twitter/X","Facebook","YouTube"].map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Format</label>
                  <select className="w-full rounded-md border px-3 py-2" value={format} onChange={e=>setFormat(e.target.value)}>
                    {(media==="image"?IMAGE_FORMATS:VIDEO_FORMATS).map(f=><option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Aperçu du prompt</label>
                <textarea value={promptPreview} readOnly rows={7}
                          className="w-full rounded-md border px-3 py-2 text-sm whitespace-pre" />
              </div>
            </div>

            <div className="mt-4">
              <button disabled={!selected || loadingGen} onClick={onGenerate}
                      className={cls("px-4 py-2 rounded-md w-full",
                        selected?"bg-black text-white hover:opacity-90":"bg-neutral-200 text-neutral-500 cursor-not-allowed")}
                      title={selected?"":"Sélectionne une actu à gauche"}>
                {loadingGen ? "Génération…" : (media==="image"?"Générer l’image":"Générer la vidéo")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ZONE UPLOAD POINTILLÉE */}
      <div
        className={cls(
          "mt-8 rounded-xl border-2 border-dashed p-5 transition",
          dragOver ? "border-neutral-900 bg-neutral-50" : "border-neutral-300 hover:border-neutral-400"
        )}
        onDragOver={(e)=>{e.preventDefault(); setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={onDrop}
      >
        <h3 className="font-semibold mb-1">Sélectionner un logo / une photo pour guider l’IA</h3>
        <p className="text-sm text-neutral-600 mb-3">
          Optionnel. L’image sert d’inspiration (couleurs, style) lors de la génération.
        </p>

        <div className="flex items-center gap-4">
          <label className="inline-flex items-center cursor-pointer">
            <input type="file" accept="image/*" onChange={onReferenceChange} disabled={refUploading} className="hidden" />
            <span className="px-3 py-2 rounded-md bg-neutral-900 text-white text-sm hover:opacity-90">
              {refUploading ? "Envoi…" : "Choisir un fichier"}
            </span>
          </label>
          {refError && <span className="text-sm text-red-600">{refError}</span>}
          <span className="text-sm text-neutral-500">ou glissez-déposez ici</span>
        </div>

        {referenceUrl && (
          <div className="mt-3 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={referenceUrl} alt="" className="h-20 w-20 object-cover rounded-md border" />
            <button className="px-3 py-1.5 rounded-md border text-sm hover:bg-neutral-50" onClick={()=>setReferenceUrl("")}>
              Retirer
            </button>
            <a href={referenceUrl} target="_blank" rel="noreferrer" className="text-sm underline">Ouvrir</a>
          </div>
        )}
      </div>

      {/* MEDIA GÉNÉRÉ (image ou vidéo) */}
      <div className="mt-6 rounded-xl border-2 border-dashed border-neutral-300 p-5 hover:border-neutral-400 transition">
        <h3 className="font-semibold mb-3">Média généré</h3>

        {imgUrl || videoUrl ? (
          <>
            {videoUrl ? (
              <video src={videoUrl} controls className="w-full max-w-2xl rounded-lg border" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgUrl} alt="" className="w-full max-w-2xl rounded-lg border" />
            )}

            <label className="block text-sm mt-3 mb-1">Légende</label>
            <textarea className="w-full max-w-2xl rounded-md border px-3 py-2 text-sm"
                      rows={5} value={caption} onChange={e=>setCaption(e.target.value)} />
            <div className="mt-3 flex gap-2">
              <button onClick={onPublish} disabled={loadingPub}
                      className="px-3 py-1.5 rounded-md bg-black text-white hover:opacity-90">
                {loadingPub ? "Publication…" : "Publier (Make → Instagram)"}
              </button>
              {(imgUrl || videoUrl) && (
                <a href={videoUrl || imgUrl} target="_blank" rel="noreferrer"
                   className="px-3 py-1.5 rounded-md border border-neutral-300 text-sm hover:bg-neutral-50">
                  Ouvrir le fichier
                </a>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-neutral-500">Génère un média pour l’apercevoir ici.</p>
        )}
      </div>
    </div>
  );
}
