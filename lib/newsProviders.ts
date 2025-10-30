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

// Mots-clés ENRICHIS pour catégorisation automatique
const CATEGORY_KEYWORDS: { [key: string]: string[] } = {
  'Tech': ['tech', 'technolog', 'ai', 'ia', 'intel', 'artificial', 'numér', 'digit', 'cyber', 'app', 'application', 'logiciel', 'software', 'internet', 'web', 'ordin', 'comput', 'phone', 'smartphone', 'mobile', 'iphone', 'android', 'google', 'apple', 'microsoft', 'amazon', 'meta', 'facebook', 'twitter', 'tiktok', 'instagram', 'cloud', 'data', 'robot', 'drone', '5g', 'blockchain', 'nft', 'metaverse', 'chatgpt', 'openai', 'tesla', 'spacex', 'innovation', 'startup', 'silicon'],

  'Business': ['business', 'entrepr', 'entrepreneur', 'économ', 'econom', 'startup', 'pme', 'sociét', 'compan', 'entreprise', 'pdg', 'ceo', 'dirigeant', 'patron', 'salarié', 'emploi', 'job', 'travail', 'work', 'recrutement', 'hiring', 'commerce', 'vente', 'marketing', 'stratégie', 'croissance', 'develop', 'invest', 'levée', 'acquisition', 'fusion', 'rachat'],

  'Finance': ['financ', 'banqu', 'bank', 'bours', 'stock', 'action', 'obligation', 'fond', 'placement', 'épargne', 'saving', 'invest', 'portefeuille', 'trading', 'forex', 'crypto', 'bitcoin', 'ethereum', 'monnaie', 'euro', 'dollar', 'taux', 'interest', 'crédit', 'prêt', 'loan', 'dette', 'inflation', 'cac 40', 'dow jones', 'nasdaq', 'assurance', 'retraite', 'immobil'],

  'Santé': ['santé', 'health', 'médic', 'medical', 'médecin', 'doctor', 'hôpit', 'hospital', 'clinique', 'patient', 'maladie', 'disease', 'cancer', 'diabète', 'covid', 'virus', 'vaccin', 'vaccine', 'traitement', 'treat', 'soin', 'care', 'pharmacie', 'médicament', 'drug', 'nutrition', 'alimentat', 'régime', 'diet', 'fitness', 'bien-être', 'wellness', 'mental', 'psycho', 'thérapie', 'chirurgie', 'opération'],

  'Sport': ['sport', 'sportif', 'foot', 'football', 'soccer', 'ligue 1', 'ligue des champions', 'champions league', 'coupe', 'cup', 'match', 'finale', 'joueur', 'player', 'équipe', 'team', 'entraîneur', 'coach', 'psg', 'om', 'olympique', 'real madrid', 'barça', 'manchester', 'bayern', 'tennis', 'roland-garros', 'wimbledon', 'rugby', 'basket', 'nba', 'formule 1', 'f1', 'moto gp', 'motogp', 'olympique', 'jeux olympiques', 'athlétisme', 'natation', 'cyclisme', 'tour de france', 'ballon', 'stade', 'terrain', 'champion du monde', 'victoire', 'défaite', 'but', 'goal', 'penalty', 'carton', 'arbitre', 'transfert', 'mercato', 'mbappé', 'messi', 'ronaldo', 'nadal', 'federer', 'djokovic'],

  'Culture': ['cultur', 'art', 'artiste', 'film', 'cinéma', 'cinema', 'movie', 'réalis', 'director', 'acteur', 'actor', 'actrice', 'actress', 'série', 'series', 'netflix', 'amazon prime', 'disney', 'stream', 'musiq', 'music', 'album', 'chanson', 'song', 'concert', 'festival', 'cannes', 'césar', 'oscar', 'théâtr', 'theater', 'pièce', 'spectacl', 'show', 'musée', 'museum', 'exposition', 'livre', 'book', 'roman', 'auteur', 'littérat'],

  'Politique': ['politiq', 'politic', 'gouvernement', 'gouvern', 'ministre', 'ministère', 'premier ministre', 'président', 'president', 'macron', 'élection', 'election', 'vote', 'scrutin', 'parlement', 'sénat', 'assemblée nationale', 'député', 'sénateur', 'parti politique', 'gauche', 'droite', 'centre', 'loi', 'législation', 'réforme', 'décret', 'projet de loi', 'débat politique', 'opposition', 'majorité', 'conseil des ministres', 'matignon', 'élysée'],

  'Climat': ['climat', 'climate', 'réchauff', 'warming', 'environ', 'écolog', 'ecolog', 'vert', 'green', 'durable', 'sustain', 'énerg', 'energy', 'renouv', 'solaire', 'solar', 'éolien', 'wind', 'nucléaire', 'nuclear', 'carbon', 'co2', 'émission', 'emission', 'pollut', 'déchet', 'waste', 'recycl', 'bio', 'organic', 'planète', 'planet', 'terre', 'earth', 'nature', 'biodiversité', 'extinction'],

  'Automobile': ['auto', 'automobile', 'voitur', 'car', 'vehicle', 'véhicul', 'électriq', 'electric', 'hybrid', 'essence', 'diesel', 'tesla', 'renault', 'peugeot', 'citroën', 'bmw', 'mercedes', 'audi', 'volkswagen', 'conduit', 'driv', 'permis', 'license', 'moteur', 'engine', 'borne', 'recharge', 'autonomie', 'battery', 'salon', 'prototype', 'concept'],

  'Lifestyle': ['lifestyle', 'mode', 'fashion', 'tendance', 'trend', 'style', 'look', 'défilé', 'collection', 'créateur', 'designer', 'luxe', 'luxury', 'marque', 'brand', 'voyag', 'travel', 'tourism', 'vacance', 'holiday', 'destination', 'hôtel', 'hotel', 'beauté', 'beauty', 'cosmétique', 'makeup', 'parfum', 'coiffure', 'hair', 'maison', 'home', 'décor', 'design', 'immobil'],

  'People': ['people', 'céléb', 'celebrity', 'star', 'vedette', 'acteur', 'actrice', 'actor', 'chanteur', 'singer', 'artiste', 'influenc', 'influen', 'youtub', 'tiktok', 'instagram', 'snapchat', 'blog', 'couple', 'mariag', 'wedding', 'divorce', 'bébé', 'baby', 'grossesse', 'pregnant', 'scandale', 'rumeur', 'paparazzi', 'red carpet', 'gala', 'cérémonie'],

  'Gaming': ['gaming', 'jeu vidéo', 'jeux vidéo', 'video game', 'gamer', 'esport', 'e-sport', 'playstation', 'ps5', 'ps4', 'xbox', 'nintendo', 'switch', 'console', 'fortnite', 'minecraft', 'call of duty', 'cod', 'fifa', 'gta', 'steam', 'epic games', 'twitch', 'streamer', 'lol', 'league of legends', 'valorant', 'overwatch', 'apex', 'warzone', 'elden ring', 'zelda', 'mario', 'sonic', 'dota', 'pubg', 'counter-strike', 'cs:go', 'battlefield'],

  'Restauration': ['restaurant', 'resto', 'cuisin', 'cuisine', 'cook', 'chef', 'gastronomie', 'gastro', 'culinaire', 'culinary', 'plat', 'dish', 'recette', 'recipe', 'menu', 'carte', 'étoile', 'michelin', 'guide', 'bistrot', 'brasserie', 'café', 'coffee', 'bar', 'food', 'bouffe', 'manger', 'eat', 'dégustation', 'tasting', 'vin', 'wine', 'sommelier', 'table'],

  'Science': ['scien', 'science', 'recherch', 'research', 'étude', 'study', 'découvert', 'discover', 'invention', 'labor', 'labo', 'chercheur', 'scientifique', 'physiq', 'physic', 'chimie', 'chemi', 'biolog', 'mathématique', 'math', 'astronomie', 'astro', 'espace', 'space', 'nasa', 'esa', 'planète', 'planet', 'étoile', 'star', 'galaxie', 'mars', 'lune', 'moon', 'telescope', 'satellite'],

  'International': ['international', 'internation', 'monde', 'world', 'global', 'planète', 'pays', 'country', 'nation', 'étranger', 'foreign', 'guerre', 'war', 'conflit', 'conflict', 'paix', 'peace', 'accord', 'treaty', 'diplomatie', 'diplomat', 'ambassade', 'onu', 'un', 'otan', 'nato', 'union européenne', 'europe', 'états-unis', 'usa', 'amérique', 'america', 'chine', 'china', 'russie', 'russia', 'asie', 'asia', 'afrique', 'africa', 'moyen-orient', 'middle east'],

  'Tendances': ['tendance', 'trend', 'viral', 'buzz', 'phénomène', 'hype', 'nouveau', 'new', 'actualité', 'news', 'info', 'événement', 'event', 'annonce', 'lancement', 'sortie', 'release'],
};

// Catégoriser un article avec scoring pondéré
function categorizeArticle(title: string, description: string): string {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();

  let bestCategory = 'À la une';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;

    // Titre = 3x plus important que description
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

// ===== FETCH RSS FEEDS =====
async function fetchFromRSS(): Promise<NewsArticle[]> {
  console.log('[RSS] Fetching from RSS feeds...');
  const allArticles: NewsArticle[] = [];
  let articleCounter = 0; // Compteur global pour IDs uniques

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed, feedIndex) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        const articles = parsed.items.slice(0, 20).map((item, itemIndex) => {
          const title = item.title || 'Sans titre';
          const description = (item.contentSnippet || item.content || '').replace(/\s+/g, ' ').trim().slice(0, 200);

          // TOUJOURS recatégoriser par analyse du contenu
          const smartCategory = categorizeArticle(title, description);

          // ID UNIQUE GARANTI: feed + timestamp + compteur
          articleCounter++;
          const uniqueId = `news-${feedIndex}-${itemIndex}-${Date.now()}-${articleCounter}`;

          return {
            id: uniqueId,
            title,
            description,
            url: item.link || '',
            image: (item as any)?.enclosure?.url || (item as any)?.['media:content']?.$?.url,
            source: parsed.title?.split(' - ')[0] || feed.category,
            date: (item as any).isoDate || item.pubDate,
            category: smartCategory,
          } as NewsArticle;
        });

        console.log(`[RSS] Fetched ${articles.length} articles from ${feed.category}`);
        return articles;
      } catch (err) {
        console.warn(`[RSS] Failed to fetch ${feed.url}`);
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
    if (!article.url) return true; // Garder même sans URL
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

  // FILTRER les articles sans image
  const articlesWithImages = articles.filter(article => {
    if (!article.image) {
      return false;
    }
    return true;
  });

  console.log(`[Filter] ${articles.length} → ${articlesWithImages.length} articles (removed ${articles.length - articlesWithImages.length} without images)`);

  if (articlesWithImages.length > 20) {
    // Mettre en cache
    cachedArticles = articlesWithImages;
    cacheTimestamp = now;
    console.log(`[Cache] Cached ${articlesWithImages.length} articles with images for 1 hour`);
    return articlesWithImages;
  }

  // Si échec RSS, utiliser cache expiré si disponible
  if (cachedArticles && cachedArticles.length > 0) {
    console.warn('[Fetch] RSS failed but using stale cache');
    return cachedArticles;
  }

  // Dernier recours
  console.error('[Fetch] All sources failed, returning empty array');
  return [];
}

// ===== DISTRIBUTION GARANTIE POUR TOUTES LES CATÉGORIES =====
export function distributeByCategory(articles: NewsArticle[]): NewsArticle[] {
  const ALL_CATEGORIES = [
    'À la une', 'Tendances', 'Tech', 'Business', 'Finance',
    'Santé', 'Sport', 'Culture', 'Politique', 'Climat',
    'Automobile', 'Lifestyle', 'People', 'Gaming',
    'Restauration', 'Science', 'International'
  ];

  const TARGET = 12; // Objectif: 12 articles par catégorie

  // Dédupliquer
  const seen = new Set<string>();
  const uniqueArticles: NewsArticle[] = [];
  for (const article of articles) {
    const key = article.url || article.id;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueArticles.push(article);
    }
  }

  console.log(`[Distribution] ${uniqueArticles.length} unique articles to distribute`);

  // Grouper par catégorie initiale
  const categoryMap = new Map<string, NewsArticle[]>();
  ALL_CATEGORIES.forEach((cat) => categoryMap.set(cat, []));

  for (const article of uniqueArticles) {
    const cat = article.category || 'À la une';
    const list = categoryMap.get(cat) || [];
    list.push(article);
    categoryMap.set(cat, list);
  }

  // REMPLISSAGE INTELLIGENT: priorité à la pertinence sur la quantité
  let redistributionPool = [...uniqueArticles];

  for (const category of ALL_CATEGORIES) {
    let list = categoryMap.get(category) || [];

    if (list.length < TARGET) {
      console.log(`[Redistribution] ${category} has only ${list.length} articles, searching for relevant matches...`);

      const keywords = CATEGORY_KEYWORDS[category] || [];

      // Chercher articles pertinents avec SCORE MINIMUM
      const candidates: Array<{ article: NewsArticle; score: number }> = [];

      for (const article of redistributionPool) {
        // Skip si déjà dans cette catégorie
        if (list.some(a => a.url === article.url || a.id === article.id)) continue;

        const titleLower = article.title.toLowerCase();
        const descLower = article.description.toLowerCase();
        let score = 0;

        // Calculer le score (titre 3x plus important)
        for (const kw of keywords) {
          if (titleLower.includes(kw)) score += 3;
          if (descLower.includes(kw)) score += 1;
        }

        // SEUIL MINIMUM: score >= 2 pour être pertinent
        if (score >= 2) {
          candidates.push({ article, score });
        }
      }

      // Trier par score décroissant
      candidates.sort((a, b) => b.score - a.score);

      // Ajouter les meilleurs candidats jusqu'à TARGET
      for (const { article } of candidates) {
        if (list.length >= TARGET) break;

        const newArticle = {
          ...article,
          id: `${article.id}-dist-${category}`,
          category: category
        };
        list.push(newArticle);
      }

      console.log(`[Redistribution] ${category} now has ${list.length} articles (added ${list.length - (categoryMap.get(category)?.length || 0)} relevant articles)`);
    }

    // Limiter à TARGET maximum (mais accepter moins si pas assez d'articles pertinents)
    categoryMap.set(category, list.slice(0, TARGET));
  }

  // Log final
  ALL_CATEGORIES.forEach((cat) => {
    const count = categoryMap.get(cat)?.length || 0;
    console.log(`[Distribution] ${cat}: ${count} articles`);
  });

  // Combiner tout
  const result: NewsArticle[] = [];
  for (const list of categoryMap.values()) {
    result.push(...list);
  }

  console.log(`[Distribution] Final: ${result.length} articles distributed`);
  return result;
}
