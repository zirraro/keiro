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

// ===== CACHE MÉMOIRE CÔTÉ SERVEUR PAR RÉGION (24 heures - optimisé pour max 1-2 appels/jour) =====
const cachedByRegion: { [region: string]: { articles: NewsArticle[]; timestamp: number } } = {};
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
  // Généralistes (auto-catégorisés par keywords)
  { url: 'https://www.lemonde.fr/rss/une.xml', category: 'À la une', timeout: 5000 },
  { url: 'https://www.francetvinfo.fr/titres.rss', category: 'À la une', timeout: 5000 },
  { url: 'https://www.20minutes.fr/feeds/rss-une.xml', category: 'À la une', timeout: 5000 },

  // Bonnes nouvelles (flux feel-good dédiés)
  { url: 'https://positivr.fr/feed/', category: 'Les bonnes nouvelles', timeout: 5000 },
  { url: 'https://www.demotivateur.fr/feed', category: 'Les bonnes nouvelles', timeout: 5000 },

  // Tech & Gaming
  { url: 'https://www.numerama.com/feed/', category: 'Tech & Gaming', timeout: 5000 },
  { url: 'https://www.01net.com/rss/info.xml', category: 'Tech & Gaming', timeout: 5000 },
  { url: 'https://www.clubic.com/feed/', category: 'Tech & Gaming', timeout: 5000 },
  { url: 'https://www.journaldunet.com/rss/', category: 'Tech & Gaming', timeout: 5000 },
  { url: 'https://www.jeuxvideo.com/rss/rss.xml', category: 'Tech & Gaming', timeout: 5000 },
  { url: 'https://www.journaldugeek.com/feed/', category: 'Tech & Gaming', timeout: 5000 },
  { url: 'https://www.presse-citron.net/feed/', category: 'Tech & Gaming', timeout: 5000 },
  { url: 'https://hitek.fr/feed', category: 'Tech & Gaming', timeout: 5000 },

  // Business & Finance
  { url: 'https://www.challenges.fr/rss/une.xml', category: 'Business & Finance', timeout: 5000 },
  { url: 'https://www.capital.fr/rss', category: 'Business & Finance', timeout: 5000 },
  { url: 'https://www.lesechos.fr/rss.xml', category: 'Business & Finance', timeout: 5000 },
  { url: 'https://www.boursorama.com/bourse/rss/actualites/toutes', category: 'Business & Finance', timeout: 5000 },
  { url: 'https://www.latribune.fr/rss/a-la-une.html', category: 'Business & Finance', timeout: 5000 },

  // Santé & Bien-être
  { url: 'https://www.pourquoidocteur.fr/RSS/RSS.xml', category: 'Santé & Bien-être', timeout: 5000 },
  { url: 'https://www.santemagazine.fr/rss.xml', category: 'Santé & Bien-être', timeout: 5000 },
  { url: 'https://www.psychologies.com/RSS', category: 'Santé & Bien-être', timeout: 5000 },

  // Sport
  { url: 'https://www.lequipe.fr/rss/actu_rss.xml', category: 'Sport', timeout: 5000 },
  { url: 'https://www.sports.fr/feed/', category: 'Sport', timeout: 5000 },
  { url: 'https://rmcsport.bfmtv.com/rss/fil-info/', category: 'Sport', timeout: 5000 },

  // Cinéma & Séries
  { url: 'https://www.allocine.fr/rss/news.xml', category: 'Cinéma & Séries', timeout: 5000 },
  { url: 'https://www.premiere.fr/rss', category: 'Cinéma & Séries', timeout: 5000 },
  { url: 'https://www.ecranlarge.com/rss.xml', category: 'Cinéma & Séries', timeout: 5000 },

  // Musique & Festivals
  { url: 'https://www.chartsinfrance.net/rss.xml', category: 'Musique & Festivals', timeout: 5000 },
  { url: 'https://www.lesinrocks.com/musique/feed/', category: 'Musique & Festivals', timeout: 5000 },
  { url: 'https://www.radiofrance.fr/francemusique/rss', category: 'Musique & Festivals', timeout: 5000 },
  { url: 'https://www.ticketmaster.fr/discover/feed', category: 'Musique & Festivals', timeout: 5000 },

  // Politique
  { url: 'https://www.lemonde.fr/politique/rss_full.xml', category: 'Politique', timeout: 5000 },
  { url: 'https://www.francetvinfo.fr/politique.rss', category: 'Politique', timeout: 5000 },

  // Science & Environnement
  { url: 'https://www.sciencesetavenir.fr/rss.xml', category: 'Science & Environnement', timeout: 5000 },
  { url: 'https://www.futura-sciences.com/rss/actualites.xml', category: 'Science & Environnement', timeout: 5000 },
  { url: 'https://www.actu-environnement.com/flux/rss/actu-environnement.xml', category: 'Science & Environnement', timeout: 5000 },

  // Nature & Animaux
  { url: 'https://www.geo.fr/rss.xml', category: 'Nature & Animaux', timeout: 5000 },
  { url: 'https://www.lemonde.fr/planete/rss_full.xml', category: 'Nature & Animaux', timeout: 5000 },
  { url: 'https://reporterre.net/spip.php?page=backend', category: 'Nature & Animaux', timeout: 5000 },
  { url: 'https://www.30millionsdamis.fr/actualites/rss.xml', category: 'Nature & Animaux', timeout: 5000 },

  // International
  { url: 'https://www.france24.com/fr/rss', category: 'International', timeout: 5000 },
  { url: 'https://www.lemonde.fr/international/rss_full.xml', category: 'International', timeout: 5000 },

  // Moteurs & Adrénaline
  { url: 'https://www.automobile-magazine.fr/rss.xml', category: 'Moteurs & Adrénaline', timeout: 5000 },
  { url: 'https://www.largus.fr/rss.xml', category: 'Moteurs & Adrénaline', timeout: 5000 },
  { url: 'https://www.caradisiac.com/rss/', category: 'Moteurs & Adrénaline', timeout: 5000 },

  // Food & Gastronomie
  { url: 'https://www.atabula.com/feed/', category: 'Food & Gastronomie', timeout: 5000 },
  { url: 'https://www.lhotellerie-restauration.fr/rss/', category: 'Food & Gastronomie', timeout: 5000 },

  // Lifestyle & People
  { url: 'https://www.elle.fr/rss.xml', category: 'Lifestyle & People', timeout: 5000 },
  { url: 'https://www.marieclaire.fr/rss.xml', category: 'Lifestyle & People', timeout: 5000 },
  { url: 'https://www.purepeople.com/rss.xml', category: 'Lifestyle & People', timeout: 5000 },
  { url: 'https://www.gala.fr/rss.xml', category: 'Lifestyle & People', timeout: 5000 },
  { url: 'https://www.voici.fr/rss.xml', category: 'Lifestyle & People', timeout: 5000 },
  { url: 'https://www.closermag.fr/rss.xml', category: 'Lifestyle & People', timeout: 5000 },
  { url: 'https://www.konbini.com/fr/feed/', category: 'Lifestyle & People', timeout: 5000 },
  { url: 'https://www.madmoizelle.com/feed/', category: 'Lifestyle & People', timeout: 5000 },
  { url: 'https://www.aufeminin.com/rss.xml', category: 'Lifestyle & People', timeout: 5000 },
  { url: 'https://www.grazia.fr/rss.xml', category: 'Lifestyle & People', timeout: 5000 },
  { url: 'https://www.cosmopolitan.fr/rss.xml', category: 'Lifestyle & People', timeout: 5000 },
];

// ===== FLUX RSS BELGES (francophone) =====
const RSS_FEEDS_BE = [
  { url: 'https://www.rtbf.be/article/rss', category: 'À la une', timeout: 5000 },
  { url: 'https://www.lesoir.be/rss/1/rubriques/18', category: 'À la une', timeout: 5000 },
  { url: 'https://www.lalibre.be/rss/section/actu.xml', category: 'À la une', timeout: 5000 },
  { url: 'https://www.dhnet.be/rss/section/actu.xml', category: 'À la une', timeout: 5000 },
  { url: 'https://www.7sur7.be/rss.xml', category: 'À la une', timeout: 5000 },
];

// ===== FLUX RSS MOYEN-ORIENT (anglophone) =====
const RSS_FEEDS_ME = [
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'À la une', timeout: 5000 },
  { url: 'https://www.arabnews.com/rss.xml', category: 'À la une', timeout: 5000 },
  { url: 'https://gulfnews.com/rss', category: 'À la une', timeout: 5000 },
  { url: 'https://www.middleeasteye.net/rss', category: 'À la une', timeout: 5000 },
  { url: 'https://english.alarabiya.net/tools/rss', category: 'À la une', timeout: 5000 },
];

// ===== FLUX RSS EUROPE DU NORD (anglophone) =====
const RSS_FEEDS_NORD = [
  { url: 'https://www.thelocal.se/feed', category: 'À la une', timeout: 5000 },
  { url: 'https://www.thelocal.no/feed', category: 'À la une', timeout: 5000 },
  { url: 'https://www.thelocal.dk/feed', category: 'À la une', timeout: 5000 },
  { url: 'https://nltimes.nl/feed/rss.xml', category: 'À la une', timeout: 5000 },
  { url: 'https://www.icelandreview.com/feed/', category: 'À la une', timeout: 5000 },
  { url: 'https://yle.fi/rss/uutiset.rss?publisherIds=YLE_UUTISET', category: 'À la une', timeout: 5000 },
];

// ===== RÉGIONS DISPONIBLES =====
export const NEWS_REGIONS = [
  { code: 'fr', nameFr: 'France', nameEn: 'France' },
  { code: 'be', nameFr: 'Belgique', nameEn: 'Belgium' },
  { code: 'es', nameFr: 'Espagne', nameEn: 'Spain' },
  { code: 'gb', nameFr: 'Royaume-Uni', nameEn: 'United Kingdom' },
  { code: 'us', nameFr: 'États-Unis', nameEn: 'United States' },
  { code: 'pt', nameFr: 'Portugal', nameEn: 'Portugal' },
  { code: 'me', nameFr: 'Moyen-Orient', nameEn: 'Middle East' },
  { code: 'nord', nameFr: 'Europe du Nord', nameEn: 'Northern Europe' },
] as const;

// Mots-clés pour catégorisation intelligente (15 catégories)
const CATEGORY_KEYWORDS: { [key: string]: string[] } = {
  'Moteurs & Adrénaline': [
    // Constructeurs auto
    'renault', 'peugeot', 'citroën', 'citroen', 'ds automobiles', 'alpine', 'bugatti', 'tesla', 'bmw', 'audi',
    'volkswagen', 'toyota', 'hyundai', 'kia', 'ford', 'porsche', 'ferrari', 'lamborghini', 'rolls-royce', 'bentley', 'maserati', 'aston martin', 'mclaren',
    'byd', 'nio', 'xpeng', 'geely', 'fiat', 'opel', 'nissan', 'mazda', 'honda auto', 'subaru', 'volvo', 'jaguar', 'land rover', 'mini cooper', 'seat', 'skoda', 'cupra',
    // F1 & sport auto
    'formule 1', 'formule1', 'grand prix auto', 'verstappen', 'hamilton f1', 'leclerc f1', 'sainz', 'alonso f1',
    'red bull racing', 'ferrari f1', 'mercedes f1', 'mclaren racing', 'alpine f1', 'williams f1', 'haas f1',
    'circuit automobile', 'pole position', 'podium f1', 'paddock', '24h du mans', 'le mans', 'rallye', 'wrc', 'dakar',
    'nascar', 'indycar', 'dtm', 'gt3', 'endurance automobile',
    // Moto
    'moto', 'motogp', 'motocross', 'superbike', 'yamaha moto', 'kawasaki', 'harley-davidson', 'harley davidson', 'ducati', 'ktm',
    'aprilia', 'triumph', 'indian motorcycle', 'bmw motorrad', 'scooter', 'trail', 'roadster', 'sportive moto',
    'marc marquez', 'bagnaia', 'quartararo', 'zarco',
    // Types de véhicules
    'voiture électrique', 'voiture hybride', 'suv', 'berline', 'citadine', 'coupé', 'cabriolet', '4x4', 'crossover', 'pick-up',
    'supercar', 'hypercar', 'voiture de sport', 'tuning', 'préparation auto',
    // Infrastructure & événements
    'borne de recharge', 'superchargeur', 'hybride rechargeable',
    'salon de l\'auto', 'mondial de l\'auto', 'salon de genève', 'salon de munich',
    'permis de conduire', 'sécurité routière', 'securite routiere', 'contrôle technique', 'controle technique',
    'essai routier', 'comparatif auto', 'crash test',
    // English keywords
    'car', 'automobile', 'electric vehicle', 'ev', 'self-driving', 'autonomous', 'formula one', 'racing', 'motorcycle', 'driver', 'engine', 'fuel', 'sedan', 'coupe', 'convertible', 'pickup truck', 'sports car', 'supercar race', 'motorbike', 'gp racing',
  ],

  'Tech & Gaming': [
    'intelligence artificielle', 'ia générative', 'ia generative', 'llm', 'chatgpt', 'gpt', 'gemini', 'claude', 'copilot',
    'openai', 'anthropic', 'google ai', 'meta ai', 'mistral ai', 'deepseek',
    'github', 'gitlab', 'typescript', 'react', 'next.js', 'vue', 'angular', 'python', 'javascript',
    'apple', 'iphone', 'ipad', 'macbook', 'samsung', 'galaxy', 'pixel', 'android', 'ios',
    'ransomware', 'phishing', 'data breach', 'fuite de données', 'fuite de donnees', 'rgpd', 'cybersécurité', 'cybersecurite',
    'crypto', 'bitcoin', 'ethereum', 'defi', 'staking', 'wallet', 'binance', 'coinbase', 'stablecoin', 'nft', 'web3', 'blockchain',
    'fortnite', 'league of legends', 'valorant', 'cs2', 'cs:go', 'minecraft', 'gta', 'call of duty', 'fifa', 'elden ring', 'steam',
    'epic games', 'ubisoft', 'lec', 'lcs', 'worlds', 'the international', 'esport',
    'playstation', 'xbox', 'nintendo', 'switch', 'ps5', 'jeu vidéo', 'jeux vidéo', 'jeux video', 'gaming', 'streamer', 'twitch',
    'robot', 'drone', 'réalité virtuelle', 'realite virtuelle', 'réalité augmentée', 'realite augmentee', 'metaverse',
    'application', 'app', 'mise à jour', 'mise a jour', 'fonctionnalité', 'fonctionnalite',
    // Ajouts: streaming gaming, quantique, puces, 5G/6G
    'streaming jeu', 'stream gaming', 'twitch stream', 'quantique', 'quantum', '5g', '6g',
    'semi-conducteur', 'puce', 'tsmc', 'intel', 'nvidia', 'amd', 'processeur',
    'impression 3d', '3d printing', 'deepfake', 'prompt engineering',
    // English keywords
    'artificial intelligence', 'machine learning', 'smartphone', 'cybersecurity', 'software', 'hardware', 'technology', 'computer', 'internet', 'digital', 'device', 'gadget', 'data breach', 'hacking', 'privacy', 'video game', 'console', 'virtual reality', 'augmented reality', 'wearable', 'chip manufacturing',
  ],

  'Business & Finance': [
    'blablacar', 'doctolib', 'contentsquare', 'mirakl', 'back market', 'vinted', 'amazon', 'alibaba', 'shopify', 'marketplace',
    'dropshipping', 'carrefour', 'auchan', 'leclerc', 'intermarché', 'casino', 'lidl', 'aldi',
    'trading', 'trader', 'dividende', 'indice boursier', 's&p 500', 'dow jones', 'nasdaq', 'obligations', 'forex', 'bnp paribas',
    'société générale', 'crédit agricole', 'la banque postale', 'boursorama', 'revolut', 'n26', 'lydia', 'paypal', 'stripe', 'klarna',
    'startup', 'levée de fonds', 'introduction en bourse', 'ipo', 'cac 40', 'bourse', 'inflation', 'taux', 'banque centrale', 'bce',
    // Ajouts: M&A, résultats, capital-risque, immobilier
    'acquisition', 'fusion', 'rachat', 'résultats financiers', 'résultats trimestriels', 'chiffre d\'affaires',
    'capital-risque', 'venture capital', 'private equity', 'fonds d\'investissement', 'valorisation',
    'immobilier', 'logement', 'loyer', 'propriétaire', 'locataire', 'prix immobilier',
    'pouvoir d\'achat', 'consommation', 'prix', 'coût de la vie', 'cout de la vie',
    // English keywords
    'stock market', 'investment', 'economy', 'gdp', 'trade', 'market cap', 'finance', 'banking', 'economic', 'revenue', 'profit', 'shares', 'bonds', 'interest rate', 'central bank', 'recession', 'growth', 'unemployment', 'inflation rate', 'tax', 'corporate', 'merger', 'earnings', 'venture capital',
  ],

  'Sport': [
    'ligue des champions', 'europa league', 'premier league', 'liga', 'serie a', 'bundesliga',
    'ligue 1', 'ligue 2', 'coupe de france', 'coupe du monde', 'euro 2024', 'euro 2028',
    'mbappé', 'mbappe', 'messi', 'ronaldo', 'haaland', 'neymar', 'griezmann', 'dembélé', 'dembele',
    'psg', 'om', 'ol', 'asse', 'real madrid', 'barcelone', 'manchester', 'liverpool', 'arsenal', 'juventus',
    'roland-garros', 'wimbledon', 'us open', 'open d\'australie', 'djokovic', 'nadal', 'federer', 'alcaraz', 'sinner',
    'indian wells', 'masters 1000', 'atp', 'wta',
    'nba', 'wembanyama', 'lebron james', 'stephen curry', 'lakers', 'warriors', 'celtics',
    'rugby', 'top 14', 'six nations', 'coupe du monde rugby', 'dupont', 'grand chelem rugby',
    'tour de france', 'cyclisme', 'pogacar', 'vingegaard',
    'jeux olympiques', 'jo 2024', 'jo 2028', 'paralympiques', 'athlétisme', 'natation',
    'handball', 'volley', 'basket', 'tennis', 'boxe', 'mma', 'ufc', 'judo', 'escrime',
    'transfert', 'mercato', 'entraîneur', 'entraineur', 'sélectionneur', 'selectionneur',
    'fitness', 'musculation', 'running', 'marathon', 'sport santé',
    // Ajouts: golf, equitation, sports d'hiver, challenge sportif
    'golf', 'ryder cup', 'pga', 'masters augusta',
    'ski', 'biathlon', 'patinage', 'hockey sur glace',
    'équitation', 'equitation', 'hippisme', 'course hippique',
    'badminton', 'ping-pong', 'tennis de table', 'triathlon', 'ironman',
    'défi sportif', 'record du monde', 'champion du monde', 'championnat',
    // English keywords
    'soccer', 'football match', 'basketball', 'championship', 'tournament', 'athlete', 'coach', 'league', 'goal', 'world cup', 'olympics', 'boxing', 'cricket', 'baseball', 'hockey', 'swimming', 'gold medal', 'trophy', 'playoff', 'final score', 'sports challenge', 'grand slam',
  ],

  'Cinéma & Séries': [
    'netflix', 'disney+', 'prime video', 'apple tv+', 'max', 'paramount+', 'canal+', 'ocs',
    'game of thrones', 'stranger things', 'the last of us', 'the mandalorian', 'wednesday', 'squid game',
    'marvel', 'dc', 'blockbuster', 'box-office', 'avengers', 'batman', 'spider-man',
    'film', 'cinéma', 'cinema', 'réalisateur', 'realisateur', 'acteur', 'actrice', 'oscar', 'césar', 'cesar',
    'cannes', 'festival de cannes', 'palme d\'or', 'berlinale', 'venise',
    'série', 'serie', 'saison', 'épisode', 'episode', 'bande-annonce', 'bande annonce', 'trailer',
    'sortie salle', 'avant-première', 'avant premiere', 'documentaire', 'animation',
    'streaming netflix', 'streaming disney', 'streaming prime', 'plateforme streaming',
    // English keywords
    'movie', 'tv show', 'television', 'director', 'box office', 'premiere', 'entertainment', 'screenplay', 'sequel', 'franchise', 'cinema release', 'award show', 'golden globe', 'emmy', 'bafta', 'sundance',
  ],

  'Musique & Festivals': [
    'aya nakamura', 'gims', 'stromae', 'angèle', 'orelsan', 'nekfeu', 'soprano', 'jul', 'sch', 'ninho',
    'pnl', 'booba', 'damso', 'clara luciani', 'pomme', 'juliette armanet', 'louane', 'vianney', 'slimane',
    'taylor swift', 'beyoncé', 'beyonce', 'drake', 'the weeknd', 'billie eilish', 'ariana grande', 'ed sheeran', 'rihanna',
    'coldplay', 'imagine dragons', 'daft punk', 'david guetta', 'dua lipa', 'bad bunny', 'kendrick lamar',
    'rap', 'hip-hop', 'pop', 'rock', 'électro', 'electro', 'house', 'techno', 'r&b', 'jazz', 'metal', 'reggaeton',
    'concert', 'tournée', 'tournee', 'festival', 'coachella', 'rock en seine', 'hellfest', 'solidays',
    'vieilles charrues', 'eurockéennes', 'eurockennes', 'francofolies', 'main square', 'lollapalooza',
    'album', 'single', 'clip', 'spotify', 'deezer', 'apple music', 'musique',
    'grammy', 'nrj music awards', 'victoires de la musique', 'chanteur', 'chanteuse', 'rappeur', 'dj',
    // English keywords
    'music', 'singer', 'rapper', 'band', 'tour', 'award', 'grammy', 'billboard', 'hit song', 'chart', 'record label', 'music video', 'live performance', 'headliner', 'sold out',
  ],

  'Nature & Animaux': [
    'biodiversité', 'biodiversite', 'faune', 'flore', 'espèce', 'espece', 'animal', 'animaux',
    'chien', 'chat', 'cheval', 'oiseau', 'dauphin', 'baleine', 'loup', 'ours', 'lion', 'tigre', 'éléphant', 'elephant',
    'panda', 'singe', 'requin', 'tortue', 'abeille', 'papillon', 'insecte',
    'parc national', 'réserve naturelle', 'reserve naturelle', 'forêt', 'foret', 'océan', 'ocean', 'récif', 'recif',
    'spa', 'refuge', 'adoption animal', 'bien-être animal', 'bien être animal', 'protection animale',
    'plastique océan', 'pollution plastique',
    'wwf', 'lpo', 'fondation 30 millions', 'extinction', 'espèce menacée', 'espece menacee',
    'jardin', 'jardinage', 'botanique', 'plante', 'arbre', 'agriculture biologique',
    'randonnée', 'randonnee', 'montagne', 'mer', 'nature', 'sauvage', 'photographe animalier',
    // English keywords
    'wildlife', 'species', 'conservation', 'zoo', 'endangered', 'forest', 'ocean', 'biodiversity', 'pet', 'dog', 'cat', 'bird', 'whale', 'dolphin', 'national park', 'habitat', 'ecosystem', 'marine life',
  ],

  'Food & Gastronomie': [
    'alain ducasse', 'cyril lignac', 'philippe etchebest', 'hélène darroze', 'helene darroze',
    'thierry marx', 'anne-sophie pic', 'yannick alléno', 'yannick alleno', 'guy savoy',
    'masterchef', 'top chef', 'cauchemar en cuisine', 'le meilleur pâtissier', 'le meilleur patissier',
    'street food', 'food truck', 'bistronomie', 'gastronomie', 'gastro',
    'restaurant', 'étoilé', 'etoile', 'michelin', 'guide michelin', 'fooding',
    'recette', 'cuisine', 'chef', 'pâtisserie', 'patisserie', 'boulangerie', 'brasserie', 'bistrot',
    'vin', 'vignoble', 'cru', 'millésime', 'millesime', 'sommelier', 'oenologie', 'champagne', 'bordeaux', 'bourgogne',
    'café', 'cafe', 'chocolat', 'fromage', 'terroir', 'aoc', 'aop', 'label rouge',
    'brunch', 'foodie', 'food porn', 'tendance culinaire', 'ouverture restaurant',
    // English keywords
    'restaurant', 'chef', 'recipe', 'cooking', 'food', 'cuisine', 'dining', 'gastronomy', 'gourmet', 'bakery', 'culinary', 'food truck', 'tasting', 'menu', 'dish',
  ],

  'Politique': [
    'renaissance', 'lr', 'les républicains', 'ps', 'parti socialiste', 'lfi', 'france insoumise',
    'rn', 'rassemblement national', 'eelv', 'modem', 'horizons', 'nouveau front populaire',
    'emmanuel macron', 'marine le pen', 'jean-luc mélenchon', 'jean-luc melenchon',
    'édouard philippe', 'edouard philippe', 'bruno le maire', 'gabriel attal', 'élisabeth borne', 'elisabeth borne',
    'gérald darmanin', 'gerald darmanin', 'premier ministre', 'président de la république', 'president',
    'motion de censure', '49.3', 'projet de loi', 'plf', 'budget', 'fiscalité', 'fiscalite',
    'assemblée nationale', 'assemblee nationale', 'sénat', 'senat', 'parlement', 'député', 'depute', 'sénateur', 'senateur',
    'élection', 'election', 'scrutin', 'vote', 'référendum', 'referendum', 'sondage politique',
    'réforme', 'reforme', 'retraites', 'immigration', 'sécurité', 'securite', 'justice',
    'mairie', 'région', 'region', 'département', 'departement', 'collectivité', 'collectivite',
    // Ajouts: municipales, dissuasion, taxe, pouvoir d'achat politique
    'municipales', 'élections municipales', 'elections municipales', 'premier tour', 'second tour',
    'dissuasion', 'nucléaire français', 'nucleaire francais', 'politique étrangère', 'politique etrangere',
    'carte grise', 'taxe', 'impôt', 'impot', 'cotisation', 'dette publique',
    'manifestation', 'grève', 'greve', 'syndicat', 'cgt', 'cfdt',
    // English keywords
    'election', 'president', 'parliament', 'government', 'policy', 'political', 'minister', 'congress', 'senate', 'vote', 'democracy', 'campaign', 'legislation', 'law', 'prime minister', 'opposition', 'coalition',
  ],

  'Santé & Bien-être': [
    'alzheimer', 'parkinson', 'diabète', 'diabete', 'avc', 'infarctus', 'hypertension', 'cholestérol', 'cholesterol',
    'cancer', 'tumeur', 'chimiothérapie', 'chimiotherapie', 'dépistage', 'depistage', 'diagnostic',
    'régime', 'végétarien', 'vegetarien', 'vegan', 'bio', 'nutrition', 'diététique', 'dietetique',
    'sans gluten', 'keto', 'jeûne intermittent', 'yoga', 'méditation', 'meditation', 'mindfulness', 'bien-être', 'bien être',
    'sommeil', 'stress', 'burn-out', 'burnout', 'anxiété', 'anxiete', 'dépression', 'depression',
    'hôpital', 'hopital', 'clinique', 'médecin', 'medecin', 'infirmier', 'pharmacie', 'médicament', 'medicament',
    'assurance maladie', 'sécurité sociale', 'mutuelle', 'oms', 'pandémie', 'pandemie', 'épidémie', 'epidemie',
    'pilates', 'stretching',
    'dermatologue', 'ophtalmologue', 'dentiste', 'kiné', 'kine', 'ostéopathe', 'osteopathe',
    // English keywords
    'hospital', 'vaccine', 'disease', 'treatment', 'medicine', 'health', 'medical', 'doctor', 'patient', 'surgery', 'therapy', 'mental health', 'wellness', 'drug', 'clinical trial', 'pandemic', 'epidemic', 'diagnosis',
  ],

  'Science & Environnement': [
    'spacex', 'blue origin', 'mars', 'lune', 'iss', 'james webb', 'télescope', 'crispr', 'génétique', 'adn',
    'clonage', 'cellules souches', 'cnrs', 'cern', 'esa', 'nasa', 'mit', 'stanford',
    'nucléaire', 'photovoltaïque', 'biomasse', 'géothermie', 'hydrogène vert', 'neutralité carbone', 'empreinte carbone', 'bilan carbone', 'compensation carbone', 'cop28',
    'cop29', 'giec', 'accord de paris', 'réchauffement climatique', 'biodiversité', 'pollution', 'écologie', 'développement durable',
    // English keywords
    'space', 'climate', 'research', 'scientist', 'discovery', 'study', 'laboratory', 'climate change', 'global warming', 'renewable energy', 'carbon', 'emissions', 'solar', 'wind power', 'fossil fuel', 'sustainability', 'experiment', 'breakthrough',
  ],

  'International': [
    'ukraine', 'gaza', 'palestine', 'israël', 'israel', 'taïwan', 'taiwan', 'corée du nord', 'coree du nord',
    'iran', 'syrie', 'liban', 'irak', 'afghanistan', 'soudan', 'éthiopie', 'ethiopie', 'congo',
    'joe biden', 'donald trump', 'xi jinping', 'vladimir poutine', 'zelensky', 'netanyahu', 'modi',
    'khamenei', 'hezbollah', 'hamas', 'conflit', 'frappe', 'missile', 'drone militaire', 'opération militaire', 'operation militaire',
    'cessez-le-feu', 'cessez le feu', 'négociations de paix', 'négociation', 'escalade',
    'otan', 'onu', 'ue', 'union européenne', 'union europeenne', 'fmi', 'banque mondiale', 'g7', 'g20', 'brics',
    'diplomatie', 'ambassade', 'sanctions', 'embargo', 'traité', 'traite', 'accord international',
    'migrant', 'réfugié', 'refugie', 'frontière', 'frontiere', 'géopolitique', 'geopolitique',
    'états-unis', 'etats-unis', 'chine', 'russie', 'inde', 'brésil', 'bresil', 'japon', 'afrique',
    'moyen-orient', 'asie', 'amérique latine', 'amerique latine',
    // English keywords
    'war', 'conflict', 'treaty', 'diplomacy', 'sanctions', 'refugee', 'border', 'military', 'peace talks', 'ceasefire', 'humanitarian', 'foreign policy', 'embassy', 'summit', 'alliance',
  ],

  'Lifestyle & People': [
    'chanel', 'dior', 'louis vuitton', 'hermès', 'hermes', 'gucci', 'prada', 'zara', 'h&m', 'sephora', 'l\'oréal',
    'lancôme', 'lancome', 'mac', 'fenty beauty', 'skincare', 'routine beauté', 'routine beaute',
    'mode', 'fashion', 'tendance', 'collection', 'défilé', 'defile', 'fashion week',
    'airbnb', 'booking', 'tripadvisor', 'city break', 'road trip', 'voyage', 'destination', 'vacances',
    'marion cotillard', 'léa seydoux', 'lea seydoux', 'vincent cassel', 'omar sy', 'gad elmaleh', 'jamel debbouze',
    'dany boon', 'jean dujardin', 'guillaume canet',
    'squeezie', 'cyprien', 'léna situations', 'lena situations', 'mcfly et carlito', 'tibo inshape', 'inoxtag', 'michou',
    'les marseillais', 'koh-lanta', 'koh lanta', 'danse avec les stars', 'the voice', 'tpmp', 'hanouna',
    'kim kardashian', 'brad pitt', 'angelina jolie', 'leonardo dicaprio', 'tom cruise', 'zendaya',
    'paparazzi', 'jet-set', 'people', 'célébrité', 'celebrite', 'tapis rouge',
    'tiktok', 'instagram reels', 'youtube shorts', 'influenceur', 'créateur de contenu', 'createur de contenu',
    'ugc', 'trend tiktok', 'challenge tiktok', 'challenge viral', 'vidéo virale',
    'décoration', 'decoration', 'déco', 'deco', 'intérieur', 'interieur', 'ikea', 'maison',
    'mariage', 'fiançailles', 'fiancailles', 'couple célèbre', 'couple celebre',
    // English keywords
    'fashion', 'celebrity', 'beauty', 'travel', 'vacation', 'luxury', 'influencer', 'lifestyle', 'wedding', 'red carpet', 'paparazzi', 'royal family', 'reality show', 'social media star',
  ],
};

// Score d'une catégorie spécifique pour un article
function getCategoryScore(titleLower: string, descLower: string, category: string): number {
  const keywords = CATEGORY_KEYWORDS[category];
  if (!keywords) return 0;
  let score = 0;
  for (const kw of keywords) {
    if (titleLower.includes(kw)) score += 3;
    if (descLower.includes(kw)) score += 1;
  }
  return score;
}

// Catégoriser avec scoring pondéré (titre = 3x, description = 1x)
function categorizeArticle(title: string, description: string): string {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();

  let bestCategory = 'Dernières news';
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
async function fetchFromRSS(feeds: typeof RSS_FEEDS = RSS_FEEDS): Promise<NewsArticle[]> {
  console.log('[RSS] Fetching from RSS feeds...');
  const allArticles: NewsArticle[] = [];
  let articleCounter = 0;

  const results = await Promise.allSettled(
    feeds.map(async (feed, feedIndex) => {
      try {
        // Timeout pour éviter les blocages
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), feed.timeout || 8000);

        const parsed = await parser.parseURL(feed.url);
        clearTimeout(timeoutId);

        const articles: NewsArticle[] = [];

        for (const item of parsed.items.slice(0, 20)) {
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

          // CATÉGORISATION INTELLIGENTE : scoring par mots-clés sur TOUS les flux
          let detectedCategory = feed.category;
          const titleLower = title.toLowerCase();
          const descLower = description.toLowerCase();

          if (feed.category === 'À la une' || feed.category === 'Dernières news') {
            // Flux génériques : toujours catégoriser par mots-clés
            detectedCategory = categorizeArticle(title, description);
          } else if (feed.category !== 'Les bonnes nouvelles') {
            // Flux spécialisés : recatégoriser si les mots-clés indiquent fortement une autre catégorie
            // Ex: article cuisine dans un flux Lifestyle → Food & Gastronomie
            const autoCategory = categorizeArticle(title, description);
            if (autoCategory !== feed.category && autoCategory !== 'Dernières news') {
              const feedScore = getCategoryScore(titleLower, descLower, feed.category);
              const autoScore = getCategoryScore(titleLower, descLower, autoCategory);
              // Override si le score auto est >= 3 ET (le feed score est 0 OU auto > 2x feed)
              if (autoScore >= 3 && (feedScore === 0 || autoScore > feedScore * 2)) {
                detectedCategory = autoCategory;
              }
            }
          }
          // "Les bonnes nouvelles" : toujours garder (catégorie éditoriale, pas thématique)

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
async function fetchFromAPIs(country: string = 'fr', lang: string = 'fr'): Promise<NewsArticle[]> {
  console.log(`[API] Fetching from API providers (country=${country}, lang=${lang})...`);
  const allArticles: NewsArticle[] = [];

  // GNews API
  try {
    const gnewsUrl = `${API_PROVIDERS.gnews.baseUrl}/top-headlines?token=${API_PROVIDERS.gnews.key}&country=${country}&lang=${lang}&max=50`;
    const response = await fetch(gnewsUrl);
    const data = await response.json();

    if (data.articles) {
      data.articles.forEach((article: any, idx: number) => {
        const title = article.title || '';
        const description = article.description || '';
        const detectedCategory = categorizeArticle(title, description);

        allArticles.push({
          id: `gnews-${country}-${idx}`,
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
    console.log(`[API] GNews (${country}): ${data.articles?.length || 0} articles`);
  } catch (error: any) {
    console.error(`[API] GNews (${country}) error:`, error.message);
  }

  // NewsData.io API
  try {
    const newsdataUrl = `${API_PROVIDERS.newsdata.baseUrl}/news?apikey=${API_PROVIDERS.newsdata.key}&country=${country}&language=${lang}&size=50`;
    const response = await fetch(newsdataUrl);
    const data = await response.json();

    if (data.results) {
      data.results.forEach((article: any, idx: number) => {
        const title = article.title || '';
        const description = article.description || '';
        const detectedCategory = categorizeArticle(title, description);

        allArticles.push({
          id: `newsdata-${country}-${idx}`,
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
    console.log(`[API] NewsData (${country}): ${data.results?.length || 0} articles`);
  } catch (error: any) {
    console.error(`[API] NewsData (${country}) error:`, error.message);
  }

  console.log(`[API] Total from APIs (${country}): ${allArticles.length} articles`);
  return allArticles;
}

// ===== DÉDUPLICATION =====
/** Calcule la similarité entre 2 chaînes (Dice coefficient sur bigrammes) */
function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-zà-ÿ0-9 ]/g, '').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const bigrams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bi = s.substring(i, i + 2);
      set.set(bi, (set.get(bi) || 0) + 1);
    }
    return set;
  };
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let matches = 0;
  for (const [bi, count] of ba) {
    matches += Math.min(count, bb.get(bi) || 0);
  }
  return (2 * matches) / (na.length - 1 + nb.length - 1);
}

function deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const unique: NewsArticle[] = [];

  for (const article of articles) {
    const key = article.url.toLowerCase();
    if (seen.has(key)) continue;

    // Vérifier similarité de titre avec les articles déjà gardés (>50% = doublon)
    let isDuplicate = false;
    for (const existing of unique) {
      if (titleSimilarity(article.title, existing.title) > 0.5) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;

    seen.add(key);
    unique.push(article);
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
export async function fetchNews(region: string = 'fr'): Promise<NewsArticle[]> {
  // Vérifier le cache par région
  const now = Date.now();
  const cached = cachedByRegion[region];
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    const ageMinutes = Math.round((now - cached.timestamp) / 1000 / 60);
    console.log(`[Cache] Returning ${cached.articles.length} cached articles for region '${region}' (age: ${ageMinutes}min / ${Math.round(ageMinutes / 60)}h)`);

    // Log du nombre d'articles par catégorie dans le cache
    const byCategory: { [key: string]: number } = {};
    cached.articles.forEach(article => {
      byCategory[article.category || 'Unknown'] = (byCategory[article.category || 'Unknown'] || 0) + 1;
    });
    console.log(`[Cache] Articles par catégorie (${region}):`, byCategory);

    return cached.articles;
  }

  console.log(`[Fetch] Cache expired or empty for region '${region}', fetching fresh news...`);

  try {
    let articles: NewsArticle[] = [];

    if (region === 'fr') {
      // France: RSS primary + API fallback (comportement existant)
      articles = await fetchFromRSS(RSS_FEEDS);
      if (articles.length < 30) {
        console.log(`[Fallback] RSS returned only ${articles.length} articles, trying APIs...`);
        const apiArticles = await fetchFromAPIs('fr', 'fr');
        articles = [...articles, ...apiArticles];
      }
    } else if (region === 'be') {
      // Belgique: RSS belges + API
      articles = await fetchFromRSS(RSS_FEEDS_BE);
      const apiArticles = await fetchFromAPIs('be', 'fr');
      articles = [...articles, ...apiArticles];
    } else if (region === 'me') {
      // Moyen-Orient: RSS dédiés + API pays arabes
      articles = await fetchFromRSS(RSS_FEEDS_ME);
      const countries = ['ae', 'sa', 'kw', 'qa', 'eg'];
      for (const c of countries.slice(0, 3)) {
        const apiArticles = await fetchFromAPIs(c, 'en');
        articles = [...articles, ...apiArticles];
      }
    } else if (region === 'nord') {
      // Europe du Nord: RSS dédiés + API pays nordiques
      articles = await fetchFromRSS(RSS_FEEDS_NORD);
      const countries = ['se', 'no', 'nl', 'dk'];
      for (const c of countries.slice(0, 2)) {
        const apiArticles = await fetchFromAPIs(c, 'en');
        articles = [...articles, ...apiArticles];
      }
    } else {
      // Pays unique: utiliser API avec lang=en pour meilleure couverture
      const langMap: Record<string, string> = { es: 'en', gb: 'en', us: 'en', pt: 'en' };
      const apiArticles = await fetchFromAPIs(region, langMap[region] || 'en');
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
      console.warn(`[Warning] Catégories vides (${region}): ${emptyCategories.join(', ')}`);
    }

    // Mettre en cache par région
    cachedByRegion[region] = { articles, timestamp: now };

    console.log(`[Success] Cached ${articles.length} articles for region '${region}' for 24h`);
    console.log(`[Success] Articles par catégorie (${region}):`, byCategory);
    return articles;
  } catch (error: any) {
    console.error(`[Error] Failed to fetch news for region '${region}':`, error.message);

    // En cas d'erreur, retourner cache même périmé si disponible
    const staleCache = cachedByRegion[region];
    if (staleCache) {
      console.log(`[Fallback] Returning stale cache for region '${region}'`);
      return staleCache.articles;
    }

    return [];
  }
}
