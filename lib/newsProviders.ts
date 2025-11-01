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

// ===== CACHE MÉMOIRE CÔTÉ SERVEUR (24 heures - max 1-2 appels API par jour) =====
let cachedArticles: NewsArticle[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 heures

// ===== CONFIGURATION API PROVIDERS =====
const API_PROVIDERS = {
  gnews: {
    key: '14cef0dcc6437084dab9a432df281e98',
    baseUrl: 'https://gnews.io/api/v4',
    endpoint: '/top-headlines',
  },
  newsdata: {
    key: 'pub_f0d6177c8ef44e26ab72a1723d21b088',
    baseUrl: 'https://newsdata.io/api/1',
    endpoint: '/news',
  },
  eventregistry: {
    key: '22c2c608-833e-4050-8925-9e9f7e7e1cf9',
    baseUrl: 'https://eventregistry.org/api/v1',
    endpoint: '/article/getArticles',
  },
};

// Mots-clés ENRICHIS pour catégorisation automatique
const CATEGORY_KEYWORDS: { [key: string]: string[] } = {
  'Tech': ['tech', 'technolog', 'technique', 'ai', 'ia', 'intel', 'artificial', 'intelligence', 'numér', 'digit', 'cyber', 'cybersécurité', 'app', 'application', 'logiciel', 'software', 'internet', 'web', 'site', 'ordin', 'comput', 'informatique', 'phone', 'smartphone', 'mobile', 'iphone', 'android', 'google', 'apple', 'microsoft', 'amazon', 'meta', 'facebook', 'twitter', 'x.com', 'tiktok', 'instagram', 'snapchat', 'linkedin', 'youtube', 'whatsapp', 'telegram', 'cloud', 'data', 'données', 'algorithme', 'robot', 'robotique', 'drone', '4g', '5g', '6g', 'blockchain', 'nft', 'metaverse', 'réalité virtuelle', 'vr', 'ar', 'chatgpt', 'openai', 'anthropic', 'claude', 'gemini', 'mistral', 'hugging face', 'tesla', 'spacex', 'innovation', 'startup', 'licorne', 'silicon', 'valley', 'coding', 'programmation', 'développeur', 'developer', 'github', 'gitlab', 'saas', 'paas', 'iaas', 'api', 'interface', 'ux', 'ui', 'design', 'figma', 'adobe', 'photoshop', 'illustrator', 'streaming', 'netflix', 'spotify', 'deezer', 'twitch', 'discord', 'slack', 'zoom', 'teams', 'pixel', 'samsung', 'huawei', 'xiaomi', 'oppo', 'oneplus', 'processeur', 'puce', 'chip', 'intel', 'amd', 'nvidia', 'gaming pc', 'gaming laptop', 'ordinateur'],

  'Business': ['business', 'entrepr', 'entrepreneur', 'entrepreneuriat', 'économ', 'econom', 'économique', 'startup', 'scale-up', 'pme', 'tpe', 'eti', 'groupe', 'sociét', 'compan', 'entreprise', 'firme', 'pdg', 'ceo', 'cfo', 'coo', 'cmo', 'cto', 'dirigeant', 'direction', 'patron', 'boss', 'manager', 'management', 'salarié', 'employé', 'emploi', 'job', 'travail', 'work', 'télétravail', 'remote', 'recrutement', 'hiring', 'embauche', 'commerce', 'retail', 'b2b', 'b2c', 'vente', 'sales', 'marketing', 'digital marketing', 'publicité', 'pub', 'communication', 'stratégie', 'business plan', 'plan', 'croissance', 'growth', 'develop', 'développement', 'expansion', 'invest', 'investissement', 'levée', 'levée de fonds', 'funding', 'round', 'série a', 'série b', 'acquisition', 'fusion', 'rachat', 'opa', 'partenariat', 'partnership', 'deal', 'contrat', 'client', 'customer', 'fournisseur', 'supplier', 'distribution', 'logistique', 'supply chain', 'production', 'productivité', 'performance', 'résultat', 'chiffre d\'affaires', 'ca', 'turnover', 'revenue', 'profit', 'bénéfice', 'marge', 'rentabilité', 'business model', 'modèle', 'innovation', 'transformation', 'digitale'],

  'Finance': ['financ', 'financier', 'financement', 'banqu', 'bank', 'banque', 'crédit agricole', 'bnp', 'société générale', 'lcl', 'caisse d\'épargne', 'bours', 'stock', 'stock market', 'marché', 'action', 'actions', 'obligation', 'obligations', 'bond', 'fond', 'fonds', 'etf', 'sicav', 'placement', 'investissement', 'épargne', 'saving', 'livret', 'pel', 'invest', 'investor', 'investisseur', 'portefeuille', 'portfolio', 'trading', 'trader', 'broker', 'courtier', 'forex', 'change', 'devise', 'crypto', 'cryptomonnaie', 'cryptocurrency', 'bitcoin', 'btc', 'ethereum', 'eth', 'binance', 'coinbase', 'monnaie', 'euro', 'eur', 'dollar', 'usd', 'livre', 'yen', 'yuan', 'taux', 'taux d\'intérêt', 'interest', 'crédit', 'prêt', 'loan', 'emprunt', 'dette', 'endettement', 'déficit', 'surplus', 'inflation', 'déflation', 'cac 40', 'cac40', 'dow jones', 'nasdaq', 's&p 500', 'ftse', 'dax', 'nikkei', 'indice', 'cotation', 'cours', 'valorisation', 'capitalisation', 'market cap', 'assurance', 'assureur', 'mutuelle', 'retraite', 'pension', 'épargne retraite', 'immobil', 'immobilier', 'scpi', 'reit', 'patrimoine', 'gestion', 'asset management', 'wealth', 'private equity', 'hedge fund', 'régulation', 'amf', 'bce', 'fed', 'banque centrale'],

  'Santé': ['santé', 'health', 'sanitaire', 'médic', 'medical', 'médecin', 'doctor', 'docteur', 'généraliste', 'spécialiste', 'hôpit', 'hospital', 'chu', 'clinique', 'cabinet', 'patient', 'consultation', 'rendez-vous', 'maladie', 'disease', 'pathologie', 'symptôme', 'diagnostic', 'cancer', 'oncologie', 'tumeur', 'chimiothérapie', 'radiothérapie', 'diabète', 'diabétique', 'glycémie', 'insuline', 'covid', 'coronavirus', 'pandémie', 'épidémie', 'contagion', 'contamination', 'virus', 'bactérie', 'infection', 'vaccin', 'vaccine', 'vaccination', 'dose', 'rappel', 'immunité', 'anticorps', 'traitement', 'treat', 'médicament', 'medicament', 'prescription', 'ordonnance', 'soin', 'care', 'cure', 'thérapie', 'pharmacie', 'pharmacien', 'médicament', 'drug', 'pilule', 'comprimé', 'gélule', 'sirop', 'pommade', 'nutrition', 'nutritionniste', 'diététique', 'alimentat', 'alimentation', 'régime', 'diet', 'obésité', 'surpoids', 'anorexie', 'boulimie', 'fitness', 'musculation', 'cardio', 'bien-être', 'wellness', 'santé mentale', 'mental', 'psycho', 'psychologie', 'psychiatrie', 'dépression', 'anxiété', 'stress', 'burn-out', 'thérapie', 'psychothérapie', 'chirurgie', 'chirurgien', 'opération', 'intervention', 'bloc opératoire', 'anesthésie', 'urgence', 'samu', 'pompier', 'secours', 'réanimation', 'soins intensifs'],

  'Sport': ['sport', 'sportif', 'sportive', 'athlète', 'champion', 'championne', 'foot', 'football', 'soccer', 'ligue 1', 'ligue 2', 'ligue des champions', 'champions league', 'europa league', 'coupe de france', 'coupe', 'cup', 'mondial', 'euro', 'match', 'rencontre', 'partie', 'finale', 'demi-finale', 'quart', 'joueur', 'player', 'buteur', 'gardien', 'défenseur', 'milieu', 'attaquant', 'équipe', 'team', 'club', 'entraîneur', 'coach', 'sélectionneur', 'psg', 'paris saint-germain', 'om', 'olympique marseille', 'ol', 'olympique lyon', 'asse', 'monaco', 'nice', 'lens', 'lille', 'rennes', 'real madrid', 'barça', 'barcelona', 'manchester united', 'manchester city', 'liverpool', 'chelsea', 'arsenal', 'bayern', 'bayern munich', 'juventus', 'milan', 'inter', 'tennis', 'atp', 'wta', 'roland-garros', 'wimbledon', 'us open', 'open d\'australie', 'grand chelem', 'rugby', 'top 14', 'coupe du monde rugby', 'tournoi', 'basket', 'basketball', 'nba', 'euroleague', 'jeep elite', 'betclic elite', 'formule 1', 'f1', 'grand prix', 'gp', 'course', 'pilote', 'écurie', 'moto gp', 'motogp', 'rallye', 'olympique', 'jeux olympiques', 'jo', 'paralympique', 'athlétisme', 'sprint', 'marathon', 'saut', 'lancer', 'natation', 'piscine', 'cyclisme', 'vélo', 'tour de france', 'giro', 'vuelta', 'ski', 'snowboard', 'sports d\'hiver', 'handball', 'volley', 'volleyball', 'ballon', 'balle', 'stade', 'terrain', 'pelouse', 'gazon', 'champion du monde', 'victoire', 'défaite', 'nul', 'match nul', 'but', 'goal', 'penalty', 'pénalty', 'tir au but', 'carton', 'rouge', 'jaune', 'arbitre', 'referee', 'var', 'transfert', 'mercato', 'recrue', 'mbappé', 'kylian', 'messi', 'lionel', 'ronaldo', 'cristiano', 'neymar', 'haaland', 'benzema', 'griezmann', 'pogba', 'nadal', 'rafael', 'federer', 'roger', 'djokovic', 'novak', 'alcaraz', 'swiatek', 'lebron', 'james', 'curry', 'lakers', 'warriors', 'dopage', 'antidopage', 'blessure', 'forfait', 'suspension'],

  'Culture': ['cultur', 'culturel', 'art', 'artiste', 'artist', 'peintre', 'sculpteur', 'œuvre', 'exposition', 'galerie', 'film', 'cinéma', 'cinema', 'movie', 'réalis', 'réalisateur', 'director', 'acteur', 'actor', 'actrice', 'actress', 'casting', 'tournage', 'sortie ciné', 'box office', 'série', 'series', 'saison', 'episode', 'netflix', 'amazon prime', 'disney', 'disney+', 'apple tv', 'paramount', 'max', 'hbo', 'stream', 'streaming', 'plateforme', 'musiq', 'music', 'musicien', 'groupe', 'band', 'album', 'single', 'clip', 'chanson', 'song', 'rap', 'hip hop', 'rock', 'pop', 'électro', 'jazz', 'classique', 'concert', 'tournée', 'festival', 'coachella', 'glastonbury', 'rock en seine', 'hellfest', 'cannes', 'festival de cannes', 'palme d\'or', 'césar', 'molière', 'oscar', 'academy awards', 'golden globe', 'emmy', 'grammy', 'théâtr', 'theater', 'comédie française', 'pièce', 'spectacl', 'spectacle', 'show', 'one man show', 'stand up', 'humoriste', 'musée', 'museum', 'louvre', 'orsay', 'pompidou', 'exposition', 'vernissage', 'biennale', 'livre', 'book', 'roman', 'essai', 'biographie', 'manga', 'bd', 'bande dessinée', 'comic', 'auteur', 'écrivain', 'littérat', 'littérature', 'poésie', 'prix', 'goncourt', 'renaudot', 'femina', 'médicis', 'booker', 'patrimoine', 'unesco', 'monument', 'historique', 'architecture'],

  'Politique': ['politiq', 'politic', 'politique', 'gouvernement', 'gouvern', 'gouvernemental', 'ministre', 'ministère', 'premier ministre', 'chef du gouvernement', 'président', 'president', 'présidentiel', 'présidence', 'macron', 'emmanuel macron', 'élysée', 'palais de l\'élysée', 'élection', 'election', 'électoral', 'vote', 'voter', 'scrutin', 'urne', 'parlement', 'parlementaire', 'sénat', 'sénateur', 'sénatrice', 'assemblée', 'assemblée nationale', 'député', 'députée', 'hémicycle', 'palais bourbon', 'parti', 'parti politique', 'gauche', 'droite', 'centre', 'extrême', 'renaissance', 'les républicains', 'lr', 'ps', 'parti socialiste', 'lfi', 'france insoumise', 'rn', 'rassemblement national', 'front national', 'fn', 'eelv', 'écologiste', 'modem', 'loi', 'law', 'législation', 'législatif', 'réforme', 'reform', 'décret', 'ordonnance', 'projet de loi', 'amendement', 'article', 'débat', 'débat politique', 'question', 'motion', 'censure', 'opposition', 'majorité', 'coalition', 'alliance', 'conseil des ministres', 'matignon', 'hôtel matignon', 'élysée', 'République', 'constitution', 'référendum', 'primaire', 'campagne', 'candidat', 'programme', 'meeting', 'manifestation', 'grève', 'syndicat', 'social', 'crise politique'],

  'Climat': ['climat', 'climate', 'climatique', 'réchauff', 'réchauffement', 'warming', 'global warming', 'changement climatique', 'dérèglement', 'environ', 'environnement', 'écolog', 'ecolog', 'écologie', 'écologique', 'vert', 'green', 'durable', 'durabilité', 'sustain', 'sustainable', 'énerg', 'energy', 'énergie', 'renouv', 'renouvelable', 'solaire', 'solar', 'photovoltaïque', 'panneau', 'éolien', 'éolienne', 'wind', 'hydraulique', 'hydro', 'biomasse', 'géothermie', 'nucléaire', 'nuclear', 'centrale', 'réacteur', 'fossil', 'fossile', 'charbon', 'pétrole', 'gaz', 'carbon', 'carbone', 'co2', 'dioxyde', 'gaz à effet de serre', 'ges', 'émission', 'emission', 'neutralité carbone', 'pollut', 'pollution', 'air', 'eau', 'déchet', 'waste', 'ordure', 'poubelle', 'tri', 'recycl', 'recyclage', 'compost', 'bio', 'biologique', 'organic', 'planète', 'planet', 'terre', 'earth', 'nature', 'naturel', 'biodiversité', 'faune', 'flore', 'espèce', 'extinction', 'disparition', 'menacé', 'protégé', 'forêt', 'déforestation', 'amazonie', 'océan', 'mer', 'plastique', 'microplastique', 'cop', 'cop27', 'cop28', 'accord de paris', 'giec', 'ipcc', 'transition', 'sobriété', 'frugal', 'zéro déchet', 'économie circulaire', 'agriculture', 'agroécologie', 'permaculture'],

  'Automobile': ['auto', 'automobile', 'voitur', 'voiture', 'car', 'vehicle', 'véhicul', 'véhicule', 'électriq', 'electric', 'électrique', 've', 'hybrid', 'hybride', 'plug-in', 'essence', 'diesel', 'carburant', 'station-service', 'pompe', 'constructeur', 'marque', 'tesla', 'model', 'renault', 'peugeot', 'citroën', 'ds', 'bmw', 'mercedes', 'audi', 'volkswagen', 'vw', 'porsche', 'ferrari', 'lamborghini', 'bugatti', 'maserati', 'alfa romeo', 'fiat', 'ford', 'chevrolet', 'toyota', 'honda', 'nissan', 'mazda', 'hyundai', 'kia', 'volvo', 'seat', 'skoda', 'mg', 'byd', 'nio', 'rivian', 'lucid', 'conduit', 'conduire', 'driv', 'drive', 'driving', 'pilote', 'permis', 'permis de conduire', 'license', 'code de la route', 'moteur', 'engine', 'cylindrée', 'puissance', 'chevaux', 'cv', 'couple', 'borne', 'recharge', 'superchargeur', 'autonomie', 'battery', 'batterie', 'kwh', 'salon', 'salon de l\'auto', 'mondial', 'francfort', 'genève', 'detroit', 'prototype', 'concept', 'concept-car', 'lancement', 'sortie', 'commercialisation', 'prix', 'tarif', 'vente', 'immatriculation', 'occasion', 'neuf', 'location', 'leasing', 'loa', 'lld', 'autoroute', 'route', 'circulation', 'trafic', 'embouteillage', 'accident', 'sécurité', 'crash test'],

  'Lifestyle': ['lifestyle', 'style de vie', 'mode', 'fashion', 'tendance', 'trend', 'style', 'look', 'outfit', 'défilé', 'fashion week', 'collection', 'créateur', 'couturier', 'designer', 'mannequin', 'model', 'top model', 'luxe', 'luxury', 'haute couture', 'prêt-à-porter', 'marque', 'brand', 'griffe', 'chanel', 'dior', 'vuitton', 'hermès', 'gucci', 'prada', 'yves saint laurent', 'ysl', 'balenciaga', 'givenchy', 'voyag', 'voyage', 'travel', 'trip', 'tourism', 'tourisme', 'vacance', 'holiday', 'destination', 'séjour', 'hôtel', 'hotel', 'resort', 'spa', 'bien-être', 'wellness', 'détente', 'relaxation', 'beauté', 'beauty', 'cosmétique', 'soin', 'skincare', 'makeup', 'maquillage', 'parfum', 'fragrance', 'coiffure', 'hair', 'salon', 'coiffeur', 'esthétique', 'institut', 'maison', 'home', 'déco', 'décor', 'décoration', 'design', 'intérieur', 'meuble', 'furniture', 'ikea', 'habitat', 'jardin', 'garden', 'terrasse', 'bricolage', 'diy', 'renovation', 'mariage', 'wedding', 'noce', 'cérémonie', 'réception'],

  'People': ['people', 'céléb', 'célébrité', 'celebrity', 'star', 'vedette', 'personnalité', 'acteur', 'actrice', 'actor', 'chanteur', 'chanteuse', 'singer', 'rappeur', 'artiste', 'artist', 'influenc', 'influenceur', 'influen', 'influenceuse', 'youtub', 'youtuber', 'tiktok', 'tiktoker', 'instagram', 'instagrameur', 'snapchat', 'twitter', 'blog', 'blogger', 'vlog', 'vlogger', 'réseaux sociaux', 'couple', 'relation', 'romance', 'amour', 'mariag', 'mariage', 'wedding', 'fiançailles', 'divorce', 'séparation', 'rupture', 'liaison', 'bébé', 'baby', 'naissance', 'grossesse', 'enceinte', 'pregnant', 'enfant', 'famille', 'scandale', 'affaire', 'polémique', 'controverse', 'rumeur', 'indiscrétion', 'révélation', 'paparazzi', 'photo', 'cliché', 'red carpet', 'tapis rouge', 'gala', 'soirée', 'cérémonie', 'festival', 'première', 'avant-première', 'vie privée', 'intimité', 'jet set', 'mondain', 'people magazine', 'closer', 'voici', 'gala', 'paris match'],

  'Gaming': ['gaming', 'jeu vidéo', 'jeux vidéo', 'video game', 'gam', 'game', 'games', 'gamer', 'jouer', 'player', 'esport', 'e-sport', 'compétition', 'tournoi', 'championship', 'playstation', 'ps5', 'ps4', 'sony', 'xbox', 'series x', 'series s', 'microsoft', 'nintendo', 'switch', 'switch 2', 'console', 'pc gaming', 'ordinateur', 'fortnite', 'minecraft', 'roblox', 'call of duty', 'cod', 'warzone', 'fifa', 'ea sports fc', 'gta', 'grand theft auto', 'rockstar', 'steam', 'epic games', 'ubisoft', 'activision', 'blizzard', 'riot games', 'twitch', 'streamer', 'streaming', 'live', 'lol', 'league of legends', 'valorant', 'overwatch', 'apex', 'apex legends', 'warzone', 'elden ring', 'zelda', 'tears of the kingdom', 'mario', 'mario kart', 'sonic', 'pokemon', 'dota', 'dota 2', 'pubg', 'counter-strike', 'cs:go', 'cs2', 'battlefield', 'star wars', 'assassin\'s creed', 'far cry', 'resident evil', 'final fantasy', 'god of war', 'the last of us', 'uncharted', 'spider-man', 'batman', 'hogwarts legacy', 'cyberpunk', 'the witcher', 'skyrim', 'fallout', 'red dead redemption', 'dlc', 'update', 'patch', 'mise à jour', 'graphisme', 'gameplay', 'multijoueur', 'solo', 'campagne', 'battle royale', 'mmo', 'moba', 'rpg', 'fps', 'tps', 'simulation', 'aventure', 'action', 'stratégie', 'rts', 'indé', 'indie', 'aaa'],

  'Restauration': ['restaurant', 'resto', 'restauration', 'cuisin', 'cuisine', 'cook', 'cooking', 'culinaire', 'culinary', 'chef', 'cuisinier', 'cook', 'gastronomie', 'gastro', 'gastronomique', 'plat', 'dish', 'assiette', 'recette', 'recipe', 'préparation', 'menu', 'carte', 'dégustation', 'tasting', 'étoile', 'étoilé', 'michelin', 'guide michelin', 'guide', 'gault millau', 'fooding', 'bib gourmand', 'bistrot', 'bistro', 'brasserie', 'café', 'coffee', 'salon de thé', 'tea room', 'bar', 'pub', 'tapas', 'food', 'bouffe', 'manger', 'eat', 'déjeuner', 'dîner', 'brunch', 'petit déjeuner', 'goûter', 'apéritif', 'apéro', 'dessert', 'entrée', 'plat', 'fromage', 'cheese', 'vin', 'wine', 'vigne', 'vignoble', 'cru', 'millésime', 'sommelier', 'œnologie', 'dégustation', 'table', 'service', 'réservation', 'booking', 'terrasse', 'salle', 'chef', 'brigade', 'cuisine', 'ouvert', 'nouveau', 'opening', 'fermeture', 'tripadvisor', 'lafourchette', 'thefork', 'ubereats', 'deliveroo', 'livraison', 'delivery', 'emporter', 'take away', 'food truck', 'street food', 'fast food', 'burger', 'pizza', 'sushi', 'japonais', 'chinois', 'thaï', 'indien', 'italien', 'français', 'méditerranéen', 'vegan', 'végétarien', 'bio', 'local', 'produit', 'saison', 'marché', 'producteur'],

  'Science': ['scien', 'science', 'scientifique', 'researcher', 'recherch', 'research', 'étude', 'study', 'découvert', 'découverte', 'discover', 'discovery', 'invention', 'breakthrough', 'avancée', 'progrès', 'labor', 'labo', 'laboratoire', 'institut', 'cnrs', 'inserm', 'inria', 'cea', 'cern', 'chercheur', 'chercheuse', 'scientifique', 'scientist', 'prix nobel', 'nobel', 'médaille fields', 'physiq', 'physic', 'physique', 'particle', 'particule', 'quantum', 'quantique', 'atome', 'molécule', 'chimie', 'chemi', 'chimique', 'chemistry', 'réaction', 'biolog', 'biologie', 'biology', 'génétique', 'genetic', 'adn', 'dna', 'arn', 'rna', 'cellule', 'organisme', 'évolution', 'darwin', 'mathématique', 'math', 'mathematics', 'équation', 'théorème', 'algorithme', 'calcul', 'astronomie', 'astro', 'astronomique', 'espace', 'space', 'cosmos', 'univers', 'universe', 'nasa', 'esa', 'spacex', 'arianespace', 'james webb', 'hubble', 'telescope', 'planète', 'planet', 'exoplanète', 'système solaire', 'étoile', 'star', 'soleil', 'lune', 'moon', 'mars', 'jupiter', 'saturne', 'galaxie', 'galaxy', 'voie lactée', 'trou noir', 'black hole', 'satellite', 'station spatiale', 'iss', 'fusée', 'rocket', 'lancement', 'mission', 'exploration', 'cosmologie', 'astrophysique', 'météorite', 'comète', 'astéroïde'],

  'International': ['international', 'internation', 'monde', 'world', 'mondial', 'global', 'planète', 'pays', 'country', 'nation', 'état', 'state', 'étranger', 'foreign', 'abroad', 'frontière', 'border', 'guerre', 'war', 'conflit', 'conflict', 'armé', 'militaire', 'army', 'soldat', 'troupe', 'offensive', 'attaque', 'bombardement', 'paix', 'peace', 'cessez-le-feu', 'trêve', 'accord', 'treaty', 'traité', 'négociation', 'diplomatie', 'diplomat', 'diplomate', 'ambassade', 'embassy', 'ambassadeur', 'consul', 'sommet', 'g7', 'g20', 'onu', 'un', 'nations unies', 'otan', 'nato', 'union européenne', 'ue', 'europe', 'bruxelles', 'commission européenne', 'parlement européen', 'états-unis', 'usa', 'amérique', 'america', 'washington', 'biden', 'trump', 'maison blanche', 'chine', 'china', 'beijing', 'pékin', 'xi jinping', 'russie', 'russia', 'moscou', 'moscow', 'poutine', 'putin', 'ukraine', 'kyiv', 'kiev', 'zelensky', 'royaume-uni', 'uk', 'london', 'londres', 'brexit', 'allemagne', 'germany', 'berlin', 'scholz', 'merkel', 'italie', 'italy', 'rome', 'espagne', 'spain', 'madrid', 'asie', 'asia', 'japon', 'japan', 'tokyo', 'corée', 'korea', 'inde', 'india', 'delhi', 'afrique', 'africa', 'moyen-orient', 'middle east', 'israël', 'israel', 'palestine', 'iran', 'arabie saoudite', 'saudi', 'amérique latine', 'brésil', 'brazil', 'mexique', 'mexico', 'argentine', 'crise', 'tension', 'sanction', 'embargo', 'réfugié', 'migrant', 'immigration', 'exil', 'aide humanitaire', 'ong', 'ngo'],

  'Tendances': ['tendance', 'trend', 'trending', 'viral', 'buzz', 'phénomène', 'sensation', 'hype', 'nouveau', 'new', 'nouveauté', 'actualité', 'news', 'info', 'information', 'événement', 'event', 'happening', 'annonce', 'announcement', 'lancement', 'launch', 'sortie', 'release', 'première', 'inédit', 'exclusif', 'exclusive', 'révélation', 'scoop', 'breaking news', 'flash', 'alerte', 'must', 'must-have', 'must-see', 'incontournable', 'populaire', 'popular', 'à la mode', 'fashion', 'cool', 'hot', 'moment', 'sujet du moment', 'talk of the town', 'hashtag', 'twitter', 'réseaux sociaux', 'social media', 'partage', 'share', 'like', 'comment', 'viral video', 'meme', 'challenge', 'tiktok challenge'],
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

// ===== FETCH FROM GNEWS API =====
async function fetchFromGNews(): Promise<NewsArticle[]> {
  console.log('[GNews] Fetching articles...');
  try {
    const url = `${API_PROVIDERS.gnews.baseUrl}${API_PROVIDERS.gnews.endpoint}?lang=fr&country=fr&max=100&apikey=${API_PROVIDERS.gnews.key}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000) // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`GNews API error: ${response.status}`);
    }

    const data = await response.json();
    const articles: NewsArticle[] = [];

    if (data.articles && Array.isArray(data.articles)) {
      for (let i = 0; i < data.articles.length; i++) {
        const item = data.articles[i];
        const title = item.title || 'Sans titre';
        const description = (item.description || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        const category = categorizeArticle(title, description);

        articles.push({
          id: `gnews-${Date.now()}-${i}`,
          title,
          description,
          url: item.url || '',
          image: item.image,
          source: item.source?.name || 'GNews',
          date: item.publishedAt,
          category,
        });
      }
    }

    console.log(`[GNews] Fetched ${articles.length} articles`);
    return articles;
  } catch (error) {
    console.error('[GNews] Error:', error);
    return [];
  }
}

// ===== FETCH FROM NEWSDATA.IO API =====
async function fetchFromNewsData(): Promise<NewsArticle[]> {
  console.log('[NewsData] Fetching articles...');
  try {
    const url = `${API_PROVIDERS.newsdata.baseUrl}${API_PROVIDERS.newsdata.endpoint}?apikey=${API_PROVIDERS.newsdata.key}&language=fr&country=fr&size=100`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000) // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`NewsData API error: ${response.status}`);
    }

    const data = await response.json();
    const articles: NewsArticle[] = [];

    if (data.results && Array.isArray(data.results)) {
      for (let i = 0; i < data.results.length; i++) {
        const item = data.results[i];
        const title = item.title || 'Sans titre';
        const description = (item.description || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        const category = categorizeArticle(title, description);

        articles.push({
          id: `newsdata-${Date.now()}-${i}`,
          title,
          description,
          url: item.link || '',
          image: item.image_url,
          source: item.source_id || 'NewsData',
          date: item.pubDate,
          category,
        });
      }
    }

    console.log(`[NewsData] Fetched ${articles.length} articles`);
    return articles;
  } catch (error) {
    console.error('[NewsData] Error:', error);
    return [];
  }
}

// ===== FETCH FROM EVENTREGISTRY API =====
async function fetchFromEventRegistry(): Promise<NewsArticle[]> {
  console.log('[EventRegistry] Fetching articles...');
  try {
    const url = `${API_PROVIDERS.eventregistry.baseUrl}${API_PROVIDERS.eventregistry.endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        apiKey: API_PROVIDERS.eventregistry.key,
        lang: 'fra',
        articlesCount: 100,
        includeArticleImage: true,
        articlesSortBy: 'date',
      }),
      signal: AbortSignal.timeout(10000) // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`EventRegistry API error: ${response.status}`);
    }

    const data = await response.json();
    const articles: NewsArticle[] = [];

    if (data.articles && data.articles.results && Array.isArray(data.articles.results)) {
      for (let i = 0; i < data.articles.results.length; i++) {
        const item = data.articles.results[i];
        const title = item.title || 'Sans titre';
        const description = (item.body || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        const category = categorizeArticle(title, description);

        articles.push({
          id: `eventregistry-${Date.now()}-${i}`,
          title,
          description,
          url: item.url || '',
          image: item.image,
          source: item.source?.title || 'EventRegistry',
          date: item.dateTime,
          category,
        });
      }
    }

    console.log(`[EventRegistry] Fetched ${articles.length} articles`);
    return articles;
  } catch (error) {
    console.error('[EventRegistry] Error:', error);
    return [];
  }
}

// ===== FETCH FROM ALL APIS WITH PARALLEL EXECUTION =====
async function fetchFromAPIs(): Promise<NewsArticle[]> {
  console.log('[APIs] Fetching from all providers in parallel...');

  // Essayer les 3 providers en parallèle
  const results = await Promise.allSettled([
    fetchFromGNews(),
    fetchFromNewsData(),
    fetchFromEventRegistry(),
  ]);

  const allArticles: NewsArticle[] = [];

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

  console.log(`[APIs] TOTAL: ${deduplicated.length} articles after deduplication`);
  return deduplicated;
}

// ===== FETCH AVEC CACHE 24H =====
export async function fetchNewsWithFallback(): Promise<NewsArticle[]> {
  const now = Date.now();

  // Vérifier le cache
  if (cachedArticles && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log(`[Cache] Using cached articles (${cachedArticles.length} articles, ${Math.round((now - cacheTimestamp) / 1000 / 60)}min old)`);
    return cachedArticles;
  }

  console.log('[Fetch] Cache expired or empty, fetching fresh news...');

  // Fetch depuis les 3 APIs
  const articles = await fetchFromAPIs();

  // FILTRER les articles sans image
  const articlesWithImages = articles.filter(article => {
    if (!article.image) {
      return false;
    }
    return true;
  });

  console.log(`[Filter] ${articles.length} → ${articlesWithImages.length} articles (removed ${articles.length - articlesWithImages.length} without images)`);

  if (articlesWithImages.length > 20) {
    // Mettre en cache pour 24h
    cachedArticles = articlesWithImages;
    cacheTimestamp = now;
    console.log(`[Cache] Cached ${articlesWithImages.length} articles with images for 24 hours`);
    return articlesWithImages;
  }

  // Si échec de toutes les APIs, utiliser cache expiré si disponible
  if (cachedArticles && cachedArticles.length > 0) {
    console.warn('[Fetch] All APIs failed but using stale cache');
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

        // SEUIL MINIMUM: score >= 1 pour être pertinent
        if (score >= 1) {
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
