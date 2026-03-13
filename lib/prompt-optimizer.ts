/**
 * Prompt Optimizer — Transforme un prompt brut en description purement visuelle
 *
 * Utilise Claude Haiku pour :
 * 1. Analyser le lien news↔business
 * 2. Convertir en scène visuelle concrète (ZERO texte à rendre)
 * 3. Supprimer tout élément textuel (titres, citations, noms)
 * 4. Varier les compositions via angles/moods aléatoires
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Angles de caméra/composition — sélection aléatoire à chaque appel
const CREATIVE_ANGLES = [
  'extreme close-up macro shot revealing intricate details and textures',
  'wide establishing shot showing the full environment and context',
  'aerial bird-eye view looking down at the scene',
  'low angle shot looking upward, subject appears powerful and dominant',
  'dutch angle with dramatic tilt creating visual tension',
  'over-the-shoulder perspective creating intimacy with the subject',
  'symmetrical centered composition with strong leading lines',
  'rule-of-thirds off-center framing with generous negative space',
  'shallow depth of field with creamy bokeh isolating the subject',
  'deep focus where foreground and background are equally sharp',
  'silhouette composition against a bright contrasting background',
  'reflection shot using water, glass or mirror surfaces',
  'framed within natural elements like doorways, windows, or arches',
  'dynamic motion blur suggesting energy and movement',
  'split lighting with half the subject in dramatic shadow',
];

// Ambiances lumière/mood — sélection aléatoire à chaque appel
const CREATIVE_MOODS = [
  'golden hour warm sunset light with long soft shadows',
  'blue hour twilight with cool ambient tones and first city lights',
  'neon-lit night scene with vivid pink, cyan, and purple reflections',
  'harsh midday sun creating strong contrasts and crisp deep shadows',
  'overcast soft diffused light with muted sophisticated pastel tones',
  'dramatic chiaroscuro with deep blacks and bright isolated highlights',
  'backlit rim lighting creating a glowing halo outline around the subject',
  'warm intimate candlelight glow with soft amber and orange tones',
  'clean studio strobe lighting, crisp and controlled, commercial look',
  'foggy misty atmosphere with reduced visibility and dreamy softness',
  'rainy scene with wet reflective surfaces glistening under streetlights',
  'cool fluorescent interior lighting with slight clinical green cast',
  'firelight with flickering warm orange tones and dancing shadows',
  'moonlit silvery blue cold nighttime tones with subtle star bokeh',
  'mixed color temperature combining warm tungsten and cool daylight',
];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Fetch and extract key content from a news article URL for deeper analysis.
 * Returns a short summary of the article's key facts, figures, and visual elements.
 */
export async function fetchNewsContext(newsUrl: string, newsTitle: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(newsUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeiroAI/1.0)' },
    });
    clearTimeout(timeout);

    if (!res.ok) return '';

    const html = await res.text();
    // Extract text from article body — strip tags, get meaningful content
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Take first 1500 chars of meaningful text (after title area)
    const titleIdx = stripped.toLowerCase().indexOf(newsTitle.toLowerCase().substring(0, 30));
    const startIdx = titleIdx > 0 ? titleIdx : Math.min(500, stripped.length);
    const articleText = stripped.substring(startIdx, startIdx + 1500).trim();

    if (articleText.length < 50) return '';

    console.log(`[PromptOptimizer] Fetched news context: ${articleText.length} chars from ${newsUrl}`);
    return articleText;
  } catch {
    console.log('[PromptOptimizer] Could not fetch news article, continuing without');
    return '';
  }
}

/**
 * Use Claude to analyze a trend or news article deeply and extract key visual elements
 * for stronger business-news link in generated content.
 */
export async function analyzeTrendForVisuals(
  newsTitle: string,
  newsDescription: string,
  articleContent: string,
  businessType: string,
  businessDescription?: string,
): Promise<string> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analyse cette actualité et trouve des PONTS VISUELS CONCRETS avec le business.

ACTUALITÉ: ${newsTitle}
${newsDescription ? `DÉTAILS: ${newsDescription}` : ''}
${articleContent ? `CONTENU ARTICLE: ${articleContent.substring(0, 800)}` : ''}

BUSINESS: ${businessType}${businessDescription ? ` — ${businessDescription}` : ''}

En 3-5 lignes maximum, donne:
1. Les FAITS CLÉS de l'actu (chiffres, personnes, lieux, dates)
2. Les OBJETS VISUELS CONCRETS associés à cette actu (pas abstraits, des CHOSES qu'on peut photographier)
3. 2-3 SCÈNES précises où le business et l'actu se rencontrent visuellement dans un même cadre

Réponds en anglais, format concis, PAS de JSON.`
      }],
    });

    const analysis = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    if (analysis.length > 30) {
      console.log(`[PromptOptimizer] Trend analysis: ${analysis.length} chars`);
      return analysis;
    }
    return '';
  } catch (error: any) {
    console.warn('[PromptOptimizer] Trend analysis failed:', error.message);
    return '';
  }
}

/**
 * Optimise un prompt d'image pour éliminer tout texte et créer une scène visuelle pure.
 * Injecte un angle et un mood aléatoires pour varier les résultats.
 * Accepts optional enriched news analysis for deeper trend integration.
 */
export async function optimizePromptForImage(rawPrompt: string, trendAnalysis?: string): Promise<string> {
  const angle = getRandomElement(CREATIVE_ANGLES);
  const mood = getRandomElement(CREATIVE_MOODS);

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      temperature: 0.85,
      messages: [{
        role: 'user',
        content: `Tu es un DIRECTEUR ARTISTIQUE pour la generation d'images IA.

DIRECTION CREATIVE:
- Camera: ${angle}
- Lumiere: ${mood}

TACHE: Transforme ce prompt en DESCRIPTION VISUELLE PURE pour un modele d'image.

PROMPT ORIGINAL:
${rawPrompt}
${trendAnalysis ? `\nANALYSE APPROFONDIE DE L'ACTUALITE (utilise ces details pour un lien FORT et VISIBLE entre business et actu):\n${trendAnalysis}` : ''}

METHODE EN 2 TEMPS:
A) D'abord, IDENTIFIE:
   - Le BUSINESS exact: quel metier, quels produits/services, quel univers visuel ?
   - L'ACTUALITE exacte: quel evenement, quelle situation, quelles images ca evoque ?
   - Le PONT NARRATIF: quelle scene CONCRETE reunit les deux ?

B) Ensuite, DECRIS cette scene en detaillant:
   - FOREGROUND (devant): le business en action — produits, outils, artisan, client, comptoir
   - BACKGROUND (fond): l'actualite traduite en DECOR VISUEL — objets, ambiance, elements reconnaissables
   - L'INTERACTION: comment les deux plans se repondent visuellement

EXEMPLES DE PONTS VISUELS:
- Boulangerie + Inflation → artisan qui petrit la pate, clients qui remplissent leurs paniers, etageres bien garnies
- Coach sportif + Canicule → seance d'entrainement outdoor au lever du soleil, brumisateurs, soleil rasant
- Bijoutier + Finale foot → vitrine avec bijoux sous eclairage stadium, ballons decoratifs dores
- Fleuriste + Elections → compositions florales tricolores, drapeaux integres dans les bouquets

REGLES:
1. INTERPRETE la direction creative (camera, lumiere) — ne copie pas mot pour mot
2. Business ET actualite a POIDS EGAL — les deux reconnaissables au premier regard
3. AUCUN TEXTE dans la description — pas de panneaux, enseignes lisibles, ecrans avec du texte, tableaux ecrits, menus, etiquettes, prix. Remplace par des FORMES, COULEURS, OBJETS
4. VOCABULAIRE VARIE — JAMAIS "warm lighting", "vibrant colors", "cinematic feel"
5. Diversite naturelle si personnes presentes
6. Maximum 500 caracteres
7. PAS d'instruction "no text" explicite — mais ta description ne doit JAMAIS suggerer des elements contenant du texte lisible
8. En ANGLAIS
9. RESPECTE le style de rendu demande dans le prompt original (PHOTOREALISTIC = photo reelle, pas illustration/3D)

REPONDS uniquement avec le prompt visuel, rien d'autre.`
      }],
    });

    const optimized = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    if (!optimized || optimized.length < 20) {
      console.warn('[PromptOptimizer] Output too short, using raw prompt');
      return rawPrompt;
    }

    console.log(`[PromptOptimizer] ${rawPrompt.length} chars → ${optimized.length} chars (angle: ${angle.substring(0, 30)}..., mood: ${mood.substring(0, 30)}...)`);
    return optimized;
  } catch (error: any) {
    console.error('[PromptOptimizer] Error, using raw prompt:', error.message);
    return rawPrompt;
  }
}
