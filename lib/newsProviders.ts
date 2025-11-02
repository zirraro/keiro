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

// ===== CACHE MÉMOIRE CÔTÉ SERVEUR (24 heures - optimisé pour max 1-2 appels/jour) =====
let cachedArticles: NewsArticle[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 heures (au lieu de 1h)

const parser = new Parser();

// ===== API PROVIDERS (fallback si RSS échoue) =====
const API_PROVIDERS = {
  gnews: {
    key: '14cef0dcc6437084dab9a432df281e98',
    baseUrl: 'https://gnews.io/api/v4',
  },
  newsdata: {
    key: 'pub_f0d6177c8ef44e26ab72a1723d21b088',
    baseUrl: 'https://newsdata.io/api/1',
  },
  eventregistry: {
    key: '22c2c608-833e-4050-8925-9e9f7e7e1cf9',
    baseUrl: 'https://eventregistry.org/api/v1',
  },
};

// ===== FLUX RSS FRANÇAIS - Source principale (pas de quota) =====
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

// Mots-clés ENRICHIS pour catégorisation intelligente
const CATEGORY_KEYWORDS: { [key: string]: string[] } = {
  'Tech': ['tech', 'technolog', 'ai', 'ia', 'intelligence artificielle', 'numér', 'digit', 'cyber', 'app', 'logiciel', 'software', 'internet', 'web', 'smartphone', 'google', 'apple', 'microsoft', 'meta', 'facebook', 'twitter', 'instagram', 'cloud', 'data', 'algorithme', 'robot', 'drone', '5g', 'blockchain', 'nft', 'chatgpt', 'openai', 'tesla', 'innovation', 'startup', 'github', 'api', 'netflix', 'spotify'],

  'Business': ['business', 'entreprise', 'entrepreneur', 'économ', 'startup', 'pme', 'société', 'pdg', 'ceo', 'dirigeant', 'manager', 'employé', 'travail', 'télétravail', 'recrutement', 'commerce', 'marketing', 'vente', 'client', 'croissance', 'investissement', 'acquisition', 'partenariat', 'chiffre d\'affaires', 'profit', 'business model'],

  'Finance': ['financ', 'banque', 'bourse', 'action', 'investissement', 'trading', 'crypto', 'bitcoin', 'ethereum', 'euro', 'dollar', 'taux', 'crédit', 'dette', 'inflation', 'cac 40', 'assurance', 'immobilier', 'patrimoine'],

  'Santé': ['santé', 'médic', 'médecin', 'hôpital', 'patient', 'maladie', 'cancer', 'covid', 'vaccin', 'traitement', 'pharmacie', 'nutrition', 'fitness', 'bien-être', 'mental', 'psycho', 'chirurgie'],

  'Sport': ['sport', 'foot', 'football', 'ligue 1', 'match', 'joueur', 'équipe', 'psg', 'om', 'tennis', 'rugby', 'basket', 'formule 1', 'olympique', 'champion', 'victoire', 'transfert'],

  'Culture': ['culture', 'film', 'cinéma', 'série', 'netflix', 'musique', 'concert', 'festival', 'cannes', 'oscar', 'théâtre', 'livre', 'musée', 'exposition'],

  'Politique': ['politique', 'gouvernement', 'ministre', 'président', 'macron', 'élection', 'vote', 'parlement', 'député', 'parti', 'loi', 'réforme', 'manifestation'],

  'Climat': ['climat', 'écologie', 'environnement', 'énergie', 'solaire', 'éolien', 'pollution', 'co2', 'réchauffement', 'biodiversité', 'transition'],

  'Automobile': ['auto', 'voiture', 'électrique', 'tesla', 'renault', 'peugeot', 'bmw', 'mercedes', 'salon', 'permis'],

  'Lifestyle': ['mode', 'fashion', 'beauté', 'voyage', 'maison', 'déco', 'mariage', 'luxe'],

  'People': ['célébrité', 'star', 'acteur', 'chanteur', 'influenceur', 'couple', 'mariage', 'scandale'],

  'Gaming': ['gaming', 'jeu vidéo', 'gamer', 'playstation', 'xbox', 'nintendo', 'fortnite', 'esport'],

  'Restauration': ['restaurant', 'cuisine', 'chef', 'gastronomie', 'michelin', 'vin'],

  'Science': ['science', 'recherche', 'découverte', 'espace', 'nasa', 'physique', 'chimie'],

  'International': ['international', 'monde', 'guerre', 'conflit', 'onu', 'états-unis', 'chine', 'russie', 'ukraine'],

  'Tendances': ['tendance', 'viral', 'buzz', 'nouveau', 'must'],
};

// Catégoriser avec scoring pondéré (titre = 3x description)
function categorizeArticle(title: string, description: string): string {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();

  let bestCategory = 'À la une';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (titleLower.includes(kw)) score += 3;
      if (descLower.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

// ===== FETCH RSS (source principale) =====
async function fetchFromRSS(): Promise<NewsArticle[]> {
  console.log('[RSS] Fetching from RSS feeds...');
  const allArticles: NewsArticle[] = [];
  let articleCounter = 0;

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed, feedIndex) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        const articles: NewsArticle[] = [];

        for (const item of parsed.items.slice(0, 5)) {
          const title = item.title?.trim() || '';
          const description = item.contentSnippet?.trim() || item.content?.trim() || '';
          const url = item.link || '';
          const image = item.enclosure?.url || item.media?.thumbnail?.url || undefined;

          if (!title || !url) continue;

          const detectedCategory = categorizeArticle(title, description);

          articles.push({
            id: `rss-${feedIndex}-${articleCounter++}`,
            title,
            description,
            url,
            image,
            source: parsed.title || feed.url,
            date: item.pubDate || new Date().toISOString(),
            category: detectedCategory,
          });
        }

        return articles;
      } catch (error: any) {
        console.error(`[RSS] Error fetching ${feed.url}:`, error.message);
        return [];
      }
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
    }
  }

  console.log(`[RSS] Fetched ${allArticles.length} articles from RSS`);
  return allArticles;
}

// ===== FETCH API PROVIDERS (fallback) =====
async function fetchFromAPIs(): Promise<NewsArticle[]> {
  console.log('[API] Fetching from API providers (fallback)...');
  const allArticles: NewsArticle[] = [];

  // GNews API
  try {
    const response = await fetch(
      `${API_PROVIDERS.gnews.baseUrl}/top-headlines?token=${API_PROVIDERS.gnews.key}&lang=fr&max=50`
    );
    const data = await response.json();

    if (data.articles) {
      data.articles.forEach((article: any, idx: number) => {
        const title = article.title || '';
        const description = article.description || '';
        const detectedCategory = categorizeArticle(title, description);

        allArticles.push({
          id: `gnews-${idx}`,
          title,
          description,
          url: article.url,
          image: article.image,
          source: article.source?.name || 'GNews',
          date: article.publishedAt,
          category: detectedCategory,
        });
      });
    }
    console.log(`[API] GNews: ${data.articles?.length || 0} articles`);
  } catch (error: any) {
    console.error('[API] GNews error:', error.message);
  }

  // NewsData.io API
  try {
    const response = await fetch(
      `${API_PROVIDERS.newsdata.baseUrl}/news?apikey=${API_PROVIDERS.newsdata.key}&language=fr&size=50`
    );
    const data = await response.json();

    if (data.results) {
      data.results.forEach((article: any, idx: number) => {
        const title = article.title || '';
        const description = article.description || '';
        const detectedCategory = categorizeArticle(title, description);

        allArticles.push({
          id: `newsdata-${idx}`,
          title,
          description,
          url: article.link,
          image: article.image_url,
          source: article.source_id || 'NewsData',
          date: article.pubDate,
          category: detectedCategory,
        });
      });
    }
    console.log(`[API] NewsData: ${data.results?.length || 0} articles`);
  } catch (error: any) {
    console.error('[API] NewsData error:', error.message);
  }

  console.log(`[API] Total from APIs: ${allArticles.length} articles`);
  return allArticles;
}

// ===== DÉDUPLICATION =====
function deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const unique: NewsArticle[] = [];

  for (const article of articles) {
    const key = article.url.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(article);
    }
  }

  console.log(`[Dedup] ${articles.length} → ${unique.length} articles (removed ${articles.length - unique.length} duplicates)`);
  return unique;
}

// ===== FILTRAGE (articles sans image) =====
function filterArticles(articles: NewsArticle[]): NewsArticle[] {
  const filtered = articles.filter(a => a.image && a.image.trim() !== '');
  console.log(`[Filter] ${articles.length} → ${filtered.length} articles (removed ${articles.length - filtered.length} without images)`);
  return filtered;
}

// ===== FONCTION PRINCIPALE =====
export async function fetchNews(): Promise<NewsArticle[]> {
  // Vérifier le cache
  const now = Date.now();
  if (cachedArticles && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log(`[Cache] Returning ${cachedArticles.length} cached articles (age: ${Math.round((now - cacheTimestamp) / 1000 / 60)}min)`);
    return cachedArticles;
  }

  console.log('[Fetch] Cache expired or empty, fetching fresh news...');

  try {
    // Essayer RSS d'abord
    let articles = await fetchFromRSS();

    // Si RSS échoue ou retourne peu de résultats, fallback vers APIs
    if (articles.length < 20) {
      console.log(`[Fallback] RSS returned only ${articles.length} articles, trying APIs...`);
      const apiArticles = await fetchFromAPIs();
      articles = [...articles, ...apiArticles];
    }

    // Déduplication
    articles = deduplicateArticles(articles);

    // Filtrage (garder uniquement avec images)
    articles = filterArticles(articles);

    // Mettre en cache
    cachedArticles = articles;
    cacheTimestamp = now;

    console.log(`[Success] Cached ${articles.length} articles for 24h`);
    return articles;
  } catch (error: any) {
    console.error('[Error] Failed to fetch news:', error.message);

    // En cas d'erreur, retourner cache même périmé si disponible
    if (cachedArticles) {
      console.log('[Fallback] Returning stale cache');
      return cachedArticles;
    }

    return [];
  }
}
