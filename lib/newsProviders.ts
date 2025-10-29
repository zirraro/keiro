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

// Catégories mapping (mots-clés très élargis) - EN FRANÇAIS ET ANGLAIS
const CATEGORY_KEYWORDS = {
  'Tech': ['tech', 'technologie', 'technology', 'ai', 'ia', 'intelligence', 'artificielle', 'artificial', 'logiciel', 'software', 'numérique', 'digital', 'data', 'données', 'cyber', 'cybersécurité', 'security', 'app', 'application', 'internet', 'web', 'innovation', 'innovant', 'ordinateur', 'computer', 'smartphone', 'mobile', 'cloud', 'algorithme', 'algorithm', 'robot', 'robotique', 'automation', 'automatisation', 'startup', 'électronique', 'electronic', 'informatique', 'computing', 'réseau', 'network', '5g', '6g', 'blockchain', 'crypto', 'metaverse', 'métavers', 'réalité virtuelle', 'vr', 'ar', 'iot', 'objet connecté'],

  'Business': ['business', 'entreprise', 'économie', 'economy', 'finance', 'financier', 'financial', 'marché', 'market', 'bourse', 'stock', 'commerce', 'trade', 'trading', 'société', 'company', 'corporate', 'investisseur', 'investor', 'investment', 'investissement', 'startup', 'entrepreneur', 'entrepreneuriat', 'pme', 'industrie', 'industry', 'usine', 'factory', 'production', 'fabrication', 'croissance', 'growth', 'chiffre', 'revenue', 'profit', 'bénéfice', 'acquisition', 'fusion', 'merger', 'cotation', 'ceo', 'pdg', 'patron', 'emploi', 'employment', 'recrutement', 'hiring', 'salaire', 'salary'],

  'Santé': ['santé', 'health', 'médical', 'medical', 'bien-être', 'wellness', 'hôpital', 'hospital', 'clinique', 'clinic', 'médecin', 'doctor', 'docteur', 'patient', 'maladie', 'disease', 'traitement', 'treatment', 'thérapie', 'therapy', 'médicament', 'medicine', 'drug', 'vaccin', 'vaccine', 'vaccination', 'covid', 'pandémie', 'pandemic', 'virus', 'mental', 'psychologie', 'psychiatrie', 'fitness', 'gym', 'sport santé', 'nutrition', 'alimentation', 'diet', 'régime', 'soin', 'care', 'urgence', 'emergency', 'chirurgie', 'surgery', 'opération', 'pharma', 'pharmaceutique', 'recherche médicale', 'essai clinique'],

  'Sport': ['sport', 'sportif', 'football', 'soccer', 'foot', 'basket', 'basketball', 'tennis', 'rugby', 'handball', 'volley', 'natation', 'swimming', 'cyclisme', 'vélo', 'bike', 'course', 'running', 'marathon', 'olympique', 'olympic', 'jeux olympiques', 'athlète', 'athlete', 'joueur', 'player', 'équipe', 'team', 'championnat', 'championship', 'match', 'compétition', 'competition', 'tournoi', 'tournament', 'victoire', 'victory', 'défaite', 'coupe', 'cup', 'ligue', 'league', 'entraîneur', 'coach', 'stade', 'stadium', 'podium', 'médaille', 'medal', 'record', 'performance'],

  'Culture': ['culture', 'culturel', 'divertissement', 'entertainment', 'art', 'artiste', 'artist', 'musique', 'music', 'musical', 'musicien', 'musician', 'chanson', 'song', 'album', 'concert', 'film', 'cinéma', 'movie', 'cinema', 'série', 'series', 'netflix', 'streaming', 'spectacle', 'show', 'festival', 'expo', 'exposition', 'exhibition', 'musée', 'museum', 'galerie', 'gallery', 'peinture', 'painting', 'sculpture', 'photo', 'photographie', 'livre', 'book', 'roman', 'novel', 'auteur', 'author', 'écrivain', 'writer', 'littérature', 'literature', 'poésie', 'poetry', 'théâtre', 'theater', 'danse', 'dance', 'opéra', 'opera', 'ballet'],

  'Politique': ['politique', 'politic', 'political', 'gouvernement', 'government', 'état', 'state', 'élection', 'election', 'vote', 'voter', 'président', 'president', 'ministre', 'minister', 'ministère', 'ministry', 'parlement', 'parliament', 'assemblée', 'assembly', 'sénat', 'senate', 'sénateur', 'senator', 'député', 'loi', 'law', 'législation', 'legislation', 'réforme', 'reform', 'policy', 'politique publique', 'démocratie', 'democracy', 'république', 'republic', 'parti', 'party', 'coalition', 'opposition', 'débat', 'debate', 'conseil', 'council', 'maire', 'mayor', 'municipalité'],

  'Climat': ['climat', 'climate', 'climatique', 'environnement', 'environment', 'environmental', 'écologie', 'ecology', 'écologique', 'vert', 'green', 'énergie', 'energy', 'renouvelable', 'renewable', 'solaire', 'solar', 'éolien', 'wind', 'carbone', 'carbon', 'co2', 'émission', 'emission', 'pollution', 'pollué', 'pollutant', 'durable', 'sustainable', 'durabilité', 'sustainability', 'eco', 'écolo', 'bio', 'biologique', 'organic', 'recyclage', 'recycling', 'déchet', 'waste', 'planète', 'planet', 'terre', 'earth', 'océan', 'ocean', 'mer', 'sea', 'forêt', 'forest', 'biodiversité', 'biodiversity', 'extinction', 'réchauffement', 'warming', 'température', 'météo', 'weather'],

  'Automobile': ['auto', 'automobile', 'automotive', 'voiture', 'car', 'véhicule', 'vehicle', 'électrique', 'electric', 'hybride', 'hybrid', 'tesla', 'bmw', 'mercedes', 'renault', 'peugeot', 'citroën', 'volkswagen', 'audi', 'conduite', 'driving', 'drive', 'autonome', 'autonomous', 'moteur', 'motor', 'engine', 'transport', 'mobilité', 'mobility', 'circulation', 'traffic', 'route', 'road', 'autoroute', 'highway', 'parking', 'garage', 'moto', 'motorcycle', 'scooter', 'vélo électrique', 'e-bike', 'trottinette', 'carburant', 'fuel', 'essence', 'diesel', 'batterie', 'battery', 'borne', 'charging'],

  'Lifestyle': ['lifestyle', 'vie', 'life', 'quotidien', 'daily', 'mode', 'fashion', 'tendance', 'trend', 'style', 'élégance', 'elegant', 'luxe', 'luxury', 'voyage', 'travel', 'vacances', 'holiday', 'destination', 'tourisme', 'tourism', 'hôtel', 'hotel', 'restaurant', 'cuisine', 'food', 'gastronomie', 'gastronomy', 'recette', 'recipe', 'beauté', 'beauty', 'cosmétique', 'cosmetic', 'parfum', 'perfume', 'maquillage', 'makeup', 'coiffure', 'hair', 'maison', 'home', 'décoration', 'decoration', 'design', 'intérieur', 'interior', 'jardin', 'garden', 'immobilier', 'real estate', 'propriété', 'property'],

  'People': ['people', 'célébrité', 'celebrity', 'star', 'vedette', 'acteur', 'actor', 'actrice', 'actress', 'chanteur', 'singer', 'influenceur', 'influencer', 'blogueur', 'blogger', 'youtubeur', 'youtuber', 'tiktoker', 'célèbre', 'famous', 'connu', 'known', 'personnalité', 'personality', 'people', 'glamour', 'red carpet', 'tapis rouge', 'paparazzi', 'interview', 'biographie', 'biography', 'vie privée', 'couple', 'mariage', 'marriage', 'divorce', 'enfant', 'bébé', 'baby', 'famille', 'family'],

  'Gaming': ['gaming', 'gamer', 'jeu vidéo', 'video game', 'game', 'jeux', 'esport', 'e-sport', 'compétition gaming', 'playstation', 'ps5', 'xbox', 'nintendo', 'switch', 'pc gaming', 'steam', 'epic games', 'console', 'manette', 'controller', 'fortnite', 'minecraft', 'fifa', 'call of duty', 'valorant', 'league of legends', 'lol', 'twitch', 'streamer', 'streaming gaming', 'sortie jeu', 'game release', 'gameplay', 'multijoueur', 'multiplayer', 'online', 'rpg', 'fps', 'mmo', 'battle royale'],

  'Restauration': ['restaurant', 'resto', 'cuisine', 'chef', 'cuisinier', 'cook', 'gastronomie', 'gastronomy', 'gastronomique', 'culinaire', 'culinary', 'plat', 'dish', 'menu', 'carte', 'dégustation', 'tasting', 'étoile', 'michelin', 'guide', 'bar', 'café', 'coffee', 'bistrot', 'brasserie', 'pizzeria', 'boulangerie', 'bakery', 'pâtisserie', 'pastry', 'traiteur', 'caterer', 'food truck', 'livraison', 'delivery', 'uber eats', 'deliveroo', 'table', 'réservation', 'booking', 'service', 'sommelier', 'vin', 'wine', 'déjeuner', 'lunch', 'dîner', 'dinner', 'brunch'],

  'Science': ['science', 'scientifique', 'scientist', 'recherche', 'research', 'étude', 'study', 'découverte', 'discovery', 'invention', 'laboratoire', 'laboratory', 'lab', 'expérience', 'experiment', 'physique', 'physics', 'chimie', 'chemistry', 'biologie', 'biology', 'mathématiques', 'mathematics', 'astronomie', 'astronomy', 'espace', 'space', 'nasa', 'esa', 'planète', 'planet', 'étoile', 'star', 'galaxie', 'galaxy', 'univers', 'universe', 'particule', 'particle', 'atome', 'atom', 'molécule', 'molecule', 'génétique', 'genetic', 'adn', 'dna', 'cellule', 'cell'],

  'International': ['international', 'monde', 'world', 'global', 'pays', 'country', 'nation', 'étranger', 'foreign', 'frontière', 'border', 'guerre', 'war', 'conflit', 'conflict', 'paix', 'peace', 'diplomatie', 'diplomacy', 'ambassade', 'embassy', 'onu', 'un', 'union européenne', 'eu', 'europe', 'asie', 'asia', 'afrique', 'africa', 'amérique', 'america', 'chine', 'china', 'usa', 'états-unis', 'russie', 'russia', 'japon', 'japan', 'inde', 'india', 'accord', 'agreement', 'traité', 'treaty', 'sanction', 'crise', 'crisis'],

  'Finance': ['finance', 'financier', 'financial', 'banque', 'bank', 'banking', 'crédit', 'credit', 'prêt', 'loan', 'taux', 'rate', 'intérêt', 'interest', 'bourse', 'stock', 'action', 'share', 'obligation', 'bond', 'trading', 'trader', 'investissement', 'investment', 'patrimoine', 'wealth', 'assurance', 'insurance', 'épargne', 'savings', 'compte', 'account', 'monnaie', 'currency', 'euro', 'dollar', 'devise', 'forex', 'crypto', 'bitcoin', 'ethereum', 'portefeuille', 'portfolio', 'rendement', 'return', 'risque', 'risk'],
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
      const url = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_API_KEY}&language=fr&category=${cat}&size=20`;
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
      const url = `https://gnews.io/api/v4/top-headlines?category=${topic}&lang=fr&country=fr&max=20&apikey=${GNEWS_API_KEY}`;
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
    'À la une', 'Tendances', 'Tech', 'Business', 'Finance', 'Santé', 'Sport',
    'Culture', 'Politique', 'Climat', 'Automobile', 'Lifestyle', 'People',
    'Gaming', 'Restauration', 'Science', 'International'
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

  // Trier par date pour identifier les tendances (plus récent = plus tendance)
  const sortedByDate = [...uniqueArticles].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA; // Plus récent d'abord
  });

  // Remplir "Tendances" avec les 12 articles les plus récents
  const tendances = sortedByDate.slice(0, TARGET_PER_CATEGORY);
  categoryArticles.set('Tendances', tendances);
  console.log(`[Distribution] Tendances filled with ${tendances.length} most recent articles`);

  // Premier passage : distribuer selon la catégorisation initiale (max 12 par catégorie)
  for (const article of uniqueArticles) {
    const cat = article.category || 'À la une';

    // Ne pas ajouter à REQUIRED_CATEGORIES si ce n'est pas une catégorie reconnue
    if (!REQUIRED_CATEGORIES.includes(cat) && cat !== 'À la une') {
      // Mettre dans "À la une" si catégorie non reconnue
      const alaune = categoryArticles.get('À la une') || [];
      if (alaune.length < TARGET_PER_CATEGORY) {
        alaune.push(article);
        categoryArticles.set('À la une', alaune);
      }
      continue;
    }

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
