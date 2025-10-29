// Providers de news avec fallback automatique

export type NewsArticle = {
  id: string;
  title: string;
  description: string;
  url: string;
  image?: string;
  source?: string;
  date?: string;
  category?: string;
};

// Configuration des providers
const GNEWS_API_KEY = '14cef0dcc6437084dab9a432df281e98';
const NEWSDATA_API_KEY = 'pub_f0d6177c8ef44e26ab72a1723d21b088';
const NEWSAPI_AI_KEY = '22c2c608-833e-4050-8925-9e9f7e7e1cf9';

// Catégories mapping (mots-clés élargis pour meilleure distribution)
const CATEGORY_KEYWORDS = {
  'Tech': ['tech', 'ai', 'artificial', 'intelligence', 'software', 'digital', 'data', 'cyber', 'app', 'internet', 'innovation', 'computer', 'smartphone', 'cloud', 'algorithm'],
  'Business': ['business', 'economy', 'economic', 'finance', 'financial', 'market', 'stock', 'trade', 'company', 'corporate', 'investor', 'startup', 'entrepreneur'],
  'Santé': ['health', 'medical', 'wellness', 'hospital', 'doctor', 'patient', 'disease', 'treatment', 'medicine', 'vaccine', 'covid', 'mental', 'fitness'],
  'Sport': ['sport', 'football', 'soccer', 'basketball', 'tennis', 'olympic', 'athlete', 'game', 'player', 'team', 'championship', 'match'],
  'Culture': ['entertainment', 'culture', 'art', 'music', 'film', 'movie', 'cinema', 'artist', 'show', 'concert', 'festival', 'book', 'theater'],
  'Politique': ['politic', 'government', 'election', 'president', 'minister', 'parliament', 'senate', 'congress', 'vote', 'law', 'policy'],
  'Climat': ['environment', 'climate', 'green', 'energy', 'renewable', 'carbon', 'emission', 'pollution', 'sustainable', 'eco', 'warming'],
  'Auto': ['automotive', 'car', 'vehicle', 'electric car', 'tesla', 'driving', 'autonomous', 'motor'],
  'Lifestyle': ['lifestyle', 'fashion', 'travel', 'food', 'recipe', 'restaurant', 'style', 'beauty', 'home', 'design'],
  'People': ['celebrity', 'star', 'actor', 'actress', 'influencer', 'famous'],
  'Gaming': ['gaming', 'game', 'esport', 'playstation', 'xbox', 'nintendo', 'videogame', 'gamer'],
};

function categorizeArticle(title: string, description: string, source: string = ''): string {
  const text = `${title} ${description} ${source}`.toLowerCase();

  // Calculer un score pour chaque catégorie
  const scores: { [key: string]: number } = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[category] = keywords.filter(kw => text.includes(kw)).length;
  }

  // Trouver la catégorie avec le meilleur score
  const bestCategory = Object.entries(scores)
    .filter(([_, score]) => score > 0)
    .sort(([_, a], [__, b]) => b - a)[0];

  return bestCategory ? bestCategory[0] : 'À la une';
}

// Provider 1: GNews (meilleur pour la couverture globale)
async function fetchFromGNews(): Promise<NewsArticle[]> {
  try {
    const topics = ['technology', 'business', 'health', 'sports', 'entertainment', 'general', 'science', 'world', 'nation'];
    const allArticles: NewsArticle[] = [];

    for (const topic of topics) {
      const url = `https://gnews.io/api/v4/top-headlines?category=${topic}&lang=en&max=20&apikey=${GNEWS_API_KEY}`;
      const res = await fetch(url, { next: { revalidate: 3600 } }); // Cache 1h

      if (!res.ok) throw new Error(`GNews HTTP ${res.status}`);

      const data = await res.json();

      if (data.articles) {
        const articles = data.articles.map((article: any) => ({
          id: Buffer.from(article.url).toString('base64').substring(0, 16),
          title: article.title || 'Sans titre',
          description: article.description || article.content?.substring(0, 200) || '',
          url: article.url,
          image: article.image,
          source: article.source?.name || 'GNews',
          date: article.publishedAt,
          category: categorizeArticle(article.title, article.description || '', article.source?.name || ''),
        }));

        allArticles.push(...articles);
      }
    }

    console.log(`[GNews] Fetched ${allArticles.length} articles`);
    return allArticles;
  } catch (error: any) {
    console.error('[GNews] Error:', error.message);
    throw error;
  }
}

// Provider 2: NewsData.io (fallback)
async function fetchFromNewsData(): Promise<NewsArticle[]> {
  try {
    const url = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_API_KEY}&language=en&category=top,technology,business,health,sports`;
    const res = await fetch(url, { next: { revalidate: 3600 } });

    if (!res.ok) throw new Error(`NewsData HTTP ${res.status}`);

    const data = await res.json();

    if (!data.results) throw new Error('No results from NewsData');

    const articles = data.results.map((article: any) => ({
      id: article.article_id || Buffer.from(article.link).toString('base64').substring(0, 16),
      title: article.title || 'Sans titre',
      description: article.description || article.content?.substring(0, 200) || '',
      url: article.link,
      image: article.image_url,
      source: article.source_id || 'NewsData',
      date: article.pubDate,
      category: categorizeArticle(article.title, article.description || '', article.source_id || ''),
    }));

    console.log(`[NewsData] Fetched ${articles.length} articles`);
    return articles;
  } catch (error: any) {
    console.error('[NewsData] Error:', error.message);
    throw error;
  }
}

// Provider 3: Mock data (dernier fallback)
function getMockNews(): NewsArticle[] {
  const now = new Date().toISOString();
  const mockCategories = ['Tech', 'Business', 'Santé', 'Sport', 'Culture'];
  const articles: NewsArticle[] = [];

  mockCategories.forEach((cat, idx) => {
    for (let i = 0; i < 12; i++) {
      articles.push({
        id: `mock-${cat}-${i}`,
        title: `${cat} News ${i + 1}: Breaking developments in ${cat.toLowerCase()}`,
        description: `Latest updates and insights about ${cat.toLowerCase()} industry trends and innovations that are shaping the future.`,
        url: `https://example.com/${cat.toLowerCase()}-${i}`,
        image: `https://picsum.photos/seed/${cat}-${i}/600/400`,
        source: 'Demo News',
        date: now,
        category: cat,
      });
    }
  });

  console.log(`[Mock] Generated ${articles.length} mock articles`);
  return articles;
}

// Fonction principale avec fallback en cascade
export async function fetchNewsWithFallback(): Promise<NewsArticle[]> {
  // Essayer GNews en premier (meilleur provider)
  try {
    const articles = await fetchFromGNews();
    if (articles.length > 0) return articles;
  } catch (error) {
    console.warn('[fetchNewsWithFallback] GNews failed, trying NewsData...');
  }

  // Fallback sur NewsData
  try {
    const articles = await fetchFromNewsData();
    if (articles.length > 0) return articles;
  } catch (error) {
    console.warn('[fetchNewsWithFallback] NewsData failed, using mock data...');
  }

  // Dernier fallback : données mock
  return getMockNews();
}

// Distribuer par catégories (max 12 par catégorie)
export function distributeByCategory(articles: NewsArticle[]): NewsArticle[] {
  const categoryCounts = new Map<string, number>();
  const result: NewsArticle[] = [];

  for (const article of articles) {
    const cat = article.category || 'À la une';
    const count = categoryCounts.get(cat) || 0;

    if (count < 12) {
      result.push(article);
      categoryCounts.set(cat, count + 1);
    }
  }

  return result;
}
