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
// Timeouts réduits à 5000ms pour chargement plus rapide
const RSS_FEEDS = [
  // À la une - flux généraux fiables
  { url: 'https://www.lemonde.fr/rss/une.xml', category: 'À la une', timeout: 5000 },
  { url: 'https://www.francetvinfo.fr/titres.rss', category: 'À la une', timeout: 5000 },
  { url: 'https://www.20minutes.fr/feeds/rss-une.xml', category: 'À la une', timeout: 5000 },

  // Tech - flux tech fiables
  { url: 'https://www.numerama.com/feed/', category: 'Tech', timeout: 5000 },
  { url: 'https://www.01net.com/rss/info.xml', category: 'Tech', timeout: 5000 },
  { url: 'https://www.clubic.com/feed/', category: 'Tech', timeout: 5000 },
  { url: 'https://www.journaldunet.com/rss/', category: 'Tech', timeout: 5000 },

  // Business
  { url: 'https://www.challenges.fr/rss/une.xml', category: 'Business', timeout: 5000 },
  { url: 'https://www.capital.fr/rss', category: 'Business', timeout: 5000 },
  { url: 'https://www.lesechos.fr/rss.xml', category: 'Business', timeout: 5000 },

  // Finance
  { url: 'https://www.boursorama.com/bourse/rss/actualites/toutes', category: 'Finance', timeout: 5000 },
  { url: 'https://www.latribune.fr/rss/a-la-une.html', category: 'Finance', timeout: 5000 },

  // Santé
  { url: 'https://www.pourquoidocteur.fr/RSS/RSS.xml', category: 'Santé', timeout: 5000 },
  { url: 'https://www.santemagazine.fr/rss.xml', category: 'Santé', timeout: 5000 },

  // Sport
  { url: 'https://www.lequipe.fr/rss/actu_rss.xml', category: 'Sport', timeout: 5000 },
  { url: 'https://www.sports.fr/feed/', category: 'Sport', timeout: 5000 },

  // Culture
  { url: 'https://www.allocine.fr/rss/news.xml', category: 'Culture', timeout: 5000 },
  { url: 'https://www.premiere.fr/rss', category: 'Culture', timeout: 5000 },

  // Politique
  { url: 'https://www.lemonde.fr/politique/rss_full.xml', category: 'Politique', timeout: 5000 },
  { url: 'https://www.francetvinfo.fr/politique.rss', category: 'Politique', timeout: 5000 },

  // International
  { url: 'https://www.france24.com/fr/rss', category: 'International', timeout: 5000 },
  { url: 'https://www.lemonde.fr/international/rss_full.xml', category: 'International', timeout: 5000 },

  // Automobile
  { url: 'https://www.automobile-magazine.fr/rss.xml', category: 'Automobile', timeout: 5000 },
  { url: 'https://www.largus.fr/rss.xml', category: 'Automobile', timeout: 5000 },

  // Lifestyle
  { url: 'https://www.elle.fr/rss.xml', category: 'Lifestyle', timeout: 5000 },
  { url: 'https://www.marieclaire.fr/rss.xml', category: 'Lifestyle', timeout: 5000 },

  // Gaming
  { url: 'https://www.jeuxvideo.com/rss/rss.xml', category: 'Gaming', timeout: 5000 },
  { url: 'https://www.journaldugeek.com/feed/', category: 'Gaming', timeout: 5000 },

  // Science
  { url: 'https://www.sciencesetavenir.fr/rss.xml', category: 'Science', timeout: 5000 },
  { url: 'https://www.futura-sciences.com/rss/actualites.xml', category: 'Science', timeout: 5000 },

  // Climat
  { url: 'https://www.geo.fr/rss.xml', category: 'Climat', timeout: 5000 },
  { url: 'https://www.lemonde.fr/planete/rss_full.xml', category: 'Climat', timeout: 5000 },

  // People
  { url: 'https://www.purepeople.com/rss.xml', category: 'People', timeout: 5000 },
  { url: 'https://www.gala.fr/rss.xml', category: 'People', timeout: 5000 },

  // Musique - NOUVELLE CATÉGORIE
  { url: 'https://www.chartsinfrance.net/rss.xml', category: 'Musique', timeout: 5000 },
  { url: 'https://www.lesinrocks.com/musique/feed/', category: 'Musique', timeout: 5000 },
  { url: 'https://www.radiofrance.fr/francemusique/rss', category: 'Musique', timeout: 5000 },

  // Restauration
  { url: 'https://www.atablecheznanou.com/feed/', category: 'Restauration', timeout: 5000 },
  { url: 'https://www.750g.com/rss.xml', category: 'Restauration', timeout: 5000 },

  // Tendances - Flux variés couvrant lifestyle, pop culture, buzz, viral
  { url: 'https://www.konbini.com/fr/feed/', category: 'Tendances', timeout: 5000 },
  { url: 'https://www.aufeminin.com/rss.xml', category: 'Tendances', timeout: 5000 },
  { url: 'https://www.grazia.fr/rss.xml', category: 'Tendances', timeout: 5000 },
  { url: 'https://www.cosmopolitan.fr/rss.xml', category: 'Tendances', timeout: 5000 },
  { url: 'https://hitek.fr/feed', category: 'Tendances', timeout: 5000 },
  { url: 'https://www.demotivateur.fr/feed', category: 'Tendances', timeout: 5000 },
];

// Mots-clés ENRICHIS pour catégorisation intelligente
const CATEGORY_KEYWORDS: { [key: string]: string[] } = {
  'Automobile': [
    'renault', 'peugeot', 'citroën', 'ds', 'alpine', 'bugatti', 'tesla', 'bmw', 'mercedes', 'audi',
    'volkswagen', 'toyota', 'hyundai', 'kia', 'ford', 'porsche', 'ferrari', 'lamborghini', 'voiture électrique', 'voiture hybride',
    'voiture essence', 'voiture diesel', 'suv', 'berline', 'citadine', 'sportive', 'batterie', 'autonomie', 'recharge', 'borne',
    'superchargeur', 'pile à combustible', 'hydrogène', 'salon auto', 'mondial de l'auto', 'essai', 'comparatif', 'nouveauté', 'lancement', 'permis de conduire',
    'code de la route', 'sécurité routière', 'accident', 'assurance auto', 'contrôle technique', 'rolls-royce', 'bentley', 'maserati', 'aston martin', 'mclaren',
    'byd', 'nio', 'xpeng', 'geely'
  ],

  'Musique': [
    'aya nakamura', 'gims', 'stromae', 'angèle', 'orelsan', 'nekfeu', 'soprano', 'jul', 'sch', 'ninho',
    'pnl', 'booba', 'niska', 'dadju', 'maître gims', 'taylor swift', 'beyoncé', 'drake', 'the weeknd', 'billie eilish',
    'ariana grande', 'ed sheeran', 'rihanna', 'kanye west', 'travis scott', 'rap', 'hip-hop', 'pop', 'rock', 'électro',
    'house', 'techno', 'edm', 'r&b', 'soul', 'jazz', 'classique', 'metal', 'punk', 'concert',
    'tournée', 'festival', 'coachella', 'lollapalooza', 'rock en seine', 'hellfest', 'solidays', 'printemps de bourges', 'album', 'single',
    'ep', 'clip', 'streaming', 'spotify', 'deezer', 'apple music', 'youtube music', 'charts', 'billboard', 'top 50',
    'grammy', 'nrj music awards', 'victoires de la musique', 'mtv awards', 'featuring', 'feat', 'ft', 'collaboration', 'remix', 'cover',
    'acoustique', 'live', 'concert live'
  ],

  'People': [
    'kylian mbappé', 'zinedine zidane', 'tony parker', 'marion cotillard', 'léa seydoux', 'vincent cassel', 'squeezie', 'cyprien', 'norman', 'enjoy phoenix',
    'caroline receveur', 'léna situations', 'les marseillais', 'les ch'tis', 'koh-lanta', 'secret story', 'paparazzi', 'jet-set', 'vie privée', 'liaison',
    'rupture', 'fiançailles', 'baby bump', 'grossesse', 'accouchement'
  ],

  'Tech': [
    'ia générative', 'llm', 'gpt', 'gemini', 'bard', 'copilot', 'github', 'gitlab', 'typescript', 'react',
    'next.js', 'vue', 'angular', 'ransomware', 'phishing', 'data breach', 'fuite de données', 'rgpd', 'defi', 'staking',
    'wallet', 'exchange', 'binance', 'coinbase', 'stablecoin'
  ],

  'Finance': [
    'trading', 'trader', 'dividende', 'indice boursier', 's&p 500', 'dow jones', 'nasdaq', 'obligations', 'forex', 'bnp paribas',
    'société générale', 'crédit agricole', 'la banque postale', 'boursorama', 'revolut', 'n26', 'lydia', 'paypal', 'stripe', 'klarna'
  ],

  'Business': [
    'blablacar', 'doctolib', 'contentsquare', 'mirakl', 'back market', 'vinted', 'amazon', 'alibaba', 'shopify', 'marketplace',
    'dropshipping', 'carrefour', 'auchan', 'leclerc', 'intermarché', 'casino', 'lidl', 'aldi'
  ],

  'Sport': [
    'ligue des champions', 'europa league', 'premier league', 'liga', 'serie a', 'bundesliga', 'mbappé', 'messi', 'ronaldo', 'haaland',
    'neymar', 'roland-garros', 'wimbledon', 'us open', 'open d'australie', 'djokovic', 'nadal', 'federer', 'alcaraz', 'nba',
    'wembanyama', 'lebron james', 'stephen curry', 'lakers', 'warriors', 'verstappen', 'hamilton', 'leclerc', 'red bull', 'ferrari',
    'mercedes', 'grand prix'
  ],

  'Culture': [
    'netflix', 'disney+', 'prime video', 'apple tv+', 'max', 'paramount+', 'game of thrones', 'stranger things', 'the last of us', 'the mandalorian',
    'wednesday', 'marvel', 'dc', 'blockbuster', 'box-office', 'avengers', 'batman', 'spider-man', 'best-seller', 'goncourt',
    'renaudot', 'femina', 'prix littéraire'
  ],

  'Politique': [
    'renaissance', 'lr', 'ps', 'lfi', 'rn', 'eelv', 'modem', 'emmanuel macron', 'marine le pen', 'jean-luc mélenchon',
    'édouard philippe', 'bruno le maire', 'motion de censure', '49.3', 'projet de loi', 'plf', 'budget', 'fiscalité'
  ],

  'Santé': [
    'alzheimer', 'parkinson', 'diabète', 'avc', 'infarctus', 'hypertension', 'régime', 'végétarien', 'vegan', 'bio',
    'sans gluten', 'keto', 'jeûne intermittent', 'yoga', 'méditation', 'mindfulness', 'sommeil', 'stress', 'burn-out'
  ],

  'Climat': [
    'nucléaire', 'photovoltaïque', 'biomasse', 'géothermie', 'hydrogène vert', 'neutralité carbone', 'empreinte carbone', 'bilan carbone', 'compensation carbone', 'cop28',
    'cop29', 'giec', 'accord de paris'
  ],

  'Science': [
    'spacex', 'blue origin', 'mars', 'lune', 'iss', 'james webb', 'télescope', 'crispr', 'génétique', 'adn',
    'clonage', 'cellules souches', 'cnrs', 'cern', 'esa', 'nasa', 'mit', 'stanford'
  ],

  'Gaming': [
    'fortnite', 'league of legends', 'valorant', 'cs:go', 'minecraft', 'gta', 'call of duty', 'fifa', 'elden ring', 'steam',
    'epic games', 'battle.net', 'origin', 'ubisoft connect', 'lec', 'lcs', 'worlds', 'the international', 'major', 'équipe esport'
  ],

  'Lifestyle': [
    'chanel', 'dior', 'louis vuitton', 'hermès', 'gucci', 'prada', 'zara', 'h&m', 'sephora', 'l'oréal',
    'lancôme', 'mac', 'fenty beauty', 'skincare', 'routine beauté', 'airbnb', 'booking', 'tripadvisor', 'city break', 'road trip',
    'backpacking'
  ],

  'Restauration': [
    'alain ducasse', 'paul bocuse', 'gordon ramsay', 'jamie oliver', 'cyril lignac', 'philippe etchebest', 'top chef', 'masterchef', 'cauchemar en cuisine', 'street food',
    'food truck', 'fusion', 'bistronomie', 'fermentation'
  ],

  'International': [
    'ukraine', 'gaza', 'taïwan', 'corée du nord', 'iran', 'syrie', 'joe biden', 'donald trump', 'xi jinping', 'vladimir poutine',
    'emmanuel macron', 'otan', 'ue', 'fmi', 'banque mondiale', 'g7', 'g20', 'brics'
  ],

  'Tendances': [
    'tiktok', 'instagram reels', 'youtube shorts', 'snapchat', 'bereal', 'influenceur', 'créateur de contenu', 'ugc', 'pov', 'aesthetic',
    'vibe', 'mood', 'meme', 'challenge', 'trend', 'filter', 'effect', 'sound viral'
  ],

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

          // Pour "À la une" uniquement, utiliser la catégorisation auto pour disperser dans les catégories
          if (feed.category === 'À la une') {
            const autoCategory = categorizeArticle(title, description);
            detectedCategory = autoCategory;
          }
          // Pour "Tendances", on garde la catégorie du flux (pas de recatégorisation)
          // Pour les autres flux spécialisés, TOUJOURS garder leur catégorie
          // (ex: un flux Tech reste Tech, un flux Sport reste Sport, un flux Tendances reste Tendances)

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
