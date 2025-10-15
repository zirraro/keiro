"use client";
import InlinePreview from "@/components/InlinePreview";
import { useEffect, useMemo, useState } from "react";
import ToolbarControls from "@/components/ToolbarControls";

type NewsItem = {
  id: string;
  title: string;
  url: string;
  source?: string;
  snippet?: string;
  published?: string;
  thumbnailUrl?: string | null;
  hot?: boolean;
  score?: number;
  topic?: string;
};

const TOPICS: { key: string; label: string }[] = [
  { key: "business", label: "business" },
  { key: "technology", label: "technology" },
  { key: "science", label: "science" },
  { key: "world", label: "world" },
  { key: "health", label: "health" },
  { key: "sports", label: "sports" },
];

// --- Filtrage simple par mots-clés pour certains topics ---
const TOPIC_KEYWORDS: Record<string, string[]> = {
  sports: [
    "sport","match","football","foot","rugby","tennis","basket","nba","f1","formule 1","grand prix",
    "ligue","champions","psg","om","ol","real","barça","cycl","tour","marathon","stade","handball","golf","volley"
  ],
  health: [
    "santé","hôpital","hopital","clinique","médecin","patients","maladie","virus","covid","grippe","vaccin",
    "oms","urgence","soins","cancer","cardio","diabète","sida","choléra","pharmacie","médicament","antibiotique"
  ],
};

function filterByTopic(items: NewsItem[], topic: string): NewsItem[] {
  const kw = TOPIC_KEYWORDS[topic];
  if (!kw) return items; // pas de filtre pour les autres topics

  const score = (s?: string) => {
    if (!s) return 0;
    const txt = s.toLowerCase();
    return kw.reduce((n, k) => n + (txt.includes(k) ? 1 : 0), 0);
  };

  const filtered = items.filter(it =>
    score(it.title) + score(it.snippet) + score(it.source) + score(it.url) > 0
  );

  // si le filtre laisse très peu de résultats, on garde la liste brute
  return filtered.length >= Math.min(6, items.length) ? filtered : items;
}


const TF_OPTS = [
  { key: "24h", label: "24H" },
  { key: "48h", label: "48H" },
  { key: "72h", label: "72H" },
  { key: "7d", label: "7J" },
];

function clsx(...arr: Array<string | false | undefined>) {
  return arr.filter(Boolean).join(" ");
}

function extractPreviewUrl(json: any): { url?: string; kind?: "image" | "video" } {
  const cand =
    json?.url ||
    json?.image_url ||
    json?.video_url ||
    json?.image ||
    json?.video ||
    (Array.isArray(json?.output) ? json.output[0] : undefined);

  let kind: "image" | "video" | undefined;
  if (typeof cand === "string") {
    kind = /\.(mp4|webm|mov)(\?|$)/i.test(cand) ? "video" : "image";
    return { url: cand, kind };
  }
  return {};
}

// ---- Fallback helpers ----
const FALLBACKS: Record<string, string[]> = {
  sports: ["sport", "world"],
  health: ["science", "world"],
};

async function fetchNewsOnce(topic: string, timeframe: string, q: string, limit: number) {
  const u = new URLSearchParams();
  if (topic) u.set("topic", topic);
  if (timeframe) u.set("timeframe", timeframe);
  if (q) u.set("q", q);
  u.set("limit", String(Math.max(limit, 9)));
  const res = await fetch(`/api/news?${u.toString()}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return Array.isArray(json?.items) ? (json.items as any[]) : [];
}

async function fetchNewsSmart(topic: string, timeframe: string, q: string, limit: number) {
  // 1) paramètres demandés
  let items = await fetchNewsOnce(topic, timeframe, q, limit);
  if (items.length > 0) return items;

  // 2) timeframe large
  if (timeframe != "7d") {
    items = await fetchNewsOnce(topic, "7d", q, limit);
    if (items.length > 0) return items;
  }

  // 3) synonymes/fallback topics
  for (const alt of (FALLBACKS[topic] || [])) {
    items = await fetchNewsOnce(alt, "24h", q, limit);
    if (items.length > 0) return items;
    items = await fetchNewsOnce(alt, "7d", q, limit);
    if (items.length > 0) return items;
  }

  // 4) dernier recours
  if (topic !== "world") {
    items = await fetchNewsOnce("world", "7d", q, limit);
    if (items.length > 0) return items;
  }
  return [];
}

export default function GeneratePage() {
  const [activeTopic, setActiveTopic] = useState(TOPICS[0].key);
  const [timeframe, setTimeframe] = useState("24h");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [limit, setLimit] = useState(9);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Panneau de droite (assistant de prompt)
  const [brand, setBrand] = useState("");
  const [goal, setGoal] = useState("");
  const [tone, setTone] = useState("");
  const [constraints, setConstraints] = useState("");
  const [cta, setCta] = useState("");
  const [hashtags, setHashtags] = useState("#AI #Marketing #Keiro");

  // Génération & aperçu
  const [busyImg, setBusyImg] = useState(false);
  const [busyVid, setBusyVid] = useState(false);
  const [status, setStatus] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewKind, setPreviewKind] = useState<"image"|"video"|"">("");

const [progress, setProgress] = useState(0);
  const selectedArticle = useMemo(
    () => items.find((x) => x.id === selectedId) || null,
    [items, selectedId]
  );

    const API_LIMIT = 60;
  const fetchQS = useMemo(() => {
    const u = new URLSearchParams();
    if (activeTopic) u.set("topic", activeTopic);
    if (timeframe) u.set("timeframe", timeframe);
    if (q) u.set("q", q);
    u.set("limit", String(API_LIMIT));
    return u.toString();
  }, [activeTopic, timeframe, q]);
useEffect(() => {
    let abort = false;
    async function run() {
      setLoading(true);
      try {
        const smartItems = await fetchNewsSmart(activeTopic, timeframe, q, Math.max(limit, 9));
        if (!abort) setItems(smartItems as NewsItem[]);
      } catch {
        if (!abort) setItems([]);
      } finally {
        if (!abort) setLoading(false);
      }
    }
    run();

  return () => { abort = true; };
  // Hook: auto-remplir 'news' si absent lors du POST /api/generate
  // @ts-ignore
  const __selectedForGen = (typeof selectedItem !== "undefined" && selectedItem) ? selectedItem :
    (typeof current !== "undefined" && current ? current : null);
  }, [fetchQS]);

  const promptPreview = useMemo(() => {
    const first = selectedArticle || items[0];
    const title = first?.title ? `Sujet: ${first.title}` : "Sujet: (sélection à venir)";
    const sourceLine = first?.source ? `Source: ${first.source} — ${first.url}` : first?.url ? `Source: ${first.url}` : "Source: —";
    return [
      `Marque: ${brand || "—"}`,
      `Objectif: ${goal || "—"}`,
      `Tonalité: ${tone || "—"}`,
      `Contraintes: ${constraints || "—"}`,
      `CTA: ${cta || "—"}`,
      `Hashtags: ${hashtags || "—"}`,
      title,
      sourceLine,
      `Plateforme: Instagram | Format: Portrait (1080x1350)`,
      `Sortie attendue: visuel social percutant (ou story vidéo), prêt à poster.`
    ].join("\n");
  }, [brand, goal, tone, constraints, cta, hashtags, items, selectedArticle]);

  async function handleGenerate(kind: "image" | "video") {
    const url = kind === "image" ? "/api/generate" : "/api/generate-video";
    const setter = kind === "image" ? setBusyImg : setBusyVid;
    setter(true);
    setStatus("");
    setProgress(0);
    setProgress(0);
    if (kind === "image") setPreviewKind("image"); else setPreviewKind("video");
    setPreviewUrl("");

    try {
      const used = selectedArticle || (items && items[0]) || null;
const payload = {
        kind,
        prompt: promptPreview,
        brand, goal, tone, constraints, cta, hashtags,
        news: selectedArticle
          ? { title: selectedArticle.title, summary: selectedArticle.snippet ?? "", topic: activeTopic, url: selectedArticle.url }
          : undefined,
        article: selectedArticle
          ? { title: selectedArticle.title, url: selectedArticle.url, source: selectedArticle.source }
          : undefined,
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(json?.error || "Erreur lors de la génération.");
        return;
      }

      const out = extractPreviewUrl(json);
      if (out.url) {
        setPreviewUrl(out.url);
        if (out.kind) setPreviewKind(out.kind);
        setStatus("Génération terminée.");
      } else if (json?.jobId) {
        const jid = json.jobId;
        setStatus(`Tâche en cours #${jid}…`);
        try {
          const maxTicks = 120; // ~4 min max
          for (let i = 0; i < maxTicks; i++) {
            // progression visuelle (bloquée à 95% en attendant la fin)
            setProgress(Math.min(95, Math.round(((i + 1) / maxTicks) * 95)));
            await new Promise(r => setTimeout(r, 2000));
            const sr = await fetch(`/api/generate/status?jobId=${jid}`, { cache: "no-store" });
            const sj = await sr.json().catch(() => null);
            if (sj?.status === "done") {
              const url = `/api/preview?jobId=${jid}&t=${Date.now()}`;
              setPreviewUrl(url);
              setProgress(100);
              setStatus("Génération terminée.");
              break;
            }
            if (sj?.status === "error") {
              setStatus(sj.error || "Erreur de génération.");
              setProgress(0);
              break;
            }
          }
        } catch (e) {
          setStatus(String(e?.message || e) || "Erreur pendant le polling.");
          setProgress(0);
        }
      } else {
        setStatus("Génération demandée. (Pas de lien direct renvoyé)");
      }
    } catch (e: any) {
      setStatus(String(e?.message || e) || "Erreur inconnue.");
    } finally {
      setter(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      {/* barre sujets + filtres */}
      <ToolbarControls activeTopic={activeTopic} timeframe={timeframe} q={q} onTopic={(v)=>{ setActiveTopic(v); setLimit(9); setSelectedId(null);} } onTime={(v)=>{ setTimeframe(v); setLimit(9); setSelectedId(null);} } onSearch={(v)=> setQ(v)} onFilter={()=>{ setLimit(9); setSelectedId(null);} } />
<div className="hidden flex flex-wrap items-center gap-2">
        {/* Sélecteurs compacts */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-neutral-600">Catégorie</label>
          <select
            value={activeTopic}
            onChange={(e)=>{ setActiveTopic(e.target.value); setLimit(9); setSelectedId(null); }}
            className="h-9 rounded-md border px-2 text-sm bg-white"
          >
            {false && TOPICS.map(t => (<option key={t.key} value={t.key}>{t.label}</option>))}
          </select>

          <label className="ml-4 text-sm text-neutral-600">Période</label>
          <select
            value={timeframe}
            onChange={(e)=>{ setTimeframe(e.target.value); setLimit(9); setSelectedId(null); }}
            className="h-9 rounded-md border px-2 text-sm bg-white"
          >
            {false && TF_OPTS.map(tf => (<option key={tf.key} value={tf.key}>{tf.label}</option>))}
          </select>
        </div>
        {false && TOPICS.map(t => (
          <button
            key={t.key}
            onClick={() => { setActiveTopic(t.key); setLimit(9); setSelectedId(null); }}
            className={clsx(
              "rounded-full px-3 py-1 text-sm border",
              activeTopic === t.key ? "bg-black text-white border-black" : "bg-white hover:bg-neutral-100"
            )}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-2 flex items-center gap-2">
          {false && TF_OPTS.map(tf => (
            <button
              key={tf.key}
              onClick={() => { setTimeframe(tf.key); setLimit(9); setSelectedId(null); }}
              className={clsx(
                "rounded-full px-3 py-1 text-sm border",
                timeframe === tf.key ? "bg-black text-white border-black" : "bg-white hover:bg-neutral-100"
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>
        <div className="ml-2 flex items-center gap-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Rechercher une actu…"
            className="h-9 w-64 rounded-md border px-3 text-sm"
          />
          <button
            onClick={() => { setLimit(9); setSelectedId(null); }}
            className="h-9 rounded-md border px-3 text-sm bg-white hover:bg-neutral-100"
          >
            Filtrer
          </button>
        </div>
      </div>

      {/* grille + panneau de droite */}
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Cartes actu */}
        <div className="lg:col-span-7 xl:col-span-7">
          {loading ? (
            <div className="rounded-md border p-8 text-sm text-neutral-500">Chargement…</div>
          ) : items.length === 0 ? (
            <div className="rounded-md border p-8 text-sm text-neutral-500">
              Aucune actualité trouvée.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {items.slice(0, limit).map((it) => {
                  const selected = selectedId === it.id;
                  return (
                    <article
                      key={it.id}
                      className={clsx(
                        "rounded-lg border bg-white shadow-sm transition hover:shadow-md",
                        selected && "ring-2 ring-black"
                      )}
                    >
                      {/* image */}
                      <div className="relative h-40 w-full overflow-hidden rounded-t-lg bg-neutral-100">
                        <CardImage item={it} />
                      </div>

                      <div className="p-4">
                        <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
                          <span className="truncate">{it.source || "—"}</span>
                          <span className="inline-flex items-center gap-1">
                            {typeof it.score === "number" && (
                              <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px]">{it.score}</span>
                            )}
                            {it.hot && (
                              <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] text-rose-700">hot</span>
                            )}
                          </span>
                        </div>

                        <h3 className="mb-2 line-clamp-3 text-sm font-medium">
                          {it.title || "Sans titre"}
                        </h3>

                        {it.snippet && (
                          <p className="mb-3 line-clamp-3 text-xs text-neutral-600">
                            {it.snippet}
                          </p>
                        )}

                        <div className="mt-3 flex items-center justify-between">
                          <a
                            href={it.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-neutral-600 underline hover:text-black"
                          >
                            Voir la source
                          </a>

                          <button
                            onClick={() => setSelectedId(it.id)}
                            className={clsx(
                              "rounded-md px-3 py-1 text-xs",
                              selected ? "bg-black text-white" : "bg-neutral-900 text-white hover:bg-neutral-800"
                            )}
                          >
                            {selected ? "Sélectionnée" : "Utiliser cette actu"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {limit < items.length && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => setLimit(l => Math.min(l + 3, items.length))}
                    className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-neutral-100"
                  >
                    + Afficher 3 actus de plus
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Panneau de droite */}
        <aside className="lg:col-span-5 xl:col-span-5">
          <div className="sticky top-4 space-y-4">
            <div className="rounded-lg border bg-white p-4">
              <h4 className="mb-3 font-medium">Sélectionner un logo</h4>
              <input type="file" className="text-sm" />
            </div>

            <div className="rounded-lg border bg-white p-4">
              <h4 className="mb-3 font-medium">Assistant de prompt</h4>

              {selectedArticle ? (
                <div className="mb-3 rounded-md border bg-neutral-50 p-3 text-xs text-neutral-600">
                  <div className="mb-1 font-medium text-neutral-800">Actualité sélectionnée</div>
                  <div className="line-clamp-2">{selectedArticle.title}</div>
                  <div className="mt-1 truncate opacity-70">{selectedArticle.source || "—"} — {selectedArticle.url}</div>
                </div>
              ) : (
                <div className="mb-3 rounded-md border bg-neutral-50 p-3 text-xs text-neutral-600">
                  Aucune actualité sélectionnée — vous pouvez générer sans, mais la sortie sera plus générique.
                </div>
              )}

              <div className="space-y-2">
                <input
                  placeholder="Marque / Produit"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={brand}
                  onChange={e => setBrand(e.target.value)}
                />
                <textarea
                  placeholder="Objectif (ex: trafic, conversion…) "
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  rows={3}
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                />
                <input
                  placeholder="Tonalité / Style"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={tone}
                  onChange={e => setTone(e.target.value)}
                />
                <input
                  placeholder="Couleurs / Contraintes"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={constraints}
                  onChange={e => setConstraints(e.target.value)}
                />
                <input
                  placeholder="Call to Action"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={cta}
                  onChange={e => setCta(e.target.value)}
                />
                <input
                  placeholder="Hashtags"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={hashtags}
                  onChange={e => setHashtags(e.target.value)}
                />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => handleGenerate("image")}
                  disabled={busyImg}
                  className="rounded-md bg-black px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {busyImg ? "Génération…" : "Générer une image"}
                </button>
                <button
                  onClick={() => handleGenerate("video")}
                  disabled={busyVid}
                  className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50"
                >
                  {busyVid ? "Génération…" : "Générer une vidéo"}
                </button>
              </div>

              {(busyImg || busyVid) && progress > 0 ? (
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded bg-neutral-200">
                    <div
                      className="h-2 bg-black transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-600">
                    {progress}% • génération en cours…
                  </div>
                </div>
              ) : status && (
                <div className="mt-3 rounded-md border bg-neutral-50 p-2 text-xs text-neutral-700 break-all">
                  {status}
                </div>
              )}
            </div>

            {/* APERCU DU RENDU */}
            <div className="rounded-lg border bg-white p-4">
              <h4 className="mb-3 font-medium">Aperçu du rendu</h4>
              {!previewUrl ? (
                <div className="flex h-64 items-center justify-center rounded-md bg-neutral-50 text-xs text-neutral-500">
                  <InlinePreview selectedNews={selectedArticle} />
                </div>
              ) : previewKind === "video" ? (
                <video
                  className="h-64 w-full rounded-md border bg-black"
                  src={previewUrl}
                  controls
                  playsInline
                />
              ) : (
                <img
                  className="h-64 w-full rounded-md border object-cover"
                  src={previewUrl}
                  alt="aperçu génération"
                  loading="lazy"
                />
              )}
              {previewUrl && (
                <div className="mt-2 text-right">
                  <a href={previewUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                    Ouvrir l’asset
                  </a>
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-white p-4">
              <h4 className="mb-2 font-medium">Prompt final</h4>
              <textarea
                className="h-64 w-full rounded-md border px-3 py-2 text-sm"
                value={promptPreview}
                readOnly
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Image de carte robuste (sans next/image pour éviter les whitelists) */
function CardImage({ item }: { item: NewsItem }) {
  const [err, setErr] = useState(false);

  const isBadThumb = useMemo(() => {
    const h = (item.thumbnailUrl || "").toLowerCase();
    if (!h) return true;
    if (h.includes("news.google") || h.includes("encrypted-tbn")) return true;
    return false;
  }, [item.thumbnailUrl]);

  const src =
    !err && !isBadThumb && item.thumbnailUrl
      ? item.thumbnailUrl!
      : !err && item.url
      ? `/api/og?url=${encodeURIComponent(item.url)}`
      : "";

  if (!src || err) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 text-[11px] text-neutral-500">
        Aperçu indisponible
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={item.title || "aperçu"}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setErr(true)}
    />
  );
}
