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

// Mots-clés ULTRA LARGES - version simplifiée et efficace
const CATEGORY_KEYWORDS: { [key: string]: string[] } = {
  'Tech': ['tech', 'technolog', 'ai', 'ia', 'intel', 'soft', 'numér', 'digit', 'data', 'cyber', 'app', 'internet', 'innov', 'ordin', 'comput', 'phone', 'mobile', 'cloud', 'robot', 'électron', 'network', 'réseau', '5g', 'blockchain', 'crypto', 'bitcoin', 'meta', 'google', 'apple', 'microsoft', 'amazon', 'tesla'],

  'Business': ['business', 'entrepr', 'économ', 'econom', 'march', 'market', 'commerc', 'trade', 'sociét', 'compan', 'startup', 'entrepr', 'industr', 'product', 'croiss', 'growth', 'profit', 'acquisition', 'fusion', 'emploi', 'job', 'work', 'patron', 'boss', 'ceo', 'pme'],

  'Finance': ['financ', 'banqu', 'bank', 'crédit', 'credit', 'taux', 'rate', 'bours', 'stock', 'action', 'trading', 'invest', 'assur', 'insur', 'épargn', 'saving', 'monnaie', 'currency', 'euro', 'dollar', 'bitcoin', 'crypto', 'forex'],

  'Santé': ['santé', 'health', 'médic', 'medic', 'hôpit', 'hospit', 'doctor', 'patient', 'malad', 'diseas', 'trait', 'treat', 'médic', 'medic', 'vaccin', 'vaccine', 'covid', 'virus', 'mental', 'fitness', 'nutrit', 'aliment', 'food', 'régime', 'diet'],

  'Sport': ['sport', 'foot', 'soccer', 'basket', 'tennis', 'rugby', 'olymp', 'athlèt', 'athlet', 'joueur', 'player', 'équip', 'team', 'champion', 'match', 'compét', 'compet', 'tournoi', 'coupe', 'cup', 'ligue', 'league', 'psg', 'om', 'real', 'barça', 'nba', 'fifa'],

  'Culture': ['cultur', 'art', 'musiqu', 'music', 'film', 'cinéma', 'cinema', 'movie', 'série', 'series', 'netflix', 'stream', 'spectacl', 'concert', 'festival', 'musée', 'museum', 'livre', 'book', 'théâtr', 'theater', 'actor', 'acteur', 'actrice'],

  'Politique': ['politiq', 'politic', 'gouvern', 'govern', 'élection', 'election', 'vote', 'président', 'president', 'ministr', 'parlem', 'sénat', 'senat', 'loi', 'law', 'réform', 'reform', 'parti', 'party', 'macron', 'france'],

  'Climat': ['climat', 'climate', 'environ', 'écolog', 'ecolog', 'vert', 'green', 'énerg', 'energy', 'renou', 'solaire', 'solar', 'éolien', 'wind', 'carbon', 'émission', 'emission', 'pollut', 'durable', 'sustain', 'recycl', 'bio', 'planète', 'planet'],

  'Automobile': ['auto', 'voitur', 'car', 'véhicul', 'vehicle', 'électriq', 'electric', 'tesla', 'conduit', 'driv', 'moteur', 'motor', 'transport', 'mobil', 'route', 'road', 'batter', 'renault', 'peugeot', 'citroën', 'bmw', 'mercedes'],

  'Lifestyle': ['lifestyle', 'mode', 'fashion', 'voyag', 'travel', 'cuisin', 'food', 'beauté', 'beauty', 'maison', 'home', 'design', 'décor', 'touris', 'hôtel', 'hotel', 'luxe', 'luxury', 'style', 'vie', 'life'],

  'People': ['people', 'céléb', 'celeb', 'star', 'acteur', 'actor', 'chant', 'sing', 'influen', 'blog', 'youtub', 'tiktok', 'célèbr', 'famous', 'person', 'couple', 'mariag', 'marry'],

  'Gaming': ['gam', 'jeu', 'esport', 'playstation', 'xbox', 'nintendo', 'console', 'fortnite', 'minecraft', 'twitch', 'stream', 'ps5', 'fifa', 'call of duty'],

  'Restauration': ['restaurant', 'resto', 'cuisin', 'chef', 'gastro', 'culinair', 'culinary', 'plat', 'dish', 'menu', 'michelin', 'bar', 'café', 'coffee', 'bistrot', 'food'],

  'Science': ['scien', 'recherch', 'research', 'découvert', 'discover', 'labor', 'physiqu', 'physic', 'chimi', 'chemi', 'biolog', 'astro', 'espace', 'space', 'nasa', 'planète', 'planet'],

  'International': ['internation', 'monde', 'world', 'global', 'pays', 'country', 'guerre', 'war', 'conflit', 'paix', 'peace', 'diplom', 'onu', 'un', 'europ', 'asie', 'asia', 'afriqu', 'africa', 'amérique', 'america', 'chine', 'china', 'usa', 'russie', 'russia'],
};

// Catégorisation SIMPLE et EFFICACE
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

// GNews - Provider principal
async function fetchFromGNews(): Promise<NewsArticle[]> {
  try {
    const allArticles: NewsArticle[] = [];
    const topics = ['general', 'business', 'technology', 'sports', 'health', 'entertainment', 'science', 'world', 'nation'];

    for (const topic of topics) {
      try {
        const url = `https://gnews.io/api/v4/top-headlines?category=${topic}&lang=fr&country=fr&max=25&apikey=${GNEWS_API_KEY}`;
        const res = await fetch(url, { cache: 'no-store' });

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
            console.log(`[GNews] ${topic}: ${articles.length} articles`);
          }
        } else {
          console.error(`[GNews] ${topic} failed with status ${res.status}`);
        }
      } catch (err) {
        console.warn(`[GNews] ${topic} failed:`, err);
      }
    }

    console.log(`[GNews] TOTAL: ${allArticles.length} articles`);
    return allArticles;
  } catch (error: any) {
    console.error('[GNews] Error:', error.message);
    return [];
  }
}

// NewsData - Provider secondaire
async function fetchFromNewsData(): Promise<NewsArticle[]> {
  try {
    const allArticles: NewsArticle[] = [];
    const categories = ['top', 'technology', 'business', 'health', 'sports', 'entertainment', 'science', 'environment', 'food', 'politics', 'world', 'lifestyle', 'tourism'];

    for (const cat of categories) {
      try {
        const url = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_API_KEY}&language=fr&category=${cat}&size=20`;
        const res = await fetch(url, { cache: 'no-store' });

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
            console.log(`[NewsData] ${cat}: ${articles.length} articles`);
          }
        } else {
          console.error(`[NewsData] ${cat} failed with status ${res.status}`);
        }
      } catch (err) {
        console.warn(`[NewsData] ${cat} failed:`, err);
      }
    }

    console.log(`[NewsData] TOTAL: ${allArticles.length} articles`);
    return allArticles;
  } catch (error: any) {
    console.error('[NewsData] Error:', error.message);
    return [];
  }
}

// Mock data pour chaque catégorie
function generateMockNews(): NewsArticle[] {
  const now = new Date().toISOString();
  const mockArticles: NewsArticle[] = [];

  const mockData = [
    { cat: 'Tech', title: 'Apple dévoile son nouveau Vision Pro 2', desc: 'Le casque de réalité mixte améliore sa résolution et son autonomie pour conquérir le grand public.', img: 'https://picsum.photos/seed/tech1/800/450' },
    { cat: 'Tech', title: 'Google Lance Gemini 2.0 avec des capacités révolutionnaires', desc: 'Le nouveau modèle d\'IA de Google surpasse GPT-4 dans plusieurs benchmarks clés.', img: 'https://picsum.photos/seed/tech2/800/450' },
    { cat: 'Tech', title: 'Tesla annonce sa Model 2 à 25000€', desc: 'La voiture électrique abordable promet de démocratiser la mobilité zéro émission.', img: 'https://picsum.photos/seed/tech3/800/450' },
    { cat: 'Business', title: 'Les startups françaises lèvent 2 milliards', desc: 'Record de financement au premier trimestre pour l\'écosystème tech parisien.', img: 'https://picsum.photos/seed/biz1/800/450' },
    { cat: 'Business', title: 'LVMH rachète une marque de luxe durable', desc: 'Le géant du luxe investit 500 millions dans l\'éco-responsabilité.', img: 'https://picsum.photos/seed/biz2/800/450' },
    { cat: 'Business', title: 'Amazon ouvre 50 nouveaux centres en Europe', desc: 'L\'expansion continue avec 10000 emplois créés sur le continent.', img: 'https://picsum.photos/seed/biz3/800/450' },
    { cat: 'Finance', title: 'Le Bitcoin atteint 100000$ pour la première fois', desc: 'Les cryptomonnaies connaissent un rallye historique après l\'approbation des ETF.', img: 'https://picsum.photos/seed/fin1/800/450' },
    { cat: 'Finance', title: 'La BCE maintient ses taux directeurs', desc: 'L\'inflation maîtrisée permet une politique monétaire stable en zone euro.', img: 'https://picsum.photos/seed/fin2/800/450' },
    { cat: 'Finance', title: 'Nouveau record pour le CAC 40', desc: 'L\'indice parisien franchit les 8000 points grâce aux valeurs technologiques.', img: 'https://picsum.photos/seed/fin3/800/450' },
    { cat: 'Santé', title: 'Découverte d\'un traitement contre Alzheimer', desc: 'Des chercheurs français font une percée majeure dans la lutte contre la maladie.', img: 'https://picsum.photos/seed/health1/800/450' },
    { cat: 'Santé', title: 'Le jeûne intermittent validé par une étude', desc: 'Les bienfaits sur la longévité confirmés par 10 ans de recherche clinique.', img: 'https://picsum.photos/seed/health2/800/450' },
    { cat: 'Santé', title: 'Vaccination contre le cancer: essais prometteurs', desc: 'Les vaccins à ARN messager montrent une efficacité de 80% en phase 3.', img: 'https://picsum.photos/seed/health3/800/450' },
    { cat: 'Sport', title: 'Le PSG remporte la Ligue des Champions', desc: 'Victoire historique 3-1 contre Manchester City en finale à Istanbul.', img: 'https://picsum.photos/seed/sport1/800/450' },
    { cat: 'Sport', title: 'Roland-Garros: victoire surprise d\'un Français', desc: 'Un joueur tricolore remporte son premier Grand Chelem à domicile.', img: 'https://picsum.photos/seed/sport2/800/450' },
    { cat: 'Sport', title: 'JO 2028: Paris prépare son héritage olympique', desc: 'Les infrastructures des Jeux transformées en équipements publics durables.', img: 'https://picsum.photos/seed/sport3/800/450' },
    { cat: 'Culture', title: 'Cannes 2025: palme d\'or pour un film français', desc: 'Le cinéma français triomphe avec une fresque historique de 3 heures.', img: 'https://picsum.photos/seed/culture1/800/450' },
    { cat: 'Culture', title: 'Le Louvre bat son record de fréquentation', desc: '15 millions de visiteurs en 2024 grâce aux nouvelles expositions immersives.', img: 'https://picsum.photos/seed/culture2/800/450' },
    { cat: 'Culture', title: 'Netflix produit 20 séries françaises', desc: 'Le géant du streaming investit massivement dans la création hexagonale.', img: 'https://picsum.photos/seed/culture3/800/450' },
    { cat: 'Politique', title: 'Réforme des retraites: nouveau compromis trouvé', desc: 'L\'âge de départ fixé à 64 ans avec des exceptions pour les carrières longues.', img: 'https://picsum.photos/seed/pol1/800/450' },
    { cat: 'Politique', title: 'Élections européennes: taux de participation record', desc: '65% des Français se sont rendus aux urnes, un niveau inédit depuis 30 ans.', img: 'https://picsum.photos/seed/pol2/800/450' },
    { cat: 'Politique', title: 'Loi climat: objectif neutralité carbone 2045', desc: 'Le Parlement vote des mesures ambitieuses pour accélérer la transition écologique.', img: 'https://picsum.photos/seed/pol3/800/450' },
    { cat: 'Climat', title: 'Énergies renouvelables: objectif 2030 atteint', desc: 'La France dépasse ses engagements avec 50% d\'électricité verte.', img: 'https://picsum.photos/seed/climate1/800/450' },
    { cat: 'Climat', title: 'Plastique: interdiction totale dans 5 ans', desc: 'L\'UE adopte le plan le plus ambitieux au monde contre la pollution plastique.', img: 'https://picsum.photos/seed/climate2/800/450' },
    { cat: 'Climat', title: 'Forêts urbaines: 100 villes s\'engagent', desc: 'Un million d\'arbres seront plantés dans les métropoles européennes d\'ici 2026.', img: 'https://picsum.photos/seed/climate3/800/450' },
    { cat: 'Automobile', title: 'Renault dévoile sa Renault 5 électrique', desc: 'L\'icône française renaît en version 100% électrique à partir de 25000€.', img: 'https://picsum.photos/seed/auto1/800/450' },
    { cat: 'Automobile', title: 'Bornes de recharge: 200000 en France', desc: 'Le réseau national dépasse les objectifs avec une borne tous les 50km.', img: 'https://picsum.photos/seed/auto2/800/450' },
    { cat: 'Automobile', title: 'Voiture autonome: autorisation sur autoroute', desc: 'Les véhicules de niveau 4 peuvent circuler sans conducteur dès 2025.', img: 'https://picsum.photos/seed/auto3/800/450' },
    { cat: 'Lifestyle', title: 'Slow living: la tendance qui cartonne', desc: 'De plus en plus de Français adoptent un mode de vie minimaliste et déconnecté.', img: 'https://picsum.photos/seed/life1/800/450' },
    { cat: 'Lifestyle', title: 'Tiny houses: vivre petit, vivre mieux', desc: 'Les micro-maisons séduisent par leur empreinte écologique réduite.', img: 'https://picsum.photos/seed/life2/800/450' },
    { cat: 'Lifestyle', title: 'Yoga et méditation: 10 millions de pratiquants', desc: 'Le bien-être mental devient une priorité pour les Français.', img: 'https://picsum.photos/seed/life3/800/450' },
    { cat: 'People', title: 'Beyoncé annonce sa tournée mondiale', desc: 'La superstar passera par Paris pour 5 concerts au Stade de France en juin.', img: 'https://picsum.photos/seed/people1/800/450' },
    { cat: 'People', title: 'Mariage royal: les photos exclusives', desc: 'Les coulisses du mariage princier révélées par un photographe de renom.', img: 'https://picsum.photos/seed/people2/800/450' },
    { cat: 'People', title: 'Festival de Cannes: les plus beaux looks', desc: 'Retour sur les tenues qui ont marqué la Croisette cette année.', img: 'https://picsum.photos/seed/people3/800/450' },
    { cat: 'Gaming', title: 'GTA 6 bat tous les records de précommandes', desc: 'Le jeu de Rockstar s\'annonce comme le plus gros lancement de l\'histoire du jeu vidéo.', img: 'https://picsum.photos/seed/game1/800/450' },
    { cat: 'Gaming', title: 'PlayStation 6: Sony confirme la sortie pour 2027', desc: 'La nouvelle console promet des graphismes en 8K et 240fps.', img: 'https://picsum.photos/seed/game2/800/450' },
    { cat: 'Gaming', title: 'Esport: la France championne du monde', desc: 'L\'équipe tricolore remporte le championnat mondial de League of Legends.', img: 'https://picsum.photos/seed/game3/800/450' },
    { cat: 'Restauration', title: 'Nouveau restaurant 3 étoiles à Lyon', desc: 'Le Guide Michelin récompense un jeune chef pour sa cuisine innovante et locale.', img: 'https://picsum.photos/seed/resto1/800/450' },
    { cat: 'Restauration', title: 'Dark kitchens: le boom de la livraison gastronomique', desc: 'Les restaurants virtuels multiplient les concepts pour séduire les gourmets.', img: 'https://picsum.photos/seed/resto2/800/450' },
    { cat: 'Restauration', title: 'Véganisme: 500 nouveaux restaurants en France', desc: 'La cuisine végétale s\'impose dans la gastronomie française traditionnelle.', img: 'https://picsum.photos/seed/resto3/800/450' },
    { cat: 'Science', title: 'Fusion nucléaire: le seuil de rentabilité atteint', desc: 'Une expérience produit plus d\'énergie qu\'elle n\'en consomme pour la première fois.', img: 'https://picsum.photos/seed/science1/800/450' },
    { cat: 'Science', title: 'Exoplanète habitable découverte à 40 années-lumière', desc: 'Des traces d\'eau et une atmosphère similaire à la Terre détectées.', img: 'https://picsum.photos/seed/science2/800/450' },
    { cat: 'Science', title: 'IA: un robot chirurgien opère seul avec succès', desc: 'L\'opération autonome ouvre la voie à une médecine de précision révolutionnaire.', img: 'https://picsum.photos/seed/science3/800/450' },
    { cat: 'International', title: 'Accord historique Chine-USA sur le climat', desc: 'Les deux superpuissances s\'engagent à réduire leurs émissions de 50% d\'ici 2035.', img: 'https://picsum.photos/seed/intl1/800/450' },
    { cat: 'International', title: 'Paix au Moyen-Orient: traité signé à Genève', desc: 'Un accord de cessez-le-feu durable met fin à 30 ans de conflit régional.', img: 'https://picsum.photos/seed/intl2/800/450' },
    { cat: 'International', title: 'L\'Afrique, nouveau géant économique mondial', desc: 'Le PIB africain dépasse celui de l\'Europe grâce au boom technologique.', img: 'https://picsum.photos/seed/intl3/800/450' },
  ];

  mockData.forEach((item, idx) => {
    mockArticles.push({
      id: `mock-${idx}`,
      title: item.title,
      description: item.desc,
      url: `https://example.com/article/${idx}`,
      image: item.img,
      source: 'Keiro Demo',
      date: now,
      category: item.cat,
    });
  });

  console.log(`[Mock] Generated ${mockArticles.length} mock articles`);
  return mockArticles;
}

// Fetch TOUS les providers
export async function fetchNewsWithFallback(): Promise<NewsArticle[]> {
  const allArticles: NewsArticle[] = [];

  console.log('[Fetch] Fetching from ALL providers...');

  const gnews = await fetchFromGNews();
  const newsdata = await fetchFromNewsData();

  allArticles.push(...gnews);
  allArticles.push(...newsdata);

  console.log(`[Fetch] COMBINED TOTAL: ${allArticles.length} articles`);

  // Si les APIs ne retournent rien, utiliser les données mock
  if (allArticles.length === 0) {
    console.warn('[Fetch] APIs returned no articles, using mock data');
    return generateMockNews();
  }

  return allArticles;
}

// Distribution GARANTIE avec REMPLISSAGE FORCÉ
export function distributeByCategory(articles: NewsArticle[]): NewsArticle[] {
  const ALL_CATEGORIES = [
    'À la une', 'Tendances', 'Tech', 'Business', 'Finance', 'Santé', 'Sport',
    'Culture', 'Politique', 'Climat', 'Automobile', 'Lifestyle', 'People',
    'Gaming', 'Restauration', 'Science', 'International'
  ];

  const TARGET = 12;
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

  if (uniqueArticles.length === 0) {
    console.error('[Distribution] NO ARTICLES TO DISTRIBUTE!');
    return [];
  }

  // Tendances = 12 plus récents
  const sortedByDate = [...uniqueArticles].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });
  categoryMap.set('Tendances', sortedByDate.slice(0, TARGET));

  // Distribution initiale
  for (const article of uniqueArticles) {
    const cat = article.category || 'À la une';
    if (ALL_CATEGORIES.includes(cat)) {
      const list = categoryMap.get(cat) || [];
      list.push(article);
      categoryMap.set(cat, list);
    }
  }

  console.log('[Distribution] After initial:');
  ALL_CATEGORIES.forEach(cat => {
    console.log(`  ${cat}: ${categoryMap.get(cat)?.length || 0}`);
  });

  // REMPLISSAGE FORCÉ - Garantir 12 partout
  console.log('[Distribution] FORCING 12 articles per category...');

  ALL_CATEGORIES.forEach(cat => {
    const list = categoryMap.get(cat) || [];

    // Si moins de 12, remplir depuis TOUS les articles disponibles
    if (list.length < TARGET) {
      let idx = 0;
      while (list.length < TARGET && idx < uniqueArticles.length) {
        const article = { ...uniqueArticles[idx % uniqueArticles.length] };
        article.category = cat;
        article.id = `${article.id}-fill-${cat}-${list.length}`;
        list.push(article);
        idx++;
      }
    }

    // Limiter à 12 max
    if (list.length > TARGET) {
      categoryMap.set(cat, list.slice(0, TARGET));
    } else {
      categoryMap.set(cat, list);
    }
  });

  console.log('[Distribution] FINAL (FORCED):');
  const result: NewsArticle[] = [];
  ALL_CATEGORIES.forEach(cat => {
    const articles = categoryMap.get(cat) || [];
    console.log(`  ${cat}: ${articles.length} articles`);
    result.push(...articles);
  });

  return result;
}
