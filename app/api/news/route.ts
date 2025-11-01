export const runtime = "nodejs";
import { fetchNewsWithFallback, distributeByCategory, NewsArticle } from "@/lib/newsProviders";

// Cache en mémoire pour 1h (synchronisé avec newsProviders.ts)
let cachedNews: NewsArticle[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 heure

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fetchAll = searchParams.get('all') === 'true';
    const category = searchParams.get('cat') || '';
    const query = searchParams.get('q') || '';

    // Vérifier le cache
    const now = Date.now();
    const cacheValid = cachedNews && (now - cacheTimestamp) < CACHE_DURATION;

    if (!cacheValid) {
      // Recharger les news avec fallback automatique
      console.log('[API /news] Cache expired, fetching fresh news with fallback...');
      const rawNews = await fetchNewsWithFallback();
      cachedNews = distributeByCategory(rawNews);
      cacheTimestamp = now;
      console.log(`[API /news] Cached ${cachedNews.length} news items across categories`);
    } else {
      console.log('[API /news] Serving from cache');
    }

    let items = cachedNews || [];

    // Filtrer par catégorie si demandé
    if (!fetchAll && category) {
      items = items.filter(item => item.category === category);
    }

    // Filtrer par recherche si demandé
    if (query) {
      const lowerQuery = query.toLowerCase();
      items = items.filter(item =>
        item.title.toLowerCase().includes(lowerQuery) ||
        item.description.toLowerCase().includes(lowerQuery)
      );
    }

    return Response.json({
      ok: true,
      items,
      cached: cacheValid,
      cacheAge: Math.floor((now - cacheTimestamp) / 1000 / 60), // minutes
      count: items.length,
    });
  } catch (e: any) {
    console.error("[API /news] Error:", e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
