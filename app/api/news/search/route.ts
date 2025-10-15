export const runtime = "nodejs";

/** ================= Types & helpers ================ */
type Item = {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  imageUrl?: string;
  description?: string;
  _provider?: "gnews" | "newsdata";
  _score?: number;
};

type RawCache = {
  t: number; // timestamp du cache
  items: Item[]; // items bruts (concat de tous les providers, non filtrés par date/score, non limités)
  counts: { gnews: number; newsdata: number; newsapiai: number };
};

// cache mémoire (global, persiste tant que le process Next tourne)
const G: any = globalThis as any;
G.__keiroNewsCache = G.__keiroNewsCache || new Map<string, RawCache>();
const CACHE: Map<string, RawCache> = G.__keiroNewsCache;

/** Date helpers */
const sinceISO = (tf: string) => {
  const d = new Date();
  const p = (tf || "24h").toLowerCase();
  if (p === "24h") d.setHours(d.getHours() - 24);
  else if (p === "48h") d.setHours(d.getHours() - 48);
  else if (p === "7d" || p === "7j") d.setDate(d.getDate() - 7);
  else d.setHours(d.getHours() - 24);
  return d.toISOString();
};
const parseDate = (s?: string) => (s ? Date.parse(s) : NaN);
const domainFromUrl = (u?: string) => {
  try { return u ? new URL(u).hostname.replace(/^www\./, "").toLowerCase() : null; }
  catch { return null; }
};
const sourceKey = (it: Item) => domainFromUrl(it.url) || (it.source || "").toLowerCase().trim();
const onePerSource = (items: Item[]) => {
  const seen = new Set<string>(), out: Item[] = [];
  for (const it of items) { const k = sourceKey(it); if (!k || seen.has(k)) continue; seen.add(k); out.push(it); }
  return out;
};

/** ================= Providers ===================== */
async function fetchGNews(query: string, fromISO: string | null, max = 40): Promise<Item[]> {
  const key = process.env.GNEWS_KEY; if (!key) return [];
  try {
    const url = new URL("https://gnews.io/api/v4/search");
    url.searchParams.set("q", query);
    url.searchParams.set("lang", "fr");
    url.searchParams.set("max", String(max));
    if (fromISO) url.searchParams.set("from", fromISO);
    url.searchParams.set("token", key);
    const r = await fetch(url);
    if (!r.ok) return [];
    const j: any = await r.json().catch(() => ({}));
    return (j.articles || []).map((a: any) => ({
      title: a.title,
      url: a.url,
      source: a.source?.name,
      publishedAt: a.publishedAt || a.published_at,
      imageUrl: a.image,
      description: a.description,
      _provider: "gnews",
    }));
  } catch { return []; }
}

/** Newsdata: requête simple alignée sur ce qui marche côté /api/news/providers */
type NDResult = { items: Item[]; qTried: string };
async function fetchNewsdata(query: string, cat: string, size = 40): Promise<NDResult> {
  const key = process.env.NEWSDATA_KEY; if (!key) return { items: [], qTried: "" };

  const primaryByCat: Record<string, string> = {
    technology: "technology", business: "business", finance: "finance", sports: "sports",
    gaming: "gaming", culture: "entertainment", food: "food", lifestyle: "lifestyle",
    sante: "health", auto: "automotive", climat: "climate", immo: "real estate", world: "world"
  };
  const primary = primaryByCat[cat] || "world";

  const call = async (params: Record<string, string>): Promise<Item[]> => {
    try {
      const url = new URL("https://newsdata.io/api/1/news");
      url.searchParams.set("apikey", key);
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
      }
      if (!url.searchParams.has("language")) url.searchParams.set("language", "fr");
      const r = await fetch(url);
      if (!r.ok) return [];
      const j: any = await r.json().catch(() => ({}));
      return (j.results || []).slice(0, size).map((a: any) => ({
        title: a.title,
        url: a.link,
        source: a.source_id || a.source || (a.creator?.[0]),
        publishedAt: a.pubDate || a.pub_date,
        imageUrl: a.image_url,
        description: a.description || a.content,
        _provider: "newsdata",
      }));
    } catch { return []; }
  };

  // Essai 0: q=primary (style /providers)
  let qTried = primary;
  let items = await call({ q: primary });
  if (items.length) return { items, qTried };

  // Essai 1: query simplifiée
  const simple = query.replace(/\"|\(|\)|\+|-/g, " ").replace(/\bOR\b/gi, " ").replace(/\s+/g, " ").trim();
  qTried = simple;
  items = await call({ q: simple });
  if (items.length) return { items, qTried };

  // Essai 2: category=
  qTried = `category:${primary}`;
  items = await call({ category: primary });
  if (items.length) return { items, qTried };

  // Essai 3: élargi
  qTried = primary + " (no-country)";
  items = await call({ q: primary, country: "" });
  return { items, qTried };
}

/** Cat -> requêtes textuelles pour GNews */
const CAT_QUERY: Record<string, string> = {
  technology: '("intelligence artificielle" OR IA OR AI OR "Nvidia" OR "OpenAI" OR Google OR Meta OR xAI)',
  business: '(entreprise OR startup OR dirigeants OR "résultats trimestriels" OR partenariat OR acquisition OR levée OR investissement)',
  finance: '(bourse OR marchés OR obligations OR "banque centrale" OR inflation OR "taux" OR CAC OR Nasdaq OR S&P)',
  sports: '(match OR victoire OR transfert OR finale OR championnat OR entraîneur OR sélection)',
  gaming: '(jeu vidéo OR "mise à jour" OR patch OR studio OR éditeur OR PlayStation OR Xbox OR Nintendo OR Steam)',
  culture: '(cinéma OR série OR musique OR festival OR "bande-annonce" OR Netflix OR Disney+ OR "Prime Video")',
  food: '(restaurant OR livraison OR recette OR nutrition OR franchise OR menu OR chef)',
  lifestyle: '(voyage OR tourisme OR mode OR "bien-vivre" OR hôtel OR design)',
  sante: '(santé OR étude OR OMS OR traitement OR prévention OR hôpital OR clinique)',
  auto: '(voiture électrique OR Tesla OR batterie OR "bornes de recharge" OR constructeur)',
  climat: '(climat OR "énergies renouvelables" OR neutralité carbone OR COP OR solaire OR éolien)',
  immo: '(immobilier OR logement OR chantier OR promoteur OR bureau OR "prix au m²")',
  world: '(diplomatie OR accord OR conflit OR sanctions OR sommet OR OTAN OR ONU)',
};

/** ================= Handler ======================== */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const cat = (u.searchParams.get("cat") || "technology").toLowerCase();
  const timeframe = (u.searchParams.get("timeframe") || "24h").toLowerCase(); // "24h", "48h", "7d/7j"
  const limit = Math.max(1, Math.min(24, Number(u.searchParams.get("limit") || "12")));
  const debug = u.searchParams.get("debug") === "1";
  const prov = (u.searchParams.get("prov") || "all").toLowerCase(); // all | gnews | newsdata

  // TTL de cache
  const TTL = timeframe === "24h" ? 24 * 3600 * 1000 : 6 * 3600 * 1000; // 24h ou 6h
  const key = `${cat}:${timeframe}`; // on stocke brut, on slice/score après
  const now = Date.now();

  // 1) Cache: si dispo et frais, on repart de là
  let cached = CACHE.get(key);
  let rawItems: Item[] | null = null;
  let cG = 0, cN = 0, cA = 0;
  let cacheHeader = "MISS";

  if (cached && (now - cached.t) < TTL) {
    rawItems = cached.items;
    cG = cached.counts.gnews; cN = cached.counts.newsdata; cA = cached.counts.newsapiai;
    cacheHeader = "HIT";
  }

  // 2) Sinon, on appelle les providers
  let xDebugNewsdataQ = "";
  if (!rawItems) {
    const query = CAT_QUERY[cat] || cat;
    const fromISO = sinceISO(timeframe);

    let gnews: Item[] = [];
    let ndRes: NDResult = { items: [], qTried: "" };

    if (prov === "all" || prov === "gnews") {
      gnews = await fetchGNews(query, fromISO, 40).catch(() => []);
    }
    if (prov === "all" || prov === "newsdata") {
      ndRes = await fetchNewsdata(query, cat, 40).catch(() => ({ items: [], qTried: "" }));
    }
    xDebugNewsdataQ = ndRes.qTried || "";

    cG = gnews.length;
    cN = ndRes.items.length;

    rawItems = ([] as Item[]).concat(gnews, ndRes.items);

    // Stocker brut en cache
    CACHE.set(key, { t: now, items: rawItems, counts: { gnews: cG, newsdata: cN, newsapiai: cA } });
    cacheHeader = "MISS";
  }

  // 3) Post-filtre temporel (24h/48h/7j) APRES agrégation (indépendant des providers)
  const cutoff = parseDate(sinceISO(timeframe));
  const timeFiltered = rawItems!.filter(it => {
    const t = parseDate(it.publishedAt);
    return isNaN(cutoff) ? true : (!isNaN(t) ? t >= cutoff : true);
  });

  // 4) Dédup par source
  const deduped = onePerSource(timeFiltered);

  if (debug) {
    const body = {
      items: deduped.slice(0, limit),
      meta: {
        cat, minScore: 0, cached: cacheHeader === "HIT",
        providerCounts: { gnews: cG, newsdata: cN, newsapiai: cA },
        debug: true
      }
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-cache": cacheHeader,
        "x-cache-ttl-hours": (TTL / 3600000).toFixed(0),
        "x-prov-gnews": String(cG),
        "x-prov-newsdata": String(cN),
        "x-prov-newsapiai": String(cA),
        "x-debug-newsdata-q": xDebugNewsdataQ
      }
    });
  }

  // 5) Scoring doux + tri par date + slice
  const score = (t: string) => (t || "").length >= 20 ? 1.2 : 0.8;
  const minScore = Number(process.env.NEWS_MIN_SCORE || "1.2");
  const scored = deduped.map(it => ({ ...it, _score: score(it.title || "") }))
    .filter(it => (it._score || 0) >= minScore)
    .sort((a, b) => (Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || "")));
  const finalItems = scored.slice(0, limit).map(({ _score, ...rest }) => rest);

  const body = {
    items: finalItems,
    meta: {
      cat, minScore, cached: cacheHeader === "HIT",
      providerCounts: { gnews: cG, newsdata: cN, newsapiai: cA },
      debug: false
    }
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-cache": cacheHeader,
      "x-cache-ttl-hours": (TTL / 3600000).toFixed(0),
      "x-prov-gnews": String(cG),
      "x-prov-newsdata": String(cN),
      "x-prov-newsapiai": String(cA),
      "x-debug-newsdata-q": xDebugNewsdataQ
    }
  });
}
