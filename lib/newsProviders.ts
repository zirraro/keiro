export const runtime = "nodejs";

import Parser from "rss-parser";

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

// ===== CACHE MÉMOIRE CÔTÉ SERVEUR (1 heure) =====
let cachedArticles: NewsArticle[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 heure

const parser = new Parser();

// ===== FLUX RSS FRANÇAIS - Pas de quota, pas de clé API =====
const RSS_FEEDS = [
  // Actualité générale française
  { url: 'https://www.lemonde.fr/rss/une.xml', category: 'À la une' },
  { url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml', category: 'À la une' },
  { url: 'https://www.francetvinfo.fr/titres.rss', category: 'À la une' },
  { url: 'https://www.lexpress.fr/rss/alaune.xml', category: 'Tendances' },

  // Tech
  { url: 'https://www.01net.com/rss/info.xml', category: 'Tech' },
  { url: 'https://www.numerama.com/feed/', category: 'Tech' },
  { url: 'https://www.usine-digitale.fr/rss/news.xml', category: 'Tech' },
  { url: 'https://www.lesechos.fr/rss/rss_tech_medias.xml', category: 'Tech' },

  // Business & Finance
  { url: 'https://www.challenges.fr/rss/une.xml', category: 'Business' },
  { url: 'https://www.capital.fr/rss', category: 'Business' },
  { url: 'https://bfmbusiness.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/', category: 'Business' },
  { url: 'https://www.latribune.fr/rss/a-la-une.html', category: 'Finance' },
  { url: 'https://www.boursorama.com/bourse/rss/actualites/toutes', category: 'Finance' },

  // Santé
  { url: 'https://www.santemagazine.fr/rss.xml', category: 'Santé' },
  { url: 'https://www.topsante.com/rss.xml', category: 'Santé' },

  // Sport
  { url: 'https://www.lequipe.fr/rss/actu_rss.xml', category: 'Sport' },
  { url: 'https://www.eurosport.fr/rss.xml', category: 'Sport' },

  // Culture
  { url: 'https://www.allocine.fr/rss/news.xml', category: 'Culture' },
  { url: 'https://www.telerama.fr/rss.xml', category: 'Culture' },

  // Politique
  { url: 'https://www.nouvelobs.com/rss.xml', category: 'Politique' },

  // International
  { url: 'https://www.france24.com/fr/rss', category: 'International' },

  // Automobile
  { url: 'https://www.automobile-magazine.fr/rss.xml', category: 'Automobile' },
  { url: 'https://www.caradisiac.com/rss.xml', category: 'Automobile' },

  // Lifestyle
  { url: 'https://www.elle.fr/rss.xml', category: 'Lifestyle' },
  { url: 'https://www.marieclaire.fr/rss.xml', category: 'Lifestyle' },

  // Gaming
  { url: 'https://www.jeuxvideo.com/rss/rss.xml', category: 'Gaming' },
  { url: 'https://www.gamekult.com/feed.xml', category: 'Gaming' },

  // Science
  { url: 'https://www.sciencesetavenir.fr/rss.xml', category: 'Science' },

  // Climat
  { url: 'https://www.geo.fr/rss.xml', category: 'Climat' },
];

// Mots-clés pour catégorisation automatique
const CATEGORY_KEYWORDS: { [key: string]: string[] } = {
  'Tech': ['tech', 'technolog', 'ai', 'ia', 'numér', 'digit', 'cyber', 'app', 'internet', 'ordin', 'comput', 'phone', 'mobile', 'google', 'apple', 'microsoft'],
  'Business': ['business', 'entrepr', 'économ', 'econom', 'startup', 'sociét', 'compan'],
  'Finance': ['financ', 'banqu', 'bank', 'bours', 'stock', 'crypto', 'bitcoin'],
  'Santé': ['santé', 'health', 'médic', 'hôpit', 'vaccin', 'virus'],
  'Sport': ['sport', 'foot', 'tennis', 'rugby', 'match', 'joueur', 'équip'],
  'Culture': ['cultur', 'film', 'cinéma', 'série', 'musiqu', 'concert'],
  'Politique': ['politiq', 'élection', 'président', 'gouvern', 'loi'],
  'Climat': ['climat', 'environ', 'écolog', 'énerg', 'pollut'],
  'Automobile': ['auto', 'voitur', 'électriq', 'tesla', 'conduit'],
  'Lifestyle': ['lifestyle', 'mode', 'fashion', 'voyag', 'beauté'],
  'People': ['céléb', 'star', 'acteur', 'influen'],
  'Gaming': ['gam', 'jeu', 'esport', 'playstation', 'xbox'],
  'Restauration': ['restaurant', 'cuisin', 'chef', 'gastro'],
  'Science': ['scien', 'recherch', 'découvert', 'espace'],
  'International': ['internation', 'monde', 'global', 'guerre'],
};

// Catégoriser un article
function categorizeArticle(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  let bestCategory = 'À la une';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

// ===== FETCH RSS FEEDS =====
async function fetchFromRSS(): Promise<NewsArticle[]> {
  console.log('[RSS] Fetching from RSS feeds...');
  const allArticles: NewsArticle[] = [];

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        const articles = parsed.items.slice(0, 20).map((item) => {
          const title = item.title || 'Sans titre';
          const description = (item.contentSnippet || item.content || '').replace(/\s+/g, ' ').trim().slice(0, 200);

          return {
            id: `rss-${Buffer.from(item.link || '').toString('base64').substring(0, 16)}`,
            title,
            description,
            url: item.link || '',
            image: (item as any)?.enclosure?.url || (item as any)?.['media:content']?.$?.url,
            source: parsed.title?.split(' - ')[0] || feed.category,
            date: (item as any).isoDate || item.pubDate,
            category: feed.category || categorizeArticle(title, description),
          } as NewsArticle;
        });

        console.log(`[RSS] ${feed.category}: ${articles.length} articles from ${feed.url}`);
        return articles;
      } catch (err) {
        console.warn(`[RSS] Failed to fetch ${feed.url}:`, err);
        return [];
      }
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
    }
  }

  // Dédupliquer par URL
  const seen = new Set<string>();
  const deduplicated = allArticles.filter((article) => {
    if (seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });

  console.log(`[RSS] TOTAL: ${deduplicated.length} articles après déduplication`);
  return deduplicated;
}

// ===== FETCH AVEC CACHE =====
export async function fetchNewsWithFallback(): Promise<NewsArticle[]> {
  const now = Date.now();

  // Vérifier le cache
  if (cachedArticles && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log(`[Cache] Using cached articles (${cachedArticles.length} articles, ${Math.round((now - cacheTimestamp) / 1000 / 60)}min old)`);
    return cachedArticles;
  }

  console.log('[Fetch] Cache expired or empty, fetching fresh news...');

  // Fetch depuis RSS
  const articles = await fetchFromRSS();

  if (articles.length > 50) {
    // Mettre en cache
    cachedArticles = articles;
    cacheTimestamp = now;
    console.log(`[Cache] Cached ${articles.length} articles for 1 hour`);
    return articles;
  }

  // Si échec RSS, utiliser cache expiré si disponible
  if (cachedArticles && cachedArticles.length > 0) {
    console.warn('[Fetch] RSS failed but using stale cache');
    return cachedArticles;
  }

  // Dernier recours: quelques exemples pour test
  console.error('[Fetch] All sources failed, returning empty array');
  return [];
}

// ===== DISTRIBUTION GARANTIE =====
export function distributeByCategory(articles: NewsArticle[]): NewsArticle[] {
  const ALL_CATEGORIES = [
    'À la une', 'Tendances', 'Tech', 'Business', 'Finance',
    'Santé', 'Sport', 'Culture', 'Politique', 'Climat',
    'Automobile', 'Lifestyle', 'People', 'Gaming',
    'Restauration', 'Science', 'International'
  ];

  const TARGET = 12;

  // Grouper par catégorie
  const categoryMap = new Map<string, NewsArticle[]>();
  ALL_CATEGORIES.forEach((cat) => categoryMap.set(cat, []));

  // Dédupliquer
  const seen = new Set<string>();
  const uniqueArticles: NewsArticle[] = [];
  for (const article of articles) {
    const key = article.url || article.title;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueArticles.push(article);
    }
  }

  console.log(`[Distribution] ${uniqueArticles.length} unique articles to distribute`);

  // Distribuer selon catégorie assignée
  for (const article of uniqueArticles) {
    const cat = article.category || 'À la une';
    const list = categoryMap.get(cat);
    if (list && list.length < TARGET) {
      list.push(article);
    }
  }

  // REMPLISSAGE FORCÉ: si catégorie < 12, dupliquer depuis toutes les actus
  ALL_CATEGORIES.forEach((cat) => {
    const list = categoryMap.get(cat) || [];
    if (list.length < TARGET && uniqueArticles.length > 0) {
      let idx = 0;
      while (list.length < TARGET) {
        const article = { ...uniqueArticles[idx % uniqueArticles.length] };
        article.category = cat;
        article.id = `${article.id}-fill-${cat}-${list.length}`;
        list.push(article);
        idx++;
      }
      console.log(`[Distribution] ${cat}: filled to ${list.length} articles`);
    }
    categoryMap.set(cat, list.slice(0, TARGET));
  });

  // Combiner tout
  const result: NewsArticle[] = [];
  for (const list of categoryMap.values()) {
    result.push(...list);
  }

  console.log(`[Distribution] Final: ${result.length} articles distributed`);
  return result;
}
