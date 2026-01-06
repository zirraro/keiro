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

  // Tendances - Flux variés couvrant lifestyle, pop culture, buzz, viral
  { url: 'https://www.konbini.com/fr/feed/', category: 'Tendances', timeout: 8000 },
  { url: 'https://www.aufeminin.com/rss.xml', category: 'Tendances', timeout: 8000 },
  { url: 'https://www.grazia.fr/rss.xml', category: 'Tendances', timeout: 8000 },
  { url: 'https://www.cosmopolitan.fr/rss.xml', category: 'Tendances', timeout: 8000 },
  { url: 'https://hitek.fr/feed', category: 'Tendances', timeout: 8000 },
  { url: 'https://www.demotivateur.fr/feed', category: 'Tendances', timeout: 8000 },
];

// Mots-clés ENRICHIS pour catégorisation intelligente
const CATEGORY_KEYWORDS: { [key: string]: string[] } = {
  'People': ['brigitte bardot', 'bardot', 'beyoncé', 'beyonce', 'célébrité', 'star', 'acteur', 'actrice', 'chanteur', 'chanteuse', 'influenceur', 'influenceuse', 'couple', 'mariage célébrité', 'scandale', 'divorce', 'séparation', 'romance', 'relation amoureuse', 'people', 'pipole', 'mort de', 'décès de', 'hommage à', 'obsèques', 'enterrement', 'biographie', 'vie de', 'carrière de', 'personnalité', 'icône', 'légende', 'vedette', 'reine de la pop', 'roi de la pop', 'nabilla', 'cyril hanouna', 'kylian mbappé', 'rihanna', 'johnny depp', 'angelina jolie', 'brad pitt', 'kim kardashian', 'kanye west', 'shakira', 'gims', 'stromae', 'angèle', 'aya nakamura', 'soprano', 'orelsan', 'nekfeu', 'omar sy', 'gad elmaleh', 'jamel debbouze', 'florence foresti', 'johnny hallyday', 'laeticia hallyday', 'laura smet', 'vanessa paradis', 'carla bruni', 'lady gaga', 'ariana grande', 'justin bieber', 'taylor swift', 'billie eilish', 'leonardo dicaprio', 'tom cruise', 'will smith', 'robert downey jr', 'scarlett johansson', 'jennifer lawrence', 'emma watson', 'margot robbie', 'zendaya', 'timothée chalamet'],

  'Finance': ['financ', 'banque', 'bourse', 'action', 'investissement', 'trading', 'crypto', 'bitcoin', 'ethereum', 'euro', 'dollar', 'taux', 'crédit', 'dette', 'inflation', 'cac 40', 'assurance', 'immobilier', 'patrimoine', 'prix', 'tarif', 'coût', 'essence', 'carburant', 'gazole', 'diesel', 'pompe', 'sp95', 'sp98', 'e10', 'station-service', 'budget', 'pouvoir d\'achat', 'économies', 'facture'],

  'Tech': ['startup', 'start-up', 'licorne', 'scale-up', 'venture capital', 'seed funding', 'série a', 'série b', 'levée de fonds', 'financement startup', 'french tech', 'station f', 'incubateur', 'accélérateur', 'innovation technologique', 'innovation numérique', 'deeptech', 'greentech', 'fintech', 'edtech', 'healthtech', 'insurtech', 'proptech', 'foodtech', 'agritech', 'cleantech', 'biotech', 'nanotech', 'quantum computing', 'calcul quantique', 'intelligence artificielle startup', 'ia startup', 'chatgpt', 'openai', 'anthropic', 'mistral ai', 'hugging face', 'stability ai', 'midjourney', 'runway ml', 'web3', 'blockchain startup', 'crypto startup', 'nft startup', 'metaverse startup', 'réalité virtuelle startup', 'réalité augmentée startup', 'robotique startup', 'drone startup', 'mobilité électrique', 'véhicule autonome', 'voiture connectée', 'smart city', 'ville intelligente', 'iot startup', 'objets connectés startup', 'saas', 'paas', 'iaas', 'cloud native', 'no-code', 'low-code', 'api economy', 'microservices', 'devops', 'révolution numérique', 'disruption', 'disruptif', 'transformation digitale entreprise', 'digitalisation', 'industrie 4.0', 'usine du futur', 'impression 3d startup', 'fabrication additive', 'matériaux innovants', 'nanotechnologie', 'biotechnologie startup', 'medtech', 'e-santé', 'télémédecine startup', 'diagnostic ia', 'génomique', 'crispr', 'thérapie génique', 'neurotechnologie', 'interface cerveau-machine', 'exosquelette', 'prothèse intelligente', 'cobotique', 'robot collaboratif', 'automatisation intelligente', 'rpa', 'hyperautomatisation', 'edge computing', 'fog computing', '5g startup', '6g', 'satellite startup', 'spatial privé', 'new space', 'économie spatiale', 'transition énergétique tech', 'hydrogène vert startup', 'batterie nouvelle génération', 'stockage énergie', 'réseau intelligent', 'smart grid', 'agrivoltaïque', 'agriculture de précision', 'vertical farming', 'aquaponie startup', 'protéine alternative', 'viande cellulaire', 'fermentation précision', 'économie circulaire tech', 'recyclage innovant', 'upcycling tech', 'impact tech', 'social tech', 'civic tech', 'govtech', 'regtech', 'legaltech', 'hrtech', 'talent tech', 'future of work', 'travail du futur tech', 'collaboration tools startup', 'productivité startup', 'cybersécurité startup', 'zero trust', 'sécurité cloud', 'privacy tech', 'souveraineté numérique', 'tech européenne', 'tech française', 'champion tech', 'licorne française', 'next40', 'ft120'],

  'Business': ['business', 'entreprise', 'entrepreneur', 'économ', 'startup', 'pme', 'société commerciale', 'pdg', 'ceo', 'dirigeant', 'manager', 'employé', 'travail', 'télétravail', 'recrutement', 'commerce', 'marketing', 'vente', 'client', 'croissance', 'acquisition', 'partenariat', 'chiffre d\'affaires', 'profit'],

  'Santé': ['santé', 'médic', 'médecin', 'hôpital', 'patient', 'maladie', 'cancer', 'covid', 'vaccin', 'traitement', 'pharmacie', 'nutrition', 'fitness', 'bien-être', 'mental', 'psycho', 'chirurgie', 'soin', 'clinique', 'épidémie', 'pandémie', 'virus', 'bactérie'],

  'Sport': ['sport', 'foot', 'football', 'ligue 1', 'match', 'joueur de foot', 'équipe de', 'psg', 'om', 'tennis', 'rugby', 'basket', 'formule 1', 'f1', 'olympique', 'champion', 'victoire', 'transfert', 'entraîneur', 'stade', 'terrain', 'compétition', 'tournoi', 'coupe', 'ballon'],

  'Culture': ['culture', 'film', 'cinéma', 'série', 'musique', 'concert', 'festival', 'cannes', 'oscar', 'césar', 'théâtre', 'livre', 'musée', 'exposition', 'art', 'peinture', 'sculpture', 'artiste', 'réalisateur', 'metteur en scène', 'album', 'single', 'clip', 'tournage'],

  'Politique': ['politique', 'gouvernement', 'ministre', 'président', 'macron', 'élection', 'vote', 'parlement', 'assemblée nationale', 'sénat', 'député', 'sénateur', 'parti politique', 'loi', 'réforme', 'manifestation', 'syndicat', 'grève', 'décret', 'conseil des ministres'],

  'Climat': ['climat', 'écologie', 'environnement', 'énergie renouvelable', 'solaire', 'éolien', 'pollution', 'co2', 'carbone', 'réchauffement', 'biodiversité', 'transition écologique', 'cop', 'giec', 'déforestation', 'océan', 'mer'],

  'Automobile': ['auto', 'voiture', 'véhicule', 'électrique', 'hybride', 'tesla', 'renault', 'peugeot', 'citroën', 'bmw', 'mercedes', 'audi', 'volkswagen', 'salon auto', 'permis de conduire', 'code de la route', 'sécurité routière', 'accident de la route'],

  'Lifestyle': ['mode', 'fashion', 'beauté', 'maquillage', 'cosmétique', 'voyage', 'vacances', 'destination', 'maison', 'déco', 'décoration', 'intérieur', 'mariage', 'luxe', 'tendance mode', 'défilé', 'collection'],

  'Gaming': ['gaming', 'jeu vidéo', 'gamer', 'playstation', 'ps5', 'ps4', 'xbox', 'nintendo', 'switch', 'pc gaming', 'fortnite', 'esport', 'e-sport', 'twitch', 'stream', 'streamer', 'console', 'manette', 'dlc'],

  'Restauration': ['restaurant', 'cuisine', 'chef', 'gastronomie', 'michelin', 'étoile', 'vin', 'recette', 'plat', 'menu', 'dégustation', 'sommelier', 'cuisinier', 'pâtisserie', 'boulangerie'],

  'Science': ['science', 'scientifique', 'recherche', 'chercheur', 'découverte', 'étude', 'espace', 'nasa', 'astronomie', 'physique', 'chimie', 'biologie', 'laboratoire', 'expérience', 'planète', 'galaxie', 'univers', 'cnrs'],

  'International': ['international', 'monde', 'guerre', 'conflit', 'onu', 'états-unis', 'usa', 'chine', 'russie', 'ukraine', 'israël', 'gaza', 'palestine', 'trump', 'biden', 'poutine', 'zelensky', 'netanyahu', 'diplomatie', 'géopolitique', 'ambassade'],

  'Tendances': ['tendance', 'viral', 'buzz', 'trending', 'tiktok', 'réseaux sociaux', 'instagram', 'twitter', 'x', 'phénomène', 'engouement', 'insolite', 'wtf', 'incroyable', 'fou', 'dingue', 'génial', 'meme', 'le saviez-vous', 'fail', 'meilleur', 'pire', 'top 10', 'classement', 'vidéo buzz', 'vidéo virale', 'photo virale', 'photo buzz', 'record', 'inédit', 'première fois', 'jamais vu', 'sensation', 'révélation', 'découverte étonnante', 'hallucinant', 'choc', 'polémique', 'débat', 'controverse', 'réaction', 'commentaire', 'partage', 'like', 'retweet', 'story', 'reel', 'clip viral', 'challenge', 'défi', 'mode passagère'],
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
