export const runtime = 'nodejs';
import { fetchNews, fetchPriorityNews, NewsArticle } from "@/lib/newsProviders";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fetchAll = searchParams.get('all') === 'true';
    const priority = searchParams.get('priority') === 'true';
    const category = searchParams.get('cat') || '';
    const query = searchParams.get('q') || '';
    const region = searchParams.get('region') || 'fr';

    let items: NewsArticle[];

    if (priority) {
      // Mode prioritaire : uniquement "Les bonnes nouvelles" (2 flux, très rapide)
      console.log(`[API /news] Priority fetch for region=${region}...`);
      items = await fetchPriorityNews(region);
    } else {
      // Mode complet : tous les flux RSS
      console.log(`[API /news] Full fetch for region=${region}...`);
      items = await fetchNews(region);
    }

    items = items || [];

    // Filtrer par catégorie si demandé
    if (!fetchAll && !priority && category) {
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
