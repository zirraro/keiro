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
  // À la une - flux généraux fiables
  { url: 'https://www.lemonde.fr/rss/une.xml', category: 'À la une', timeout: 8000 },
  { url: 'https://www.francetvinfo.fr/titres.rss', category: 'À la une', timeout: 8000 },
  { url: 'https://www.20minutes.fr/feeds/rss-une.xml', category: 'À la une', timeout: 8000 },

  // Tech - flux tech fiables
  { url: 'https://www.numerama.com/feed/', category: 'Tech', timeout: 8000 },
  { url: 'https://www.01net.com/rss/info.xml', category: 'Tech', timeout: 8000 },
  { url: 'https://www.clubic.com/feed/', category: 'Tech', timeout: 8000 },
  { url: 'https://www.journaldunet.com/rss/', category: 'Tech', timeout: 8000 },

  // Business
  { url: 'https://www.challenges.fr/rss/une.xml', category: 'Business', timeout: 8000 },
  { url: 'https://www.capital.fr/rss', category: 'Business', timeout: 8000 },
  { url: 'https://www.lesechos.fr/rss.xml', category: 'Business', timeout: 8000 },

  // Finance
  { url: 'https://www.boursorama.com/bourse/rss/actualites/toutes', category: 'Finance', timeout: 8000 },
  { url: 'https://www.latribune.fr/rss/a-la-une.html', category: 'Finance', timeout: 8000 },

  // Santé
  { url: 'https://www.pourquoidocteur.fr/RSS/RSS.xml', category: 'Santé', timeout: 8000 },
  { url: 'https://www.santemagazine.fr/rss.xml', category: 'Santé', timeout: 8000 },

  // Sport
  { url: 'https://www.lequipe.fr/rss/actu_rss.xml', category: 'Sport', timeout: 8000 },
  { url: 'https://www.sports.fr/feed/', category: 'Sport', timeout: 8000 },

  // Culture
  { url: 'https://www.allocine.fr/rss/news.xml', category: 'Culture', timeout: 8000 },
  { url: 'https://www.premiere.fr/rss', category: 'Culture', timeout: 8000 },

  // Politique
  { url: 'https://www.lemonde.fr/politique/rss_full.xml', category: 'Politique', timeout: 8000 },
  { url: 'https://www.francetvinfo.fr/politique.rss', category: 'Politique', timeout: 8000 },

  // International
  { url: 'https://www.france24.com/fr/rss', category: 'International', timeout: 8000 },
  { url: 'https://www.lemonde.fr/international/rss_full.xml', category: 'International', timeout: 8000 },

  // Automobile
  { url: 'https://www.automobile-magazine.fr/rss.xml', category: 'Automobile', timeout: 8000 },
  { url: 'https://www.largus.fr/rss.xml', category: 'Automobile', timeout: 8000 },

  // Lifestyle
  { url: 'https://www.elle.fr/rss.xml', category: 'Lifestyle', timeout: 8000 },
  { url: 'https://www.marieclaire.fr/rss.xml', category: 'Lifestyle', timeout: 8000 },

  // Gaming
  { url: 'https://www.jeuxvideo.com/rss/rss.xml', category: 'Gaming', timeout: 8000 },
  { url: 'https://www.journaldugeek.com/feed/', category: 'Gaming', timeout: 8000 },

  // Science
  { url: 'https://www.sciencesetavenir.fr/rss.xml', category: 'Science', timeout: 8000 },
  { url: 'https://www.futura-sciences.com/rss/actualites.xml', category: 'Science', timeout: 8000 },

  // Climat
  { url: 'https://www.geo.fr/rss.xml', category: 'Climat', timeout: 8000 },
  { url: 'https://www.lemonde.fr/planete/rss_full.xml', category: 'Climat', timeout: 8000 },

  // People
  { url: 'https://www.purepeople.com/rss.xml', category: 'People', timeout: 8000 },
  { url: 'https://www.gala.fr/rss.xml', category: 'People', timeout: 8000 },

  // Restauration
  { url: 'https://www.atablecheznanou.com/feed/', category: 'Restauration', timeout: 8000 },
  { url: 'https://www.750g.com/rss.xml', category: 'Restauration', timeout: 8000 },

  // Tendances
  { url: 'https://www.konbini.com/fr/feed/', category: 'Tendances', timeout: 8000 },
  { url: 'https://www.aufeminin.com/rss.xml', category: 'Tendances', timeout: 8000 },
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

  'People': ['célébrité', 'star', 'acteur', 'actrice', 'chanteur', 'chanteuse', 'influenceur', 'influenceuse', 'couple', 'mariage', 'scandale', 'divorce', 'séparation', 'romance', 'relation', 'people', 'pipole', 'nabilla', 'cyril hanouna', 'kylian mbappé', 'beyoncé', 'rihanna', 'johnny depp', 'angelina jolie', 'brad pitt', 'kim kardashian', 'kanye west', 'beyonce', 'shakira', 'gims', 'jul', 'ninho', 'booba', 'kaaris', 'shy\'m', 'jenifer', 'florent pagny', 'daft punk', 'david guetta', 'dj snake', 'stromae', 'angèle', 'aya nakamura', 'soprano', 'maître gims', 'bigflo', 'oli', 'orelsan', 'black m', 'kendji girac', 'louane', 'slimane', 'vianney', 'clara luciani', 'juliette armanet', 'pomme', 'yseult', 'lomepal', 'nekfeu', 'pnl', 'damso', 'laylow', 'freeze corleone', 'gazo', 'tiakola', 'real madrid', 'neymar', 'messi', 'ronaldo', 'benzema', 'griezmann', 'pogba', 'kante', 'giroud', 'deschamps', 'zidane', 'omar sy', 'gad elmaleh', 'jamel debbouze', 'kev adams', 'florence foresti', 'patrick bruel', 'julien doré', 'vanessa paradis', 'johnny hallyday', 'laeticia hallyday', 'laura smet', 'david hallyday', 'carla bruni', 'nicolas sarkozy', 'julie gayet', 'françois hollande', 'valérie trierweiler', 'brigitte macron', 'emmanuel macron', 'lady gaga', 'ariana grande', 'justin bieber', 'selena gomez', 'taylor swift', 'billie eilish', 'dua lipa', 'the weeknd', 'drake', 'bad bunny', 'rosalía', 'harry styles', 'ed sheeran', 'adele', 'sam smith', 'lizzo', 'cardi b', 'megan thee stallion', 'nicki minaj', 'eminem', 'kanye', 'jay-z', 'snoop dogg', 'dr dre', 'kendrick lamar', 'j cole', 'post malone', 'travis scott', 'lil nas x', 'doja cat', 'saweetie', 'ice spice', 'leonardo dicaprio', 'tom cruise', 'will smith', 'denzel washington', 'morgan freeman', 'samuel l jackson', 'robert downey jr', 'chris hemsworth', 'chris evans', 'scarlett johansson', 'jennifer lawrence', 'emma watson', 'emma stone', 'margot robbie', 'zendaya', 'timothée chalamet', 'tom holland', 'andrew garfield', 'ryan gosling', 'ryan reynolds', 'blake lively', 'gigi hadid', 'bella hadid', 'kendall jenner', 'kylie jenner', 'khloe kardashian', 'kourtney kardashian', 'kris jenner', 'travis barker', 'machine gun kelly', 'megan fox', 'amber heard', 'elon musk', 'jeff bezos', 'mark zuckerberg', 'bill gates'],

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

// ===== FETCH RSS (source principale) avec timeout et retry =====
async function fetchFromRSS(): Promise<NewsArticle[]> {
  console.log('[RSS] Fetching from RSS feeds...');
  const allArticles: NewsArticle[] = [];
  let articleCounter = 0;

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed, feedIndex) => {
      try {
        // Timeout pour éviter les blocages
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), feed.timeout || 8000);

        const parsed = await parser.parseURL(feed.url);
        clearTimeout(timeoutId);

        const articles: NewsArticle[] = [];

        for (const item of parsed.items.slice(0, 12)) {
          const title = item.title?.trim() || '';
          const description = item.contentSnippet?.trim() || item.content?.trim() || item.summary?.trim() || '';
          const url = item.link || '';

          // Essayer plusieurs façons de récupérer l'image
          let image = item.enclosure?.url ||
                     item['media:thumbnail']?.$ ?.url ||
                     item['media:content']?.$ ?.url ||
                     undefined;

          // Certains flux mettent l'image dans le contenu HTML
          if (!image && item.content) {
            const imgMatch = item.content.match(/<img[^>]+src="([^"]+)"/);
            if (imgMatch) image = imgMatch[1];
          }

          if (!title || !url) continue;

          // CATÉGORISATION : priorité au flux RSS, recatégorisation uniquement pour flux génériques
          let detectedCategory = feed.category;

          // Pour les flux génériques (À la une, Tendances), utiliser la catégorisation auto
          if (feed.category === 'À la une' || feed.category === 'Tendances') {
            const autoCategory = categorizeArticle(title, description);
            detectedCategory = autoCategory;
          }
          // Pour les flux spécialisés, TOUJOURS garder leur catégorie
          // (ex: un flux Tech reste Tech, un flux Sport reste Sport)

          articles.push({
            id: `rss-${feedIndex}-${articleCounter++}`,
            title,
            description,
            url,
            image,
            source: parsed.title || new URL(feed.url).hostname,
            date: item.pubDate || item.isoDate || new Date().toISOString(),
            category: detectedCategory,
          });
        }

        if (articles.length > 0) {
          console.log(`[RSS] ✅ ${feed.category}: ${articles.length} articles from ${new URL(feed.url).hostname}`);
        }

        return articles;
      } catch (error: any) {
        console.error(`[RSS] ❌ ${feed.category} (${new URL(feed.url).hostname}): ${error.message}`);
        return [];
      }
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
    }
  }

  console.log(`[RSS] Total: ${allArticles.length} articles fetched`);

  // Log du nombre d'articles par catégorie
  const byCategory: { [key: string]: number } = {};
  allArticles.forEach(article => {
    byCategory[article.category || 'Unknown'] = (byCategory[article.category || 'Unknown'] || 0) + 1;
  });
  console.log('[RSS] Articles par catégorie:', byCategory);

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

// ===== FILTRAGE (articles sans image) - Plus permissif =====
function filterArticles(articles: NewsArticle[]): NewsArticle[] {
  // Garder les articles avec image, mais aussi garder au moins quelques articles par catégorie même sans image
  const withImages = articles.filter(a => a.image && a.image.trim() !== '');

  // Si on a suffisamment d'articles avec images, on les retourne
  if (withImages.length >= 50) {
    console.log(`[Filter] ${articles.length} → ${withImages.length} articles (removed ${articles.length - withImages.length} without images)`);
    return withImages;
  }

  // Sinon, on garde aussi des articles sans image pour garantir du contenu
  console.log(`[Filter] Keeping all ${articles.length} articles (not enough with images: ${withImages.length})`);
  return articles;
}

// ===== FONCTION PRINCIPALE =====
export async function fetchNews(): Promise<NewsArticle[]> {
  // Vérifier le cache
  const now = Date.now();
  if (cachedArticles && (now - cacheTimestamp) < CACHE_DURATION) {
    const ageMinutes = Math.round((now - cacheTimestamp) / 1000 / 60);
    console.log(`[Cache] ✅ Returning ${cachedArticles.length} cached articles (age: ${ageMinutes}min / ${Math.round(ageMinutes / 60)}h)`);

    // Log du nombre d'articles par catégorie dans le cache
    const byCategory: { [key: string]: number } = {};
    cachedArticles.forEach(article => {
      byCategory[article.category || 'Unknown'] = (byCategory[article.category || 'Unknown'] || 0) + 1;
    });
    console.log('[Cache] Articles par catégorie:', byCategory);

    return cachedArticles;
  }

  console.log('[Fetch] 🔄 Cache expired or empty, fetching fresh news...');

  try {
    // Essayer RSS d'abord
    let articles = await fetchFromRSS();

    // Si RSS échoue ou retourne peu de résultats, fallback vers APIs
    if (articles.length < 30) {
      console.log(`[Fallback] RSS returned only ${articles.length} articles, trying APIs...`);
      const apiArticles = await fetchFromAPIs();
      articles = [...articles, ...apiArticles];
    }

    // Déduplication
    articles = deduplicateArticles(articles);

    // Filtrage (garder uniquement avec images si suffisamment)
    articles = filterArticles(articles);

    // Vérifier qu'on a des articles pour chaque catégorie
    const byCategory: { [key: string]: number } = {};
    articles.forEach(article => {
      byCategory[article.category || 'Unknown'] = (byCategory[article.category || 'Unknown'] || 0) + 1;
    });

    const emptyCategories = Object.keys(CATEGORY_KEYWORDS).filter(cat => !byCategory[cat] || byCategory[cat] === 0);
    if (emptyCategories.length > 0) {
      console.warn(`[Warning] Catégories vides: ${emptyCategories.join(', ')}`);
    }

    // Mettre en cache
    cachedArticles = articles;
    cacheTimestamp = now;

    console.log(`[Success] ✅ Cached ${articles.length} articles for 24h`);
    console.log('[Success] Articles par catégorie:', byCategory);
    return articles;
  } catch (error: any) {
    console.error('[Error] ❌ Failed to fetch news:', error.message);

    // En cas d'erreur, retourner cache même périmé si disponible
    if (cachedArticles) {
      console.log('[Fallback] ⚠️ Returning stale cache');
      return cachedArticles;
    }

    return [];
  }
}
