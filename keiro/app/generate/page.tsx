"use client";

import { useEffect, useState } from "react";
import { NewsCard } from "@/components/news-card";
import type { NewsItem } from "@/components/news-card";
import { PromptSidebar } from "@/components/prompt-sidebar";
import { TopFilters } from "@/components/top-filters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function GeneratePage() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string | undefined>(undefined);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (query) p.set("q", query);
      if (topic) p.set("topic", topic);
      const r = await fetch(`/api/news?${p.toString()}`, { cache: "no-store" });
      const d = await r.json();
      setNews(Array.isArray(d.items) ? d.items : []);
    } catch {
      setNews([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [query, topic]);

  return (
    <div className="mx-auto w-full max-w-[1180px] p-4">
      {/* entête */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] text-gray-600">Choose the actualité la plus trendy</div>
        <div className="flex items-center gap-2">
          <Input placeholder="Rechercher une actu…" value={query} onChange={(e)=>setQuery(e.target.value)} className="h-8 w-56 text-[12px]" />
          <Button variant="secondary" className="h-8 text-[12px]" onClick={load}>Filtrer</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* colonne cartes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <TopFilters topic={topic} setTopic={setTopic} />
          </div>

          {/* grille cartes 3 colonnes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {loading && Array.from({length:9}).map((_,i)=>(
              <div key={i} className="h-[320px] rounded-[10px] border bg-gray-100 animate-pulse" />
            ))}
            {!loading && news.map((item)=>(
              <NewsCard key={item.id} item={item} onUse={()=>{}} />
            ))}
            {!loading && news.length===0 && (
              <div className="col-span-full text-[12px] text-gray-500">Aucune actualité trouvée.</div>
            )}
          </div>

          {/* encart en pointillés */}
          <div className="mt-4 dashed p-3 text-[12px] text-gray-600">
            <span>Sélectionne un <b>logo</b> | <b>ton</b> | <b>phrase</b> par gabarit IA.</span>
            <a className="ml-2 text-blue-600 hover:underline" href="#">Choisir un filtre</a>
            <span> · </span>
            <a className="text-blue-600 hover:underline" href="#">gabarits disponibles</a>
          </div>
        </div>

        {/* panneau droite */}
        <aside className="rounded-[10px] border p-3">
          <PromptSidebar />
        </aside>
      </div>

      {/* zone idée globale */}
      <div className="mt-4">
        <div className="text-[12px] font-medium mb-2">Idée globale</div>
        <div className="min-h-[380px] rounded-[10px] border bg-gray-50 p-3 text-[12px] text-gray-700">
          (Dépose ici les grandes lignes générées ou manuelles…)
        </div>
      </div>
    </div>
  );
}
