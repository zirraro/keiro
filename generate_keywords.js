const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// Charger le fichier .env.local
const envPath = path.join(__dirname, '.env.local');
let apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey && fs.existsSync(envPath)) {
  console.log('📄 Loading ANTHROPIC_API_KEY from .env.local...');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (match) {
    apiKey = match[1].trim();
    console.log('✅ ANTHROPIC_API_KEY loaded from .env.local\n');
  }
}

if (!apiKey || apiKey === 'your_api_key_here') {
  console.error('❌ ANTHROPIC_API_KEY not found or not configured');
  console.error('');
  console.error('Please add your API key to .env.local:');
  console.error('  ANTHROPIC_API_KEY=sk-ant-api03-your-key-here');
  console.error('');
  console.error('Or set it as an environment variable:');
  console.error('  export ANTHROPIC_API_KEY=sk-ant-api03-your-key-here');
  console.error('');
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: apiKey,
});

const prompt = `Tu es un expert en catégorisation d'actualités françaises. Génère des listes EXHAUSTIVES de mots-clés pour catégoriser automatiquement des articles de presse française.

Pour chaque catégorie ci-dessous, génère 50-100 mots-clés incluant :
- Termes génériques et spécifiques
- Noms propres (marques, personnalités, lieux)
- Expressions courantes dans cette thématique
- Variantes orthographiques (avec/sans accents, abréviations)
- Termes d'actualité 2025-2026
- Mots-clés en MINUSCULES pour la comparaison case-insensitive

CATÉGORIES (par ordre de priorité):

1. **Automobile** (PRIORITÉ MAXIMALE - actuellement très peu d'articles)
   - Marques françaises: Renault, Peugeot, Citroën, DS, Alpine, Bugatti
   - Marques internationales: Tesla, BMW, Mercedes, Audi, Volkswagen, Toyota, Hyundai, Kia, Ford, Porsche, Ferrari, Lamborghini, etc.
   - Types: voiture électrique, hybride, essence, diesel, SUV, berline, citadine, sportive
   - Technologies: batterie, autonomie, recharge, borne, superchargeur, pile à combustible, hydrogène
   - Actualités: salon auto, mondial de l'auto, essai, comparatif, nouveauté, lancement
   - Général: permis de conduire, code de la route, sécurité routière, accident, assurance auto, contrôle technique
   - Marques premium: Rolls-Royce, Bentley, Maserati, Aston Martin, McLaren
   - Marques chinoises émergentes: BYD, NIO, Xpeng, Geely

2. **Musique** (NOUVELLE CATÉGORIE - actuellement inexistante)
   - Artistes français: Aya Nakamura, Gims, Stromae, Angèle, Orelsan, Nekfeu, Soprano, Jul, SCH, Ninho, PNL, Booba, Niska, Dadju, Maître Gims
   - Artistes internationaux: Taylor Swift, Beyoncé, Drake, The Weeknd, Billie Eilish, Ariana Grande, Ed Sheeran, Rihanna, Kanye West, Travis Scott
   - Genres: rap, hip-hop, pop, rock, électro, house, techno, EDM, R&B, soul, jazz, classique, metal, punk
   - Événements: concert, tournée, festival, Coachella, Lollapalooza, Rock en Seine, Hellfest, Solidays, Printemps de Bourges
   - Industrie: album, single, EP, clip, streaming, Spotify, Deezer, Apple Music, YouTube Music, charts, Billboard, top 50
   - Distinctions: Grammy, NRJ Music Awards, Victoires de la Musique, MTV Awards
   - Termes: featuring, feat, ft, collaboration, remix, cover, acoustique, live, concert live

3. **People** (améliorer l'existant)
   - Ajouter plus de célébrités françaises: Kylian Mbappé, Zinedine Zidane, Tony Parker, Marion Cotillard, Léa Seydoux, Vincent Cassel
   - Influenceurs: Squeezie, Cyprien, Norman, Enjoy Phoenix, Caroline Receveur, Léna Situations
   - Reality TV: Les Marseillais, Les Ch'tis, Koh-Lanta, Secret Story
   - Termes: paparazzi, jet-set, vie privée, liaison, rupture, fiançailles, baby bump, grossesse, accouchement

4. **Tech** (enrichir)
   - Ajouter: IA générative, LLM, GPT, Gemini, Bard, Copilot, GitHub, GitLab, TypeScript, React, Next.js, Vue, Angular
   - Cybersécurité: ransomware, phishing, data breach, fuite de données, RGPD
   - Crypto: DeFi, staking, wallet, exchange, Binance, Coinbase, stablecoin

5. **Finance** (enrichir)
   - Ajouter: trading, trader, dividende, indice boursier, S&P 500, Dow Jones, Nasdaq, obligations, forex
   - Banques: BNP Paribas, Société Générale, Crédit Agricole, La Banque Postale, Boursorama
   - Fintech: Revolut, N26, Lydia, PayPal, Stripe, Klarna

6. **Business** (enrichir)
   - Licornes françaises: Blablacar, Doctolib, Contentsquare, Mirakl, Back Market, Vinted
   - E-commerce: Amazon, Alibaba, Shopify, marketplace, dropshipping
   - Retail: Carrefour, Auchan, Leclerc, Intermarché, Casino, Lidl, Aldi

7. **Sport** (enrichir)
   - Football: Ligue des Champions, Europa League, Premier League, Liga, Serie A, Bundesliga, Mbappé, Messi, Ronaldo, Haaland, Neymar
   - Tennis: Roland-Garros, Wimbledon, US Open, Open d'Australie, Djokovic, Nadal, Federer, Alcaraz
   - Basket: NBA, Wembanyama, LeBron James, Stephen Curry, Lakers, Warriors
   - F1: Verstappen, Hamilton, Leclerc, Red Bull, Ferrari, Mercedes, Grand Prix

8. **Culture** (enrichir)
   - Streaming: Netflix, Disney+, Prime Video, Apple TV+, Max, Paramount+
   - Séries: Game of Thrones, Stranger Things, The Last of Us, The Mandalorian, Wednesday
   - Films: Marvel, DC, blockbuster, box-office, Avengers, Batman, Spider-Man
   - Livres: best-seller, Goncourt, Renaudot, Femina, prix littéraire

9. **Politique** (enrichir)
   - Partis: Renaissance, LR, PS, LFI, RN, EELV, Modem
   - Figures: Emmanuel Macron, Marine Le Pen, Jean-Luc Mélenchon, Édouard Philippe, Bruno Le Maire
   - Termes: motion de censure, 49.3, projet de loi, PLF, budget, fiscalité

10. **Santé** (enrichir)
    - Maladies: Alzheimer, Parkinson, diabète, AVC, infarctus, hypertension
    - Nutrition: régime, végétarien, vegan, bio, sans gluten, keto, jeûne intermittent
    - Bien-être: yoga, méditation, mindfulness, sommeil, stress, burn-out

11. **Climat** (enrichir)
    - Énergies: nucléaire, photovoltaïque, biomasse, géothermie, hydrogène vert
    - Termes: neutralité carbone, empreinte carbone, bilan carbone, compensation carbone
    - Événements: COP28, COP29, GIEC, Accord de Paris

12. **Science** (enrichir)
    - Espace: SpaceX, Blue Origin, Mars, Lune, ISS, James Webb, télescope
    - Technologies: CRISPR, génétique, ADN, clonage, cellules souches
    - Instituts: CNRS, CERN, ESA, NASA, MIT, Stanford

13. **Gaming** (enrichir)
    - Jeux: Fortnite, League of Legends, Valorant, CS:GO, Minecraft, GTA, Call of Duty, FIFA, Elden Ring
    - Plateformes: Steam, Epic Games, Battle.net, Origin, Ubisoft Connect
    - Esport: LEC, LCS, Worlds, The International, Major, équipe esport

14. **Lifestyle** (enrichir)
    - Marques mode: Chanel, Dior, Louis Vuitton, Hermès, Gucci, Prada, Zara, H&M
    - Beauté: Sephora, L'Oréal, Lancôme, MAC, Fenty Beauty, skincare, routine beauté
    - Voyages: Airbnb, Booking, TripAdvisor, city break, road trip, backpacking

15. **Restauration** (enrichir)
    - Chefs: Alain Ducasse, Paul Bocuse, Gordon Ramsay, Jamie Oliver, Cyril Lignac, Philippe Etchebest
    - Émissions: Top Chef, MasterChef, Cauchemar en cuisine
    - Tendances: street food, food truck, fusion, bistronomie, fermentation

16. **International** (enrichir)
    - Conflits: Ukraine, Gaza, Taïwan, Corée du Nord, Iran, Syrie
    - Leaders: Joe Biden, Donald Trump, Xi Jinping, Vladimir Poutine, Emmanuel Macron
    - Organisations: OTAN, UE, FMI, Banque mondiale, G7, G20, BRICS

17. **Tendances** (enrichir)
    - Plateformes: TikTok, Instagram Reels, YouTube Shorts, Snapchat, BeReal
    - Termes: influenceur, créateur de contenu, UGC, POV, aesthetic, vibe, mood
    - Phénomènes: meme, challenge, trend, filter, effect, sound viral

IMPORTANT:
- Tous les mots-clés doivent être en MINUSCULES
- Inclure les variantes (avec/sans accents: beyonce et beyoncé)
- Inclure les abréviations (ia, ai, f1, psg, om)
- Éviter les mots trop génériques qui causeraient des mauvais classements
- Pour Automobile: ajouter beaucoup de marques et modèles spécifiques
- Pour Musique: couvrir tous les genres et artistes populaires

FORMAT DE RÉPONSE:
Retourne UNIQUEMENT un objet JSON valide (pas de texte avant ou après, pas de markdown):
{
  "Automobile": ["mot1", "mot2", ...],
  "Musique": ["mot1", "mot2", ...],
  "People": ["mot1", "mot2", ...],
  ...
}`;

async function generateKeywords() {
  try {
    console.log('🚀 Calling Claude API to generate keywords...\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,  // Maximum pour Haiku
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const response = message.content[0].text;
    console.log('✅ Response received from Claude API\n');
    console.log('📝 Generated keywords (JSON):\n');
    console.log(response);

    // Sauvegarder dans un fichier pour inspection
    const fs = require('fs');
    fs.writeFileSync(
      'C:\\Users\\vcgle\\Documents\\GitHub\\keiro\\generated_keywords.json',
      response,
      'utf8'
    );
    console.log('\n💾 Keywords saved to generated_keywords.json');

  } catch (error) {
    console.error('❌ Error calling Claude API:', error);
    process.exit(1);
  }
}

generateKeywords();
