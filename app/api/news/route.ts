export const runtime = "nodejs";
import { fetchNews, NewsItem } from "@/lib/news";

// Cache en mémoire pour 24h
let cachedNews: Array<NewsItem & { category: string }> | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 heures

// Catégoriser une actualité selon son contenu
function categorizeNews(item: NewsItem): string {
  const text = `${item.title} ${item.summary} ${item.source}`.toLowerCase();

  // Tech
  if (text.match(/tech|ai|intelligence|software|app|digital|cyber|data|cloud|startup/i)) {
    return 'Tech';
  }

  // Business/Économie
  if (text.match(/business|économie|economy|market|invest|startup|funding|trade|finance/i)) {
    return 'Business';
  }

  // Santé
  if (text.match(/santé|health|medical|wellness|wellbeing|hospital|vaccine|disease/i)) {
    return 'Santé';
  }

  // Sport
  if (text.match(/sport|football|tennis|olympic|champion|athlete|game/i)) {
    return 'Sport';
  }

  // Culture
  if (text.match(/culture|film|movie|music|art|festival|concert|book/i)) {
    return 'Culture';
  }

  // Politique
  if (text.match(/politics|government|election|president|minister|parliament|law/i)) {
    return 'Politique';
  }

  // Climat
  if (text.match(/climate|environment|green|renewable|carbon|pollution|eco/i)) {
    return 'Climat';
  }

  // Auto
  if (text.match(/car|auto|vehicle|electric car|tesla|automotive/i)) {
    return 'Auto';
  }

  // Lifestyle
  if (text.match(/lifestyle|fashion|travel|food|restaurant|recipe|style/i)) {
    return 'Lifestyle';
  }

  // People
  if (text.match(/celebrity|people|star|actor|actress|influencer/i)) {
    return 'People';
  }

  // Gaming
  if (text.match(/gaming|game|esport|playstation|xbox|nintendo|videogame/i)) {
    return 'Gaming';
  }

  // Par défaut
  return 'À la une';
}

// Distribuer les news dans les catégories (max 12 par catégorie)
function distributeByCategory(items: NewsItem[]): Array<NewsItem & { category: string }> {
  const categoryCounts = new Map<string, number>();
  const result: Array<NewsItem & { category: string }> = [];

  for (const item of items) {
    const category = categorizeNews(item);
    const count = categoryCounts.get(category) || 0;

    // Limiter à 12 items par catégorie
    if (count < 12) {
      result.push({ ...item, category });
      categoryCounts.set(category, count + 1);
    }
  }

  return result;
}

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
      // Recharger les news
      console.log('[API /news] Cache expired or empty, fetching fresh news...');
      const rawNews = await fetchNews();
      cachedNews = distributeByCategory(rawNews);
      cacheTimestamp = now;
      console.log(`[API /news] Cached ${cachedNews.length} news items across categories`);
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
        item.summary.toLowerCase().includes(lowerQuery)
      );
    }

    return Response.json({
      ok: true,
      items,
      cached: cacheValid,
      cacheAge: Math.floor((now - cacheTimestamp) / 1000 / 60), // minutes
    });
  } catch (e: any) {
    console.error("[API /news] Error:", e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
