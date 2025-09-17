"use client";

import { useEffect, useMemo, useState } from "react";

type Heat = "very_hot" | "hot" | "warm" | "watch";
type Item = {
  id?: string;
  source?: string;
  title?: string;
  url?: string;
  summary?: string;
  image?: string;
  publishedAt?: string;
  angles?: string[];
  _socialScore?: number;
  _heat?: Heat;
  _emoji?: string;
  _reasons?: string[];
};

function classNames(...a: (string|false|undefined)[]) {
  return a.filter(Boolean).join(" ");
}

const WINDOWS = [
  { label: "24h", hours: 24 },
  { label: "48h", hours: 48 },
  { label: "72h", hours: 72 },
  { label: "7j",  hours: 168 },
];

export default function TrendyPage() {
  const [hours, setHours] = useState<number>(48);
  const [strict, setStrict] = useState<boolean>(false);
  const [tab, setTab] = useState<"trending" | "gems">("trending");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ trending: Item[]; hiddenGems: Item[]; minScore: number }|null>(null);

  const items: Item[] = useMemo(() => {
    if (!data) return [];
    return tab === "trending" ? data.trending : data.hiddenGems;
  }, [data, tab]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/news/social?hours=${hours}&strict=${strict ? 1 : 0}`, { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "API error");
      setData({ trending: j.trending || [], hiddenGems: j.hiddenGems || [], minScore: j.minScore });
    } catch (e: any) {
      setError(e?.message || "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [hours, strict]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">🔥 Sélection sociale (Trendy / Hidden Gems)</h1>
        <a className="text-sm underline opacity-70 hover:opacity-100" href="/generate">→ Générer</a>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <span className="text-sm text-neutral-500">Fenêtre</span>
        {WINDOWS.map(w => (
          <button
            key={w.hours}
            onClick={() => setHours(w.hours)}
            className={classNames(
              "px-3 py-1 rounded-md border text-sm",
              hours === w.hours ? "bg-black text-white border-black" : "bg-white hover:bg-neutral-100 border-neutral-300"
            )}
          >
            {w.label}
          </button>
        ))}

        <div className="mx-2 h-5 w-px bg-neutral-200" />

        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={strict} onChange={e => setStrict(e.target.checked)} />
          Mode strict (plus sélectif)
        </label>

        <div className="flex-1" />

        {/* Tabs */}
        <div className="flex items-center gap-2">
          <button
            className={classNames(
              "px-3 py-1 rounded-md text-sm",
              tab === "trending" ? "bg-black text-white" : "bg-neutral-100 hover:bg-neutral-200"
            )}
            onClick={() => setTab("trending")}
          >
            Trending
          </button>
          <button
            className={classNames(
              "px-3 py-1 rounded-md text-sm",
              tab === "gems" ? "bg-black text-white" : "bg-neutral-100 hover:bg-neutral-200"
            )}
            onClick={() => setTab("gems")}
          >
            Hidden Gems
          </button>
        </div>
      </div>

      {/* Barre d’état */}
      <div className="text-sm text-neutral-500 mb-3">
        {loading ? "Chargement…" :
          error ? <span className="text-red-600">Erreur: {error}</span> :
          data ? (
            <>
              {tab === "trending" ? (data.trending?.length || 0) : (data.hiddenGems?.length || 0)} résultats ·
              &nbsp;minScore: {data.minScore?.toFixed(2)}
            </>
          ) : null}
      </div>

      {/* Grille */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((it, idx) => (
          <article key={(it.id || it.url || idx) as any}
                   className="rounded-xl border border-neutral-200 bg-white overflow-hidden hover:shadow-md transition">
            {it.image && (
              <a href={it.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.image} alt="" className="w-full h-44 object-cover" />
              </a>
            )}

            <div className="p-4">
              {/* Header ligne 1: heat badge + source/date */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={classNames(
                      "px-2 py-0.5 rounded-full text-xs font-medium",
                      it._heat === "very_hot" ? "bg-red-100 text-red-700" :
                      it._heat === "hot"      ? "bg-orange-100 text-orange-700" :
                      it._heat === "warm"     ? "bg-amber-100 text-amber-700" :
                                                "bg-neutral-100 text-neutral-600"
                    )}
                    title={(it._reasons || []).join(" · ")}
                  >
                    {it._emoji} {it._heat?.replace("_", " ")}
                  </span>

                  {typeof it._socialScore === "number" && (
                    <span className="text-xs text-neutral-500">score {(it._socialScore*100).toFixed(0)}%</span>
                  )}
                </div>

                <div className="text-xs text-neutral-500">
                  {it.source || "—"}{it.publishedAt ? ` · ${new Date(it.publishedAt).toLocaleString()}` : ""}
                </div>
              </div>

              {/* Titre */}
              <a href={it.url} target="_blank" rel="noreferrer"
                 className="block font-semibold leading-snug hover:underline">
                {it.title}
              </a>

              {/* Reasons (condensé) */}
              {it._reasons?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {it._reasons.slice(0, 3).map((r, i) => (
                    <span key={i} className="text-[11px] bg-neutral-100 rounded px-2 py-0.5 text-neutral-700">{r}</span>
                  ))}
                </div>
              ) : null}

              {/* Angles (si présents) */}
              {it.angles?.length ? (
                <div className="mt-3 flex flex-wrap gap-1">
                  {it.angles.slice(0, 4).map((a, i) => (
                    <span key={i} className="text-[11px] bg-blue-50 rounded px-2 py-0.5 text-blue-700">{a}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {!loading && !error && items.length === 0 && (
        <div className="text-sm text-neutral-500 mt-8">Aucune actu avec ces critères.</div>
      )}
    </div>
  );
}
