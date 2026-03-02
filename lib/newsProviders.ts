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
  ],

  'Business & Finance': [
    'blablacar', 'doctolib', 'contentsquare', 'mirakl', 'back market', 'vinted', 'amazon', 'alibaba', 'shopify', 'marketplace',
    'dropshipping', 'carrefour', 'auchan', 'leclerc', 'intermarché', 'casino', 'lidl', 'aldi',
    'trading', 'trader', 'dividende', 'indice boursier', 's&p 500', 'dow jones', 'nasdaq', 'obligations', 'forex', 'bnp paribas',
    'société générale', 'crédit agricole', 'la banque postale', 'boursorama', 'revolut', 'n26', 'lydia', 'paypal', 'stripe', 'klarna',
    'startup', 'levée de fonds', 'introduction en bourse', 'ipo', 'cac 40', 'bourse', 'inflation', 'taux', 'banque centrale', 'bce'
  ],

  'Sport': [
    'ligue des champions', 'europa league', 'premier league', 'liga', 'serie a', 'bundesliga',
    'ligue 1', 'ligue 2', 'coupe de france', 'coupe du monde', 'euro 2024', 'euro 2028',
    'mbappé', 'mbappe', 'messi', 'ronaldo', 'haaland', 'neymar', 'griezmann', 'dembélé', 'dembele',
    'psg', 'om', 'ol', 'asse', 'real madrid', 'barcelone', 'manchester', 'liverpool', 'arsenal', 'juventus',
    'roland-garros', 'wimbledon', 'us open', 'open d\'australie', 'djokovic', 'nadal', 'federer', 'alcaraz', 'sinner',
    'nba', 'wembanyama', 'lebron james', 'stephen curry', 'lakers', 'warriors', 'celtics',
    'rugby', 'top 14', 'six nations', 'coupe du monde rugby', 'dupont',
    'tour de france', 'cyclisme', 'pogacar', 'vingegaard',
    'jeux olympiques', 'jo 2024', 'jo 2028', 'paralympiques', 'athlétisme', 'natation',
    'handball', 'volley', 'basket', 'tennis', 'boxe', 'mma', 'ufc', 'judo', 'escrime',
    'transfert', 'mercato', 'entraîneur', 'entraineur', 'sélectionneur', 'selectionneur',
  ],

  'Cinéma & Séries': [
    'netflix', 'disney+', 'prime video', 'apple tv+', 'max', 'paramount+', 'canal+', 'ocs',
    'game of thrones', 'stranger things', 'the last of us', 'the mandalorian', 'wednesday', 'squid game',
    'marvel', 'dc', 'blockbuster', 'box-office', 'avengers', 'batman', 'spider-man',
    'best-seller', 'goncourt', 'renaudot', 'femina', 'prix littéraire', 'prix litteraire',
    'film', 'cinéma', 'cinema', 'réalisateur', 'realisateur', 'acteur', 'actrice', 'oscar', 'césar', 'cesar',
    'cannes', 'festival de cannes', 'palme d\'or', 'berlinale', 'venise',
    'série', 'serie', 'saison', 'épisode', 'episode', 'bande-annonce', 'bande annonce', 'trailer',
    'sortie salle', 'avant-première', 'avant premiere', 'documentaire', 'animation',
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
  ],

  'Nature & Animaux': [
    'biodiversité', 'biodiversite', 'faune', 'flore', 'espèce', 'espece', 'animal', 'animaux',
    'chien', 'chat', 'cheval', 'oiseau', 'dauphin', 'baleine', 'loup', 'ours', 'lion', 'tigre', 'éléphant', 'elephant',
    'panda', 'singe', 'requin', 'tortue', 'abeille', 'papillon', 'insecte',
    'parc national', 'réserve naturelle', 'reserve naturelle', 'forêt', 'foret', 'océan', 'ocean', 'récif', 'recif',
    'spa', 'refuge', 'adoption animal', 'bien-être animal', 'bien être animal', 'protection animale',
    'écologie', 'ecologie', 'climat', 'réchauffement', 'rechauffement', 'pollution', 'plastique',
    'reforestation', 'déforestation', 'deforestation', 'zone protégée', 'zone protegee',
    'wwf', 'greenpeace', 'lpo', 'fondation 30 millions', 'extinction', 'espèce menacée', 'espece menacee',
    'jardin', 'jardinage', 'botanique', 'plante', 'arbre', 'agriculture biologique',
    'randonnée', 'randonnee', 'montagne', 'mer', 'nature', 'sauvage', 'photographe animalier',
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
  ],

  'Santé & Bien-être': [
    'alzheimer', 'parkinson', 'diabète', 'diabete', 'avc', 'infarctus', 'hypertension', 'cholestérol', 'cholesterol',
    'cancer', 'tumeur', 'chimiothérapie', 'chimiotherapie', 'dépistage', 'depistage', 'diagnostic',
    'régime', 'végétarien', 'vegetarien', 'vegan', 'bio', 'nutrition', 'diététique', 'dietetique',
    'sans gluten', 'keto', 'jeûne intermittent', 'yoga', 'méditation', 'meditation', 'mindfulness', 'bien-être', 'bien être',
    'sommeil', 'stress', 'burn-out', 'burnout', 'anxiété', 'anxiete', 'dépression', 'depression',
    'hôpital', 'hopital', 'clinique', 'médecin', 'medecin', 'infirmier', 'pharmacie', 'médicament', 'medicament',
    'assurance maladie', 'sécurité sociale', 'mutuelle', 'oms', 'pandémie', 'pandemie', 'épidémie', 'epidemie',
    'fitness', 'musculation', 'running', 'marathon', 'pilates', 'stretching', 'sport santé',
    'dermatologue', 'ophtalmologue', 'dentiste', 'kiné', 'kine', 'ostéopathe', 'osteopathe',
  ],

  'Science & Environnement': [
    'spacex', 'blue origin', 'mars', 'lune', 'iss', 'james webb', 'télescope', 'crispr', 'génétique', 'adn',
    'clonage', 'cellules souches', 'cnrs', 'cern', 'esa', 'nasa', 'mit', 'stanford',
    'nucléaire', 'photovoltaïque', 'biomasse', 'géothermie', 'hydrogène vert', 'neutralité carbone', 'empreinte carbone', 'bilan carbone', 'compensation carbone', 'cop28',
    'cop29', 'giec', 'accord de paris', 'réchauffement climatique', 'biodiversité', 'pollution', 'écologie', 'développement durable'
  ],

  'International': [
    'ukraine', 'gaza', 'palestine', 'israël', 'israel', 'taïwan', 'taiwan', 'corée du nord', 'coree du nord',
    'iran', 'syrie', 'liban', 'irak', 'afghanistan', 'soudan', 'éthiopie', 'ethiopie', 'congo',
    'joe biden', 'donald trump', 'xi jinping', 'vladimir poutine', 'zelensky', 'netanyahu', 'modi',
    'otan', 'onu', 'ue', 'union européenne', 'union europeenne', 'fmi', 'banque mondiale', 'g7', 'g20', 'brics',
    'diplomatie', 'ambassade', 'sanctions', 'embargo', 'traité', 'traite', 'accord international',
    'migrant', 'réfugié', 'refugie', 'frontière', 'frontiere', 'géopolitique', 'geopolitique',
    'états-unis', 'etats-unis', 'chine', 'russie', 'inde', 'brésil', 'bresil', 'japon', 'afrique',
    'moyen-orient', 'asie', 'amérique latine', 'amerique latine',
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
    'ugc', 'trend', 'challenge', 'viral',
    'décoration', 'decoration', 'déco', 'deco', 'intérieur', 'interieur', 'ikea', 'maison',
  ],
};

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

          // CATÉGORISATION : priorité au flux RSS, recatégorisation uniquement pour flux génériques
          let detectedCategory = feed.category;

          // Pour "À la une" uniquement, utiliser la catégorisation auto pour disperser dans les catégories
          if (feed.category === 'À la une') {
            const autoCategory = categorizeArticle(title, description);
            detectedCategory = autoCategory;
          }
          // Pour les autres flux spécialisés, TOUJOURS garder leur catégorie
          // (ex: un flux Tech & Gaming reste Tech & Gaming, un flux Sport reste Sport)

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
