export const runtime = "nodejs";

export type NewsArticle = {
  id: string;
  title: string;
  description: string;
  url: string;
  image?: string;
  source: string;
  date?: string;
  category?: string;
};

// Clés API
const GNEWS_API_KEY = '14cef0dcc6437084dab9a432df281e98';
const NEWSDATA_API_KEY = 'pub_f0d6177c8ef44e26ab72a1723d21b088';

// Catégories avec mots-clés très larges (FR + EN)
const CATEGORY_KEYWORDS: { [key: string]: string[] } = {
  'Tech': ['tech', 'technologie', 'technology', 'ai', 'ia', 'intelligence', 'artificial', 'software', 'numérique', 'digital', 'data', 'cyber', 'app', 'internet', 'innovation', 'smartphone', 'cloud', 'robot', 'automation', 'électronique', 'computing', 'network', '5g', 'blockchain', 'crypto', 'metaverse', 'vr', 'ar', 'iot'],

  'Business': ['business', 'entreprise', 'économie', 'economy', 'marché', 'market', 'commerce', 'trade', 'société', 'company', 'startup', 'entrepreneur', 'industrie', 'industry', 'production', 'croissance', 'growth', 'profit', 'acquisition', 'fusion', 'emploi', 'recrutement'],

  'Finance': ['finance', 'financier', 'banque', 'bank', 'crédit', 'taux', 'bourse', 'stock', 'action', 'trading', 'investissement', 'assurance', 'épargne', 'monnaie', 'euro', 'dollar', 'bitcoin', 'ethereum', 'crypto'],

  'Santé': ['santé', 'health', 'médical', 'medical', 'hôpital', 'hospital', 'médecin', 'doctor', 'patient', 'maladie', 'disease', 'traitement', 'médicament', 'medicine', 'vaccin', 'vaccine', 'covid', 'virus', 'mental', 'fitness', 'nutrition'],

  'Sport': ['sport', 'football', 'soccer', 'basket', 'tennis', 'rugby', 'olympique', 'olympic', 'athlète', 'athlete', 'joueur', 'player', 'équipe', 'team', 'championnat', 'match', 'compétition', 'coupe', 'ligue', 'league'],

  'Culture': ['culture', 'art', 'musique', 'music', 'film', 'cinéma', 'movie', 'cinema', 'série', 'series', 'netflix', 'streaming', 'spectacle', 'concert', 'festival', 'musée', 'museum', 'livre', 'book', 'théâtre', 'theater'],

  'Politique': ['politique', 'politic', 'gouvernement', 'government', 'élection', 'election', 'vote', 'président', 'president', 'ministre', 'minister', 'parlement', 'parliament', 'sénat', 'loi', 'law', 'réforme', 'parti', 'party'],

  'Climat': ['climat', 'climate', 'environnement', 'environment', 'écologie', 'ecology', 'green', 'énergie', 'energy', 'renouvelable', 'renewable', 'solaire', 'éolien', 'carbone', 'carbon', 'pollution', 'durable', 'sustainable', 'recyclage', 'biodiversité'],

  'Automobile': ['auto', 'automobile', 'voiture', 'car', 'véhicule', 'vehicle', 'électrique', 'electric', 'tesla', 'conduite', 'driving', 'moteur', 'transport', 'mobilité', 'mobility', 'route', 'batterie', 'battery'],

  'Lifestyle': ['lifestyle', 'mode', 'fashion', 'voyage', 'travel', 'cuisine', 'food', 'beauté', 'beauty', 'maison', 'home', 'design', 'tourisme', 'hôtel', 'hotel', 'luxe', 'luxury', 'décoration'],

  'People': ['people', 'célébrité', 'celebrity', 'star', 'acteur', 'actor', 'chanteur', 'singer', 'influenceur', 'influencer', 'célèbre', 'famous', 'personnalité', 'couple', 'mariage'],

  'Gaming': ['gaming', 'gamer', 'jeu vidéo', 'video game', 'esport', 'playstation', 'xbox', 'nintendo', 'console', 'fortnite', 'minecraft', 'twitch', 'streamer'],

  'Restauration': ['restaurant', 'cuisine', 'chef', 'gastronomie', 'culinaire', 'plat', 'menu', 'michelin', 'bar', 'café', 'bistrot', 'food truck'],

  'Science': ['science', 'scientifique', 'recherche', 'research', 'découverte', 'laboratoire', 'physique', 'physics', 'chimie', 'chemistry', 'biologie', 'biology', 'astronomie', 'astronomy', 'espace', 'space', 'nasa', 'planète'],

  'International': ['international', 'monde', 'world', 'global', 'pays', 'country', 'guerre', 'war', 'conflit', 'paix', 'peace', 'diplomatie', 'onu', 'europe', 'asie', 'afrique', 'amérique', 'chine', 'usa', 'russie'],
};

// Catégorisation intelligente
function categorizeArticle(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  let bestCategory = 'À la une';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter(kw => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

// GNews - Meilleur provider (100 articles max par requête)
async function fetchFromGNews(): Promise<NewsArticle[]> {
  try {
    const allArticles: NewsArticle[] = [];
    const topics = ['general', 'business', 'technology', 'sports', 'health', 'entertainment', 'science', 'world'];

    for (const topic of topics) {
      const url = `https://gnews.io/api/v4/top-headlines?category=${topic}&lang=fr&country=fr&max=20&apikey=${GNEWS_API_KEY}`;
      const res = await fetch(url, { next: { revalidate: 3600 } });

      if (res.ok) {
        const data = await res.json();
        if (data.articles) {
          const articles = data.articles.map((article: any) => ({
            id: `gnews-${Buffer.from(article.url).toString('base64').substring(0, 16)}`,
            title: article.title || 'Sans titre',
            description: article.description || article.content?.substring(0, 200) || '',
            url: article.url,
            image: article.image,
            source: article.source?.name || 'GNews',
            date: article.publishedAt,
            category: categorizeArticle(article.title, article.description || ''),
          }));
          allArticles.push(...articles);
        }
      }
    }

    console.log(`[GNews] Fetched ${allArticles.length} articles`);
    return allArticles;
  } catch (error: any) {
    console.error('[GNews] Error:', error.message);
    throw error;
  }
}

// NewsData.io - Fallback
async function fetchFromNewsData(): Promise<NewsArticle[]> {
  try {
    const allArticles: NewsArticle[] = [];
    const categories = ['top', 'technology', 'business', 'health', 'sports', 'entertainment', 'science', 'environment', 'food', 'politics'];

    for (const cat of categories) {
      const url = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_API_KEY}&language=fr&category=${cat}&size=20`;
      const res = await fetch(url, { next: { revalidate: 3600 } });

      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          const articles = data.results.map((article: any) => ({
            id: `newsdata-${article.article_id || Buffer.from(article.link).toString('base64').substring(0, 16)}`,
            title: article.title || 'Sans titre',
            description: article.description || article.content?.substring(0, 200) || '',
            url: article.link,
            image: article.image_url,
            source: article.source_id || 'NewsData',
            date: article.pubDate,
            category: categorizeArticle(article.title, article.description || ''),
          }));
          allArticles.push(...articles);
        }
      }
    }

    console.log(`[NewsData] Fetched ${allArticles.length} articles`);
    return allArticles;
  } catch (error: any) {
    console.error('[NewsData] Error:', error.message);
    throw error;
  }
}

// Fetch principal - COMBINE TOUS les providers
export async function fetchNewsWithFallback(): Promise<NewsArticle[]> {
  const allArticles: NewsArticle[] = [];

  // Fetch GNews
  try {
    console.log('[Fetch] Fetching GNews...');
    const gnewsArticles = await fetchFromGNews();
    console.log(`[Fetch] GNews: ${gnewsArticles.length} articles`);
    allArticles.push(...gnewsArticles);
  } catch (error) {
    console.warn('[Fetch] GNews failed');
  }

  // Fetch NewsData (EN PLUS, pas fallback)
  try {
    console.log('[Fetch] Fetching NewsData...');
    const newsdataArticles = await fetchFromNewsData();
    console.log(`[Fetch] NewsData: ${newsdataArticles.length} articles`);
    allArticles.push(...newsdataArticles);
  } catch (error) {
    console.warn('[Fetch] NewsData failed');
  }

  console.log(`[Fetch] TOTAL: ${allArticles.length} articles from all providers`);
  return allArticles;
}

// Distribution GARANTIE de 12 articles par catégorie
export function distributeByCategory(articles: NewsArticle[]): NewsArticle[] {
  const ALL_CATEGORIES = [
    'À la une', 'Tendances', 'Tech', 'Business', 'Finance', 'Santé', 'Sport',
    'Culture', 'Politique', 'Climat', 'Automobile', 'Lifestyle', 'People',
    'Gaming', 'Restauration', 'Science', 'International'
  ];

  const TARGET = 12;
  const result: NewsArticle[] = [];
  const categoryMap = new Map<string, NewsArticle[]>();
  const usedIds = new Set<string>();

  // Initialiser
  ALL_CATEGORIES.forEach(cat => categoryMap.set(cat, []));

  // Dédupliquer
  const uniqueArticles: NewsArticle[] = [];
  articles.forEach(article => {
    if (!usedIds.has(article.id)) {
      usedIds.add(article.id);
      uniqueArticles.push(article);
    }
  });

  console.log(`[Distribution] ${uniqueArticles.length} unique articles to distribute`);

  // Trier par date pour Tendances
  const sortedByDate = [...uniqueArticles].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

  // Remplir Tendances avec les 12 plus récents
  categoryMap.set('Tendances', sortedByDate.slice(0, TARGET));

  // Distribuer tous les articles selon leur catégorie
  for (const article of uniqueArticles) {
    const cat = article.category || 'À la une';
    if (ALL_CATEGORIES.includes(cat)) {
      const list = categoryMap.get(cat) || [];
      if (list.length < TARGET) {
        list.push(article);
        categoryMap.set(cat, list);
      }
    } else {
      // Catégorie non reconnue → À la une
      const alaune = categoryMap.get('À la une') || [];
      if (alaune.length < TARGET) {
        alaune.push(article);
        categoryMap.set('À la une', alaune);
      }
    }
  }

  console.log('[Distribution] After initial:');
  ALL_CATEGORIES.forEach(cat => {
    const count = categoryMap.get(cat)?.length || 0;
    console.log(`  ${cat}: ${count} articles`);
  });

  // REDISTRIBUTION ULTRA AGRESSIVE pour GARANTIR 12 partout
  console.log('[Distribution] Starting aggressive redistribution...');

  // Créer un pool GLOBAL de TOUS les articles
  const globalPool: NewsArticle[] = [...uniqueArticles];

  // Pour chaque catégorie, s'assurer qu'elle a exactement 12 articles
  ALL_CATEGORIES.forEach(cat => {
    const list = categoryMap.get(cat) || [];

    if (list.length < TARGET) {
      const needed = TARGET - list.length;
      console.log(`  ${cat}: has ${list.length}, needs ${needed} more`);

      // Remplir depuis le pool global
      let poolIdx = 0;
      while (list.length < TARGET && poolIdx < globalPool.length) {
        const article = { ...globalPool[poolIdx] };
        article.category = cat;
        article.id = `${article.id}-fill-${cat}-${list.length}`;
        list.push(article);
        poolIdx++;
      }

      // Si ENCORE pas assez, dupliquer en boucle
      if (list.length < TARGET && list.length > 0) {
        const baseList = [...list];
        while (list.length < TARGET) {
          const idx = list.length % baseList.length;
          const article = { ...baseList[idx] };
          article.id = `${article.id}-dup-${list.length}`;
          list.push(article);
        }
      }

      // Si TOUJOURS pas d'articles (catégorie complètement vide), prendre n'importe quoi
      if (list.length === 0 && globalPool.length > 0) {
        for (let i = 0; i < TARGET && i < globalPool.length; i++) {
          const article = { ...globalPool[i % globalPool.length] };
          article.category = cat;
          article.id = `${article.id}-emergency-${cat}-${i}`;
          list.push(article);
        }
      }

      categoryMap.set(cat, list);
    }
  });

  console.log('[Distribution] Final:');
  ALL_CATEGORIES.forEach(cat => {
    const articles = categoryMap.get(cat) || [];
    console.log(`  ${cat}: ${articles.length} articles`);
    result.push(...articles);
  });

  return result;
}
