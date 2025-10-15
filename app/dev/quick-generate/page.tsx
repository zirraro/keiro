"use client";
import { useEffect, useState } from "react";
import PreviewPane from "@/components/PreviewPane";

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  return url.searchParams.get(name) ?? "";
}

export default function QuickGeneratePage() {
  const [title, setTitle] = useState("Bourse : le CAC 40 clôture en hausse");
  const [summary, setSummary] = useState("Hausse portée par le secteur bancaire et le luxe");
  const [topic, setTopic] = useState("business");

  const [brand, setBrand] = useState("");
  const [objective, setObjective] = useState("");
  const [tone, setTone] = useState("");
  const [constraints, setConstraints] = useState("");
  const [cta, setCta] = useState("");
  const [hashtags, setHashtags] = useState("");

  // Pré-remplit depuis l'URL si fournis
  useEffect(() => {
    const t = getParam("title");       if (t) setTitle(t);
    const s = getParam("summary");     if (s) setSummary(s);
    const tp = getParam("topic");      if (tp) setTopic(tp);

    const b = getParam("brand");       if (b) setBrand(b);
    const o = getParam("objective");   if (o) setObjective(o);
    const tn = getParam("tone");       if (tn) setTone(tn);
    const c  = getParam("constraints");if (c) setConstraints(c);
    const ca = getParam("cta");        if (ca) setCta(ca);
    const h  = getParam("hashtags");   if (h) setHashtags(h);
  }, []);

  const openSandbox = () => {
    const params = new URLSearchParams({
      title, summary, topic,
      brand, objective, tone, constraints, cta, hashtags,
    });
    window.open(`/dev/quick-generate?${params.toString()}`, "_blank");
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quick Generate</h1>
        <button
          onClick={openSandbox}
          className="rounded border px-3 py-1 text-sm hover:bg-neutral-50"
          title="Ouvrir la sandbox dans un nouvel onglet"
        >
          Ouvrir la sandbox
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Colonne gauche : champs */}
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm">Titre</label>
            <input className="w-full rounded border px-3 py-2" value={title} onChange={e=>setTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Résumé</label>
            <textarea className="w-full rounded border px-3 py-2" rows={4} value={summary} onChange={e=>setSummary(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Topic</label>
            <select className="w-full rounded border px-3 py-2" value={topic} onChange={e=>setTopic(e.target.value)}>
              <option value="business">business</option>
              <option value="technology">technology</option>
              <option value="science">science</option>
              <option value="world">world</option>
              <option value="health">health</option>
              <option value="sports">sports</option>
            </select>
          </div>

          <h2 className="pt-2 text-sm font-semibold">Assistant de prompt (facultatif)</h2>
          <input className="w-full rounded border px-3 py-2" placeholder="Marque" value={brand} onChange={e=>setBrand(e.target.value)} />
          <input className="w-full rounded border px-3 py-2" placeholder="Objectif" value={objective} onChange={e=>setObjective(e.target.value)} />
          <input className="w-full rounded border px-3 py-2" placeholder="Tonalité" value={tone} onChange={e=>setTone(e.target.value)} />
          <input className="w-full rounded border px-3 py-2" placeholder="Contraintes" value={constraints} onChange={e=>setConstraints(e.target.value)} />
          <input className="w-full rounded border px-3 py-2" placeholder="Call to action" value={cta} onChange={e=>setCta(e.target.value)} />
          <input className="w-full rounded border px-3 py-2" placeholder="Hashtags" value={hashtags} onChange={e=>setHashtags(e.target.value)} />
        </div>

        {/* Colonne droite : PreviewPane */}
        <div>
          <PreviewPane
            selectedNews={{ title, summary, topic }}
            brandPrompt={{ brand, objective, tone, constraints, cta, hashtags }}
          />
        </div>
      </div>
    </div>
  );
}
