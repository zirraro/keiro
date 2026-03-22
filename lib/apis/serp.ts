/**
 * SERP API integration for SEO analysis
 * Uses SerpAPI (serpapi.com) when SERPAPI_KEY is set.
 * Falls back to Google Suggest API for keyword suggestions otherwise.
 *
 * Used by agent Oscar (SEO) to check rankings, analyse local competition,
 * and generate keyword recommendations.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RankingResult {
  keyword: string;
  domain: string;
  position: number | null; // null = not found in top results
  url: string | null;
  title: string | null;
  totalResults: number;
  topCompetitors: { position: number; domain: string; title: string }[];
}

export interface SerpFeature {
  type:
    | "featured_snippet"
    | "local_pack"
    | "knowledge_panel"
    | "people_also_ask"
    | "video"
    | "images"
    | "shopping"
    | "news"
    | "sitelinks"
    | "other";
  title?: string;
  description?: string;
  position?: number;
}

export interface LocalSEOAnalysis {
  businessName: string;
  city: string;
  businessType: string;
  foundInLocalPack: boolean;
  localPackPosition: number | null;
  localPackResults: {
    position: number;
    title: string;
    rating?: number;
    reviews?: number;
    address?: string;
  }[];
  organicMentions: { position: number; title: string; url: string }[];
  suggestedKeywords: string[];
}

export interface KeywordSuggestion {
  keyword: string;
  source: "serpapi" | "google_suggest";
  relevance?: number; // 0-100 when available
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

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
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSerpApiKey(): string | undefined {
  return process.env.SERPAPI_KEY;
}

const DEFAULT_LOCATION = "France";
const DEFAULT_LANGUAGE = "fr";

/**
 * Generic SerpAPI call. Returns parsed JSON or null on failure.
 */
async function callSerpApi(
  params: Record<string, string>
): Promise<Record<string, unknown> | null> {
  const apiKey = getSerpApiKey();
  if (!apiKey) return null;

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("engine", "google");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`[serp] SerpAPI responded ${res.status}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.error("[serp] SerpAPI call failed:", err);
    return null;
  }
}

/**
 * Google Suggest (autocomplete) — free, no key required.
 */
async function googleSuggest(
  query: string,
  hl: string = DEFAULT_LANGUAGE
): Promise<string[]> {
  try {
    const url = new URL(
      "https://suggestqueries.google.com/complete/search"
    );
    url.searchParams.set("client", "chrome");
    url.searchParams.set("q", query);
    url.searchParams.set("hl", hl);

    const res = await fetch(url.toString());
    if (!res.ok) return [];

    // Response shape: ["query", ["suggestion1", "suggestion2", ...]]
    const json = (await res.json()) as [string, string[]];
    return json[1] ?? [];
  } catch (err) {
    console.error("[serp] Google Suggest failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check where a domain ranks for a given keyword.
 */
export async function checkRanking(
  keyword: string,
  domain: string,
  location: string = DEFAULT_LOCATION
): Promise<RankingResult> {
  const cacheKey = `rank:${keyword}:${domain}:${location}`;
  const cached = getCached<RankingResult>(cacheKey);
  if (cached) return cached;

  const base: RankingResult = {
    keyword,
    domain,
    position: null,
    url: null,
    title: null,
    totalResults: 0,
    topCompetitors: [],
  };

  const data = await callSerpApi({
    q: keyword,
    location,
    hl: DEFAULT_LANGUAGE,
    gl: "fr",
    num: "20",
  });

  if (!data) {
    // No SerpAPI key or call failed — return empty result
    setCache(cacheKey, base);
    return base;
  }

  const searchInfo = data.search_information as
    | { total_results?: number }
    | undefined;
  base.totalResults = searchInfo?.total_results ?? 0;

  const organicResults = (data.organic_results ?? []) as {
    position: number;
    link: string;
    title: string;
    displayed_link?: string;
  }[];

  const domainLower = domain.toLowerCase().replace(/^www\./, "");

  for (const r of organicResults) {
    const resultDomain = (r.displayed_link ?? r.link ?? "")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

    if (resultDomain.includes(domainLower) || domainLower.includes(resultDomain)) {
      base.position = r.position;
      base.url = r.link;
      base.title = r.title;
    } else {
      base.topCompetitors.push({
        position: r.position,
        domain: resultDomain,
        title: r.title,
      });
    }
  }

  // Keep only top 5 competitors
  base.topCompetitors = base.topCompetitors.slice(0, 5);

  setCache(cacheKey, base);
  return base;
}

/**
 * Extract SERP features (featured snippets, local pack, PAA, etc.)
 * for a keyword.
 */
export async function getSerpFeatures(
  keyword: string,
  location: string = DEFAULT_LOCATION
): Promise<SerpFeature[]> {
  const cacheKey = `feat:${keyword}:${location}`;
  const cached = getCached<SerpFeature[]>(cacheKey);
  if (cached) return cached;

  const data = await callSerpApi({
    q: keyword,
    location,
    hl: DEFAULT_LANGUAGE,
    gl: "fr",
  });

  if (!data) {
    setCache(cacheKey, []);
    return [];
  }

  const features: SerpFeature[] = [];

  // Featured snippet
  const answerBox = data.answer_box as
    | { title?: string; snippet?: string; type?: string }
    | undefined;
  if (answerBox) {
    features.push({
      type: "featured_snippet",
      title: answerBox.title,
      description: answerBox.snippet,
      position: 0,
    });
  }

  // Local pack
  const localResults = data.local_results as
    | { places?: { position: number; title: string }[] }
    | undefined;
  if (localResults?.places && localResults.places.length > 0) {
    features.push({
      type: "local_pack",
      title: `${localResults.places.length} résultats locaux`,
      description: localResults.places
        .slice(0, 3)
        .map((p) => p.title)
        .join(", "),
    });
  }

  // People Also Ask
  const paa = data.related_questions as
    | { question: string }[]
    | undefined;
  if (paa && paa.length > 0) {
    features.push({
      type: "people_also_ask",
      title: `${paa.length} questions associées`,
      description: paa
        .slice(0, 4)
        .map((q) => q.question)
        .join(" | "),
    });
  }

  // Knowledge panel
  const kp = data.knowledge_graph as
    | { title?: string; description?: string }
    | undefined;
  if (kp) {
    features.push({
      type: "knowledge_panel",
      title: kp.title,
      description: kp.description,
    });
  }

  // Inline videos
  const videos = data.inline_videos as unknown[] | undefined;
  if (videos && videos.length > 0) {
    features.push({
      type: "video",
      title: `${videos.length} vidéos`,
    });
  }

  // Shopping
  const shopping = data.shopping_results as unknown[] | undefined;
  if (shopping && shopping.length > 0) {
    features.push({
      type: "shopping",
      title: `${shopping.length} résultats shopping`,
    });
  }

  // Images
  const images = data.inline_images as unknown[] | undefined;
  if (images && images.length > 0) {
    features.push({
      type: "images",
      title: `${images.length} images`,
    });
  }

  // News
  const news = data.top_stories as unknown[] | undefined;
  if (news && news.length > 0) {
    features.push({
      type: "news",
      title: `${news.length} actualités`,
    });
  }

  setCache(cacheKey, features);
  return features;
}

/**
 * Analyse local SEO competition for a business in a specific city.
 */
export async function analyzeLocalSEO(
  businessName: string,
  city: string,
  businessType: string
): Promise<LocalSEOAnalysis> {
  const cacheKey = `lseo:${businessName}:${city}:${businessType}`;
  const cached = getCached<LocalSEOAnalysis>(cacheKey);
  if (cached) return cached;

  const result: LocalSEOAnalysis = {
    businessName,
    city,
    businessType,
    foundInLocalPack: false,
    localPackPosition: null,
    localPackResults: [],
    organicMentions: [],
    suggestedKeywords: [],
  };

  const query = `${businessType} ${city}`;
  const data = await callSerpApi({
    q: query,
    location: `${city}, France`,
    hl: DEFAULT_LANGUAGE,
    gl: "fr",
  });

  if (data) {
    // Parse local pack
    const localResults = data.local_results as
      | {
          places?: {
            position: number;
            title: string;
            rating?: number;
            reviews?: number;
            address?: string;
          }[];
        }
      | undefined;

    const places = localResults?.places ?? [];
    const nameLower = businessName.toLowerCase();

    for (const place of places) {
      result.localPackResults.push({
        position: place.position,
        title: place.title,
        rating: place.rating,
        reviews: place.reviews,
        address: place.address,
      });

      if (place.title.toLowerCase().includes(nameLower)) {
        result.foundInLocalPack = true;
        result.localPackPosition = place.position;
      }
    }

    // Parse organic results for mentions
    const organicResults = (data.organic_results ?? []) as {
      position: number;
      title: string;
      link: string;
    }[];

    for (const r of organicResults) {
      if (r.title.toLowerCase().includes(nameLower)) {
        result.organicMentions.push({
          position: r.position,
          title: r.title,
          url: r.link,
        });
      }
    }
  }

  // Always enrich with keyword suggestions (works without SerpAPI)
  const suggestions = await getKeywordSuggestions(query);
  result.suggestedKeywords = suggestions.slice(0, 10).map((s) => s.keyword);

  setCache(cacheKey, result);
  return result;
}

/**
 * Get keyword suggestions related to a seed keyword.
 * Uses SerpAPI related searches if available, falls back to Google Suggest.
 */
export async function getKeywordSuggestions(
  seed: string,
  language: string = DEFAULT_LANGUAGE
): Promise<KeywordSuggestion[]> {
  const cacheKey = `kw:${seed}:${language}`;
  const cached = getCached<KeywordSuggestion[]>(cacheKey);
  if (cached) return cached;

  const results: KeywordSuggestion[] = [];

  // Try SerpAPI first for richer data
  const data = await callSerpApi({
    q: seed,
    location: DEFAULT_LOCATION,
    hl: language,
    gl: "fr",
  });

  if (data) {
    // Related searches from SERP
    const relatedSearches = (data.related_searches ?? []) as {
      query: string;
    }[];
    for (const rs of relatedSearches) {
      results.push({
        keyword: rs.query,
        source: "serpapi",
      });
    }

    // People Also Ask questions can serve as long-tail keywords
    const paa = (data.related_questions ?? []) as {
      question: string;
    }[];
    for (const q of paa) {
      results.push({
        keyword: q.question,
        source: "serpapi",
      });
    }
  }

  // Always supplement with Google Suggest (free, no limit)
  const suggestions = await googleSuggest(seed, language);
  for (const s of suggestions) {
    // Avoid duplicates
    if (!results.some((r) => r.keyword.toLowerCase() === s.toLowerCase())) {
      results.push({ keyword: s, source: "google_suggest" });
    }
  }

  // Also try prefix variations for more ideas
  const prefixes = [
    `${seed} meilleur`,
    `${seed} comment`,
    `${seed} avis`,
    `pourquoi ${seed}`,
  ];
  for (const prefix of prefixes) {
    const extra = await googleSuggest(prefix, language);
    for (const s of extra) {
      if (!results.some((r) => r.keyword.toLowerCase() === s.toLowerCase())) {
        results.push({ keyword: s, source: "google_suggest" });
      }
    }
  }

  setCache(cacheKey, results);
  return results;
}

// ---------------------------------------------------------------------------
// Prompt formatting
// ---------------------------------------------------------------------------

/**
 * Format SERP analysis data into a concise text block
 * suitable for injection into agent Oscar's prompt.
 */
export function formatSerpForPrompt(
  data:
    | RankingResult
    | LocalSEOAnalysis
    | SerpFeature[]
    | KeywordSuggestion[]
): string {
  if (!data) return "Aucune donnée SERP disponible.";

  // Array of SerpFeatures
  if (Array.isArray(data) && data.length > 0 && "type" in data[0]) {
    const features = data as SerpFeature[];
    const lines = ["## Fonctionnalités SERP détectées"];
    for (const f of features) {
      const desc = f.description ? ` — ${f.description}` : "";
      lines.push(`- ${f.type}${f.title ? `: ${f.title}` : ""}${desc}`);
    }
    return lines.join("\n");
  }

  // Array of KeywordSuggestions
  if (Array.isArray(data) && data.length > 0 && "keyword" in data[0]) {
    const kws = data as KeywordSuggestion[];
    const lines = ["## Suggestions de mots-clés"];
    for (const kw of kws.slice(0, 15)) {
      lines.push(`- ${kw.keyword} (${kw.source})`);
    }
    return lines.join("\n");
  }

  // RankingResult
  if ("position" in data && "topCompetitors" in data) {
    const r = data as RankingResult;
    const lines = [
      `## Classement pour "${r.keyword}"`,
      r.position !== null
        ? `Position: #${r.position} (${r.url})`
        : `Non trouvé dans le top 20 pour ${r.domain}`,
      `Résultats totaux: ${r.totalResults.toLocaleString("fr-FR")}`,
    ];
    if (r.topCompetitors.length > 0) {
      lines.push("Concurrents:");
      for (const c of r.topCompetitors) {
        lines.push(`  #${c.position} ${c.domain} — ${c.title}`);
      }
    }
    return lines.join("\n");
  }

  // LocalSEOAnalysis
  if ("foundInLocalPack" in data) {
    const a = data as LocalSEOAnalysis;
    const lines = [
      `## Analyse SEO local: ${a.businessName} (${a.city})`,
      `Pack local: ${a.foundInLocalPack ? `Trouvé en position #${a.localPackPosition}` : "Non trouvé"}`,
    ];
    if (a.localPackResults.length > 0) {
      lines.push("Top du pack local:");
      for (const lp of a.localPackResults.slice(0, 5)) {
        const rating = lp.rating ? ` (${lp.rating}/5, ${lp.reviews ?? 0} avis)` : "";
        lines.push(`  #${lp.position} ${lp.title}${rating}`);
      }
    }
    if (a.organicMentions.length > 0) {
      lines.push("Mentions organiques:");
      for (const m of a.organicMentions) {
        lines.push(`  #${m.position} ${m.title}`);
      }
    }
    if (a.suggestedKeywords.length > 0) {
      lines.push(`Mots-clés suggérés: ${a.suggestedKeywords.join(", ")}`);
    }
    return lines.join("\n");
  }

  return "Données SERP au format non reconnu.";
}
