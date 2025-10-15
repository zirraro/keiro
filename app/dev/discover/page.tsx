"use client";
import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  title: string;
  url: string;
  source?: string;
  topic?: string;
  snippet?: string;
  published?: string;
  thumbnailUrl?: string | null;
};

const TF_OPTIONS = [
  { key: "24h", label: "24H" },
  { key: "48h", label: "48H" },
  { key: "72h", label: "72H" },
  { key: "7d",  label: "7J"  },
];

function clsx(...a: Array<string | false | undefined>) {
  return a.filter(Boolean).join(" ");
}

function Card({ it, onClick }: { it: Item; onClick?: () => void }) {
  const badThumb = !it.thumbnailUrl || /news\.google|encrypted\-tbn/i.test(it.thumbnailUrl || "");
  const src = !badThumb ? it.thumbnailUrl! : (it.url ? `/api/og?url=${encodeURIComponent(it.url)}` : "");
  return (
    <article
      onClick={onClick}
      className="cursor-pointer rounded-lg border bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="relative h-40 w-full overflow-hidden rounded-t-lg bg-neutral-100">
        {src ? (
          <img src={src} alt={it.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
            Aperçu indisponible
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
          <span className="truncate">{it.source || "—"}</span>
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px]">{it.topic || "—"}</span>
        </div>
        <h3 className="line-clamp-3 text-sm font-medium">{it.title}</h3>
        <div className="mt-3 flex items-center justify-between">
          <a href={it.url} target="_blank" rel="noreferrer" className="text-xs text-neutral-600 underline hover:text-black">
            Voir la source
          </a>
          <span className="text-[11px] text-neutral-500">Cliquer pour sélectionner</span>
        </div>
      </div>
    </article>
  );
}

export default function DiscoverPage() {
  const [cats, setCats] = useState<{key:string;label:string}[]>([]);
  const [cat, setCat]   = useState<string>("technology");
  const [tf, setTf]     = useState<string>("24h");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(9);
  const [sel, setSel] = useState<Item | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const r = await fetch("/api/news/categories", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (Array.isArray(j?.categories) && j.categories.length) {
          setCats(j.categories);
          if (!j.categories.find((x:any)=>x.key===cat)) setCat(j.categories[0].key);
        } else {
          setCats([
            { key: "technology",  label: "Technologie" },
            { key: "science",     label: "Science" },
            { key: "world",       label: "Monde" },
            { key: "business",    label: "Économie" },
            { key: "sports",      label: "Sport" },
            { key: "gaming",      label: "Gaming" },
            { key: "restauration",label: "Restauration" },
            { key: "health",      label: "Santé" },
            { key: "environment", label: "Environnement" },
            { key: "architecture",label: "Architecture" },
            { key: "arts",        label: "Arts & Culture" },
            { key: "mobility",    label: "Mobilité" },
            { key: "energy",      label: "Énergie" },
            { key: "fashion",     label: "Mode & Luxe" },
            { key: "startups",    label: "Startups" },
          ]);
        }
      } catch {}
    };
    run();
  }, []);

  const query = useMemo(() => {
    const u = new URLSearchParams();
    u.set("cat", cat);
    u.set("timeframe", tf);
    u.set("limit", "30");
    return u.toString();
  }, [cat, tf]);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    setVisible(9);
    setSel(null);
    (async () => {
      try {
        const r = await fetch(`/api/news/search?${query}`, { cache: "no-store" });
        const j = await r.json().catch(()=> ({}));
        const arr = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
        if (!abort) setItems(arr);
      } catch {
        if (!abort) setItems([]);
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => { abort = true; };
  }, [query]);

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <h1 className="mb-4 text-2xl font-semibold">Explorateur d’actus (sandbox)</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={cat}
          onChange={(e)=>setCat(e.target.value)}
          className="h-10 rounded-md border px-3 text-sm"
          aria-label="Catégorie"
        >
          {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>

        <select
          value={tf}
          onChange={(e)=>setTf(e.target.value)}
          className="h-10 rounded-md border px-3 text-sm"
          aria-label="Temporalité"
        >
          {TF_OPTIONS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="rounded-md border p-6 text-sm text-neutral-600">Chargement…</div>
      ) : items.length === 0 ? (
        <div className="rounded-md border p-6 text-sm text-neutral-600">
          Aucune actualité trouvée pour cette catégorie / période (même après fallback).
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.slice(0, visible).map(it => (
              <Card key={it.id || it.url} it={it} onClick={()=>setSel(it)} />
            ))}
          </div>

          {visible < items.length && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisible(v => Math.min(v + 3, items.length))}
                className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-neutral-100"
              >
                + 3 actus
              </button>
            </div>
          )}
        </>
      )}

      {sel && (
        <div className="mt-6 rounded-lg border bg-white p-4">
          <div className="mb-2 text-sm font-medium">Sélection</div>
          <div className="text-sm">{sel.title}</div>
          <div className="text-xs text-neutral-500">{sel.source || "—"} — {sel.url}</div>
        </div>
      )}
    </div>
  );
}
