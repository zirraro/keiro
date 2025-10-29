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

// Catégories mapping (mots-clés élargis pour meilleure distribution) - EN FRANÇAIS
const CATEGORY_KEYWORDS = {
  'Tech': ['tech', 'technologie', 'ai', 'ia', 'intelligence', 'artificielle', 'logiciel', 'software', 'numérique', 'digital', 'data', 'données', 'cyber', 'app', 'application', 'internet', 'innovation', 'ordinateur', 'computer', 'smartphone', 'cloud', 'algorithme'],
  'Business': ['business', 'entreprise', 'économie', 'economy', 'finance', 'financier', 'marché', 'market', 'bourse', 'stock', 'commerce', 'trade', 'société', 'company', 'corporate', 'investisseur', 'investor', 'startup', 'entrepreneur'],
  'Santé': ['santé', 'health', 'médical', 'medical', 'bien-être', 'wellness', 'hôpital', 'hospital', 'médecin', 'doctor', 'patient', 'maladie', 'disease', 'traitement', 'treatment', 'médicament', 'medicine', 'vaccin', 'vaccine', 'covid', 'mental', 'fitness'],
  'Sport': ['sport', 'football', 'soccer', 'basket', 'basketball', 'tennis', 'olympique', 'olympic', 'athlète', 'athlete', 'jeu', 'game', 'joueur', 'player', 'équipe', 'team', 'championnat', 'championship', 'match'],
  'Culture': ['culture', 'divertissement', 'entertainment', 'art', 'musique', 'music', 'film', 'cinéma', 'movie', 'cinema', 'artiste', 'artist', 'spectacle', 'show', 'concert', 'festival', 'livre', 'book', 'théâtre', 'theater'],
  'Politique': ['politique', 'politic', 'gouvernement', 'government', 'élection', 'election', 'président', 'president', 'ministre', 'minister', 'parlement', 'parliament', 'sénat', 'senate', 'vote', 'loi', 'law', 'policy'],
  'Climat': ['climat', 'environment', 'environnement', 'climate', 'vert', 'green', 'énergie', 'energy', 'renouvelable', 'renewable', 'carbone', 'carbon', 'émission', 'emission', 'pollution', 'durable', 'sustainable', 'eco', 'écologie'],
  'Automobile': ['auto', 'automobile', 'automotive', 'voiture', 'car', 'véhicule', 'vehicle', 'électrique', 'electric', 'tesla', 'conduite', 'driving', 'autonome', 'autonomous', 'moteur', 'motor', 'transport'],
  'Lifestyle': ['lifestyle', 'mode', 'fashion', 'voyage', 'travel', 'cuisine', 'food', 'recette', 'recipe', 'style', 'beauté', 'beauty', 'maison', 'home', 'design', 'tourisme', 'tourism', 'vie'],
  'People': ['people', 'célébrité', 'celebrity', 'star', 'acteur', 'actor', 'actrice', 'actress', 'influenceur', 'influencer', 'célèbre', 'famous', 'personnalité'],
  'Gaming': ['gaming', 'jeu vidéo', 'game', 'esport', 'playstation', 'xbox', 'nintendo', 'videogame', 'gamer', 'jeux', 'console'],
  'Restauration': ['restaurant', 'cuisine', 'chef', 'gastronomie', 'gastronomy', 'culinaire', 'culinary', 'plat', 'dish', 'resto', 'bar', 'café'],
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

// Provider 1: NewsData.io (source unique pour éviter doublons)
async function fetchFromNewsData(): Promise<NewsArticle[]> {
  try {
    const allArticles: NewsArticle[] = [];

    // Récupérer beaucoup plus de news françaises pour mieux remplir toutes les catégories
    const categories = [
      'top', 'technology', 'business', 'health', 'sports', 'entertainment',
      'science', 'environment', 'food', 'tourism', 'politics', 'world',
      'lifestyle', 'domestic'
    ];

    for (const cat of categories) {
      const url = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_API_KEY}&language=fr&category=${cat}&size=10`;
      const res = await fetch(url, { next: { revalidate: 3600 } });

      if (!res.ok) {
        console.warn(`[NewsData] Category ${cat} failed: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();

      if (data.results && data.results.length > 0) {
        const articles = data.results.map((article: any) => ({
          id: article.article_id || Buffer.from(article.link).toString('base64').substring(0, 16),
          title: article.title || 'Sans titre',
          description: article.description || article.content?.substring(0, 200) || '',
          url: article.link,
          image: article.image_url || `https://picsum.photos/seed/${article.article_id}/600/400`,
          source: article.source_id || 'NewsData',
          date: article.pubDate,
          category: categorizeArticle(article.title, article.description || '', article.category?.[0] || ''),
        }));

        allArticles.push(...articles);
        console.log(`[NewsData] Category ${cat}: ${articles.length} articles`);
      }
    }

    console.log(`[NewsData] Total fetched: ${allArticles.length} articles in French`);
    return allArticles;
  } catch (error: any) {
    console.error('[NewsData] Error:', error.message);
    throw error;
  }
}

// Provider 2: GNews (fallback pour le français)
async function fetchFromGNews(): Promise<NewsArticle[]> {
  try {
    const topics = ['general', 'business', 'technology', 'sports', 'health', 'entertainment', 'science', 'world'];
    const allArticles: NewsArticle[] = [];

    for (const topic of topics) {
      const url = `https://gnews.io/api/v4/top-headlines?category=${topic}&lang=fr&country=fr&max=15&apikey=${GNEWS_API_KEY}`;
      const res = await fetch(url, { next: { revalidate: 3600 } }); // Cache 1h

      if (!res.ok) {
        console.warn(`[GNews] Topic ${topic} failed: HTTP ${res.status}`);
        continue;
      }

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

    console.log(`[GNews] Fetched ${allArticles.length} articles in French`);
    return allArticles;
  } catch (error: any) {
    console.error('[GNews] Error:', error.message);
    throw error;
  }
}

// Provider 3: Mock data (dernier fallback)
function getMockNews(): NewsArticle[] {
  const now = new Date().toISOString();
  const mockCategories = ['Tech', 'Business', 'Santé', 'Sport', 'Culture', 'Politique', 'Climat', 'Auto', 'Lifestyle', 'People', 'Gaming', 'Restauration'];
  const articles: NewsArticle[] = [];

  mockCategories.forEach((cat, idx) => {
    for (let i = 0; i < 12; i++) {
      articles.push({
        id: `mock-${cat}-${i}`,
        title: `Actualité ${cat} ${i + 1} : Nouveaux développements dans le secteur ${cat.toLowerCase()}`,
        description: `Dernières mises à jour et analyses sur les tendances et innovations du secteur ${cat.toLowerCase()} qui façonnent l'avenir.`,
        url: `https://example.com/${cat.toLowerCase()}-${i}`,
        image: `https://picsum.photos/seed/${cat}-${i}/600/400`,
        source: 'Demo News',
        date: now,
        category: cat,
      });
    }
  });

  console.log(`[Mock] Generated ${articles.length} mock articles in French`);
  return articles;
}

// Fonction principale avec fallback en cascade
export async function fetchNewsWithFallback(): Promise<NewsArticle[]> {
  // Essayer NewsData en premier (meilleur pour le français)
  try {
    console.log('[fetchNewsWithFallback] Trying NewsData.io (French)...');
    const articles = await fetchFromNewsData();
    if (articles.length > 0) {
      console.log(`[fetchNewsWithFallback] NewsData returned ${articles.length} articles`);
      return articles;
    }
  } catch (error) {
    console.warn('[fetchNewsWithFallback] NewsData failed, trying GNews...');
  }

  // Fallback sur GNews
  try {
    console.log('[fetchNewsWithFallback] Trying GNews (French)...');
    const articles = await fetchFromGNews();
    if (articles.length > 0) {
      console.log(`[fetchNewsWithFallback] GNews returned ${articles.length} articles`);
      return articles;
    }
  } catch (error) {
    console.warn('[fetchNewsWithFallback] GNews failed, using mock data...');
  }

  // Dernier fallback : données mock
  console.log('[fetchNewsWithFallback] Using mock data');
  return getMockNews();
}

// Distribuer par catégories de façon équilibrée - UNIQUEMENT DES VRAIES NEWS
export function distributeByCategory(articles: NewsArticle[]): NewsArticle[] {
  const REQUIRED_CATEGORIES = [
    'À la une', 'Tech', 'Business', 'Santé', 'Sport', 'Culture',
    'Politique', 'Climat', 'Automobile', 'Lifestyle', 'People', 'Gaming', 'Restauration'
  ];

  const TARGET_PER_CATEGORY = 12;
  const categoryArticles = new Map<string, NewsArticle[]>();
  const usedArticleIds = new Set<string>();

  // Initialiser toutes les catégories
  REQUIRED_CATEGORIES.forEach(cat => {
    categoryArticles.set(cat, []);
  });

  // Éliminer les doublons d'abord
  const uniqueArticles: NewsArticle[] = [];
  articles.forEach(article => {
    if (!usedArticleIds.has(article.id)) {
      usedArticleIds.add(article.id);
      uniqueArticles.push(article);
    }
  });

  console.log(`[Distribution] Total unique articles: ${uniqueArticles.length}`);

  // Premier passage : distribuer selon la catégorisation initiale (max 12 par catégorie)
  for (const article of uniqueArticles) {
    const cat = article.category || 'À la une';
    const catList = categoryArticles.get(cat) || [];

    if (catList.length < TARGET_PER_CATEGORY) {
      catList.push(article);
      categoryArticles.set(cat, catList);
    }
  }

  console.log('[Distribution] After initial distribution:',
    Object.fromEntries(Array.from(categoryArticles.entries()).map(([k, v]) => [k, v.length])));

  // Deuxième passage : Redistribuer intelligemment les articles des catégories pleines vers les vides
  const fullCategories: string[] = [];
  const emptyCategories: string[] = [];

  for (const cat of REQUIRED_CATEGORIES) {
    const count = categoryArticles.get(cat)?.length || 0;
    if (count >= TARGET_PER_CATEGORY) {
      fullCategories.push(cat);
    } else if (count < TARGET_PER_CATEGORY) {
      emptyCategories.push(cat);
    }
  }

  // Pool de tous les articles disponibles pour redistribution
  const redistributionPool: NewsArticle[] = [];

  // Ajouter les articles en surplus des catégories pleines
  for (const cat of fullCategories) {
    const articles = categoryArticles.get(cat) || [];
    if (articles.length > TARGET_PER_CATEGORY) {
      const surplus = articles.splice(TARGET_PER_CATEGORY);
      redistributionPool.push(...surplus);
    }
  }

  // Ajouter les articles de "À la une" si elle a assez d'articles
  const alaUne = categoryArticles.get('À la une') || [];
  if (alaUne.length >= TARGET_PER_CATEGORY) {
    // Garder TARGET_PER_CATEGORY pour "À la une", le reste est disponible pour redistribution
    const forRedistribution = alaUne.slice(TARGET_PER_CATEGORY);
    redistributionPool.push(...forRedistribution);
  }

  console.log(`[Distribution] Redistribution pool size: ${redistributionPool.length}`);

  // Redistribuer équitablement vers les catégories qui ont besoin
  let poolIndex = 0;
  for (const cat of emptyCategories) {
    const catList = categoryArticles.get(cat) || [];
    const needed = TARGET_PER_CATEGORY - catList.length;

    for (let i = 0; i < needed && poolIndex < redistributionPool.length; i++) {
      const article = { ...redistributionPool[poolIndex] };
      article.category = cat; // Re-catégoriser
      catList.push(article);
      poolIndex++;
    }

    categoryArticles.set(cat, catList);
  }

  console.log('[Distribution] After redistribution:',
    Object.fromEntries(Array.from(categoryArticles.entries()).map(([k, v]) => [k, v.length])));

  // Construire le résultat final
  const result: NewsArticle[] = [];
  for (const cat of REQUIRED_CATEGORIES) {
    const articles = categoryArticles.get(cat) || [];
    result.push(...articles);
  }

  console.log(`[Distribution] Total final articles: ${result.length}`);
  console.log('[Distribution] Final counts by category:',
    Object.fromEntries(Array.from(categoryArticles.entries()).map(([k, v]) => [k, v.length])));

  return result;
}
