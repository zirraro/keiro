export const runtime = "nodejs";
import { fetchNews, NewsArticle } from "@/lib/newsProviders";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fetchAll = searchParams.get('all') === 'true';
    const category = searchParams.get('cat') || '';
    const query = searchParams.get('q') || '';

    // fetchNews() gère déjà son propre cache 24h et la catégorisation
    console.log('[API /news] Fetching news (with internal 24h cache)...');
    const cachedNews = await fetchNews();

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
