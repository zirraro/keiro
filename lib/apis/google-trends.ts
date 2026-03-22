/**
 * Google Trends API integration
 * Uses the unofficial Google Trends API (no key needed)
 * Provides trending topics and interest over time for France
 *
 * Used by agents Oscar (SEO) and Lena (content) to inject
 * real-time trend data into their prompts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrendingSearch {
  title: string;
  formattedTraffic: string; // e.g. "200K+"
  relatedQueries: string[];
  articleTitles: string[];
  image?: string;
}

export interface InterestData {
  keyword: string;
  timeline: { date: string; value: number }[];
  averageInterest: number;
}

export interface RelatedQuery {
  query: string;
  value: number; // 0-100 or raw traffic
  type: "top" | "rising";
}

export interface BusinessTrend {
  keyword: string;
  interest: number;
  related: string[];
  category: string;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttl = CACHE_TTL_MS): void {
  // Prevent unbounded growth — evict oldest when the cache is large
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = "https://trends.google.com/trends/api";
const DEFAULT_GEO = "FR";
const DEFAULT_HL = "fr";
const TZ_OFFSET = -60; // France UTC+1

/**
 * Google Trends API returns a JSONP-like response prefixed with `)]}',\n`.
 * Strip that prefix before parsing.
 */
function parseGTResponse<T = unknown>(raw: string): T {
  const cleaned = raw.replace(/^\)\]\}',?\n/, "");
  return JSON.parse(cleaned) as T;
}

async function fetchGT(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<string> {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
    signal,
  });

  if (!res.ok) {
    throw new Error(`Google Trends ${path} responded ${res.status}`);
  }

  return res.text();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch today's trending searches for France.
 */
export async function getTrendingSearchesFR(): Promise<TrendingSearch[]> {
  const cacheKey = "trending-fr";
  const cached = getCached<TrendingSearch[]>(cacheKey);
  if (cached) return cached;

  try {
    const raw = await fetchGT("dailytrends", {
      hl: DEFAULT_HL,
      tz: String(TZ_OFFSET),
      geo: DEFAULT_GEO,
      ns: "15",
    });

    const json = parseGTResponse<{
      default: {
        trendingSearchesDays: {
          date: string;
          trendingSearches: {
            title: { query: string };
            formattedTraffic: string;
            relatedQueries: { query: string }[];
            articles: { title: string }[];
            image?: { imageUrl: string };
          }[];
        }[];
      };
    }>(raw);

    const days = json.default?.trendingSearchesDays ?? [];
    const results: TrendingSearch[] = [];

    for (const day of days) {
      for (const ts of day.trendingSearches) {
        results.push({
          title: ts.title.query,
          formattedTraffic: ts.formattedTraffic,
          relatedQueries: (ts.relatedQueries ?? []).map((r) => r.query),
          articleTitles: (ts.articles ?? []).map((a) => a.title),
          image: ts.image?.imageUrl,
        });
      }
    }

    setCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error("[google-trends] getTrendingSearchesFR error:", err);
    return [];
  }
}

/**
 * Fetch interest-over-time data for a set of keywords.
 *
 * Because the multiline widget endpoint requires a token obtained from
 * the /explore endpoint, we go through the explore flow first.
 */
export async function getInterestOverTime(
  keywords: string[],
  geo: string = DEFAULT_GEO
): Promise<InterestData[]> {
  if (keywords.length === 0) return [];

  const cacheKey = `iot:${keywords.sort().join(",")}:${geo}`;
  const cached = getCached<InterestData[]>(cacheKey);
  if (cached) return cached;

  try {
    // Step 1: call /explore to get the widget token
    const comparisonItem = keywords.map((kw) => ({
      keyword: kw,
      geo,
      time: "today 3-m",
    }));

    const reqPayload = {
      comparisonItem,
      category: 0,
      property: "",
    };

    const exploreRaw = await fetchGT("explore", {
      hl: DEFAULT_HL,
      tz: String(TZ_OFFSET),
      req: JSON.stringify(reqPayload),
    });

    const exploreJson = parseGTResponse<{
      widgets: {
        id: string;
        token: string;
        request: Record<string, unknown>;
      }[];
    }>(exploreRaw);

    const timelineWidget = exploreJson.widgets?.find(
      (w) => w.id === "TIMESERIES"
    );
    if (!timelineWidget) {
      console.warn("[google-trends] No TIMESERIES widget found");
      return [];
    }

    // Step 2: fetch the actual multiline data
    const multilineRaw = await fetchGT("widgetdata/multiline", {
      hl: DEFAULT_HL,
      tz: String(TZ_OFFSET),
      req: JSON.stringify(timelineWidget.request),
      token: timelineWidget.token,
    });

    const multilineJson = parseGTResponse<{
      default: {
        timelineData: {
          time: string;
          formattedTime: string;
          value: number[];
        }[];
      };
    }>(multilineRaw);

    const timelineData = multilineJson.default?.timelineData ?? [];
    const results: InterestData[] = keywords.map((kw, idx) => {
      const timeline = timelineData.map((point) => ({
        date: point.formattedTime,
        value: point.value[idx] ?? 0,
      }));
      const avg =
        timeline.length > 0
          ? Math.round(
              timeline.reduce((s, p) => s + p.value, 0) / timeline.length
            )
          : 0;
      return { keyword: kw, timeline, averageInterest: avg };
    });

    setCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error("[google-trends] getInterestOverTime error:", err);
    return [];
  }
}

/**
 * Fetch related queries for a single keyword.
 */
export async function getRelatedQueries(
  keyword: string,
  geo: string = DEFAULT_GEO
): Promise<RelatedQuery[]> {
  const cacheKey = `rq:${keyword}:${geo}`;
  const cached = getCached<RelatedQuery[]>(cacheKey);
  if (cached) return cached;

  try {
    const reqPayload = {
      comparisonItem: [{ keyword, geo, time: "today 3-m" }],
      category: 0,
      property: "",
    };

    const exploreRaw = await fetchGT("explore", {
      hl: DEFAULT_HL,
      tz: String(TZ_OFFSET),
      req: JSON.stringify(reqPayload),
    });

    const exploreJson = parseGTResponse<{
      widgets: {
        id: string;
        token: string;
        request: Record<string, unknown>;
      }[];
    }>(exploreRaw);

    const rqWidget = exploreJson.widgets?.find(
      (w) => w.id === "RELATED_QUERIES"
    );
    if (!rqWidget) return [];

    const rqRaw = await fetchGT("widgetdata/relatedsearches", {
      hl: DEFAULT_HL,
      tz: String(TZ_OFFSET),
      req: JSON.stringify(rqWidget.request),
      token: rqWidget.token,
    });

    const rqJson = parseGTResponse<{
      default: {
        rankedList: {
          rankedKeyword: {
            query: string;
            value: number;
            formattedValue: string;
          }[];
        }[];
      };
    }>(rqRaw);

    const rankedLists = rqJson.default?.rankedList ?? [];
    const results: RelatedQuery[] = [];

    rankedLists.forEach((list, listIdx) => {
      const type: "top" | "rising" = listIdx === 0 ? "top" : "rising";
      for (const item of list.rankedKeyword ?? []) {
        results.push({
          query: item.query,
          value: item.value,
          type,
        });
      }
    });

    setCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error("[google-trends] getRelatedQueries error:", err);
    return [];
  }
}

/**
 * Fetch trends relevant to a specific business type.
 * Maps business types to relevant Google Trends categories and keywords.
 */
export async function getTrendsForBusinessType(
  businessType: string
): Promise<BusinessTrend[]> {
  const cacheKey = `biz:${businessType.toLowerCase()}`;
  const cached = getCached<BusinessTrend[]>(cacheKey);
  if (cached) return cached;

  const businessKeywords: Record<string, string[]> = {
    restaurant: [
      "restaurant",
      "livraison repas",
      "brunch",
      "menu du jour",
      "food truck",
    ],
    boutique: [
      "shopping",
      "soldes",
      "mode",
      "tendance mode",
      "promo boutique",
    ],
    coach: [
      "coaching",
      "développement personnel",
      "formation en ligne",
      "bien-être",
      "coaching sportif",
    ],
    coiffeur: [
      "coiffure",
      "coupe cheveux",
      "coloration",
      "barbier",
      "tendance coiffure",
    ],
    caviste: [
      "vin",
      "cave à vin",
      "dégustation vin",
      "vin bio",
      "foire aux vins",
    ],
    fleuriste: [
      "fleurs",
      "bouquet",
      "livraison fleurs",
      "plantes",
      "fleuriste",
    ],
    immobilier: [
      "immobilier",
      "achat appartement",
      "location",
      "investissement locatif",
      "crédit immobilier",
    ],
    artisan: [
      "artisan",
      "rénovation",
      "travaux maison",
      "devis artisan",
      "dépannage",
    ],
  };

  const normalizedType = businessType.toLowerCase().trim();
  const keywords =
    businessKeywords[normalizedType] ??
    // Fallback: use the business type itself + generic terms
    [normalizedType, `${normalizedType} paris`, `meilleur ${normalizedType}`];

  // Fetch interest over time for up to 5 keywords (GT limit)
  const batch = keywords.slice(0, 5);
  const interestData = await getInterestOverTime(batch);

  // Also grab related queries for the primary keyword
  const related = await getRelatedQueries(batch[0]);

  const results: BusinessTrend[] = interestData.map((d) => ({
    keyword: d.keyword,
    interest: d.averageInterest,
    related: related
      .filter((r) => r.type === "rising")
      .slice(0, 5)
      .map((r) => r.query),
    category: normalizedType,
  }));

  setCache(cacheKey, results);
  return results;
}

// ---------------------------------------------------------------------------
// Prompt formatting
// ---------------------------------------------------------------------------

/**
 * Format trend data into a concise text block suitable for injection
 * into an agent prompt (Oscar / Lena).
 */
export function formatTrendsForPrompt(
  trends: TrendingSearch[] | BusinessTrend[],
  maxItems = 10
): string {
  if (!trends || trends.length === 0) {
    return "Aucune donnée de tendances disponible actuellement.";
  }

  const slice = trends.slice(0, maxItems);
  const lines: string[] = ["## Tendances Google (France)"];

  for (const item of slice) {
    if ("formattedTraffic" in item) {
      // TrendingSearch
      const ts = item as TrendingSearch;
      const related =
        ts.relatedQueries.length > 0
          ? ` (lié: ${ts.relatedQueries.slice(0, 3).join(", ")})`
          : "";
      lines.push(`- ${ts.title} — ${ts.formattedTraffic}${related}`);
    } else {
      // BusinessTrend
      const bt = item as BusinessTrend;
      const related =
        bt.related.length > 0
          ? ` | associé: ${bt.related.slice(0, 3).join(", ")}`
          : "";
      lines.push(`- ${bt.keyword} — intérêt: ${bt.interest}/100${related}`);
    }
  }

  return lines.join("\n");
}
