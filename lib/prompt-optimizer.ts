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
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Background Agent Intelligence ──────────────────────────
// Content + Marketing agent learnings are injected into prompts
// to improve image quality based on accumulated knowledge.

let _cachedInsights: string | null = null;
let _cachedAt = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 min

/**
 * Load high-confidence visual learnings from Content + Marketing agents.
 * Cached for 15 minutes to avoid DB hits on every generation.
 */
async function loadAgentVisualInsights(): Promise<string> {
  if (_cachedInsights && Date.now() - _cachedAt < CACHE_TTL) return _cachedInsights;

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return '';

    const sb = createClient(url, key);

    // Fetch top visual-relevant learnings from Content + Marketing (Rule+ = 65+)
    const { data } = await sb
      .from('agent_logs')
      .select('data')
      .in('agent', ['content', 'marketing', 'seo'])
      .in('action', ['learning', 'learning_acquired'])
      .order('created_at', { ascending: false })
      .limit(300);

    if (!data?.length) { _cachedInsights = ''; _cachedAt = Date.now(); return ''; }

    // Filter to high-confidence visual-relevant learnings
    const visualCategories = new Set([
      'content_format_evolution', 'instagram_algorithm', 'instagram_history',
      'visual_content_trends', 'video_length_optimization', 'posting_frequency',
      'tiktok_algorithm', 'linkedin_algorithm', 'hashtag_evolution',
      'ugc_creator_economy', 'content_repurposing', 'french_market',
      'social_commerce', 'ugc_strategy', 'viral_acquisition',
      'creative_fatigue', 'audience_targeting', 'roas_benchmarks',
      'ai_content', 'social_seo',
    ]);

    const insights: string[] = [];
    for (const row of data) {
      const d = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (!d?.learning || !d?.confidence) continue;
      if (d.confidence < 65) continue; // Rule+ only
      const cat = d.category || '';
      if (visualCategories.has(cat) || cat.includes('visual') || cat.includes('content') || cat.includes('instagram') || cat.includes('tiktok')) {
        insights.push(d.learning.substring(0, 200));
        if (insights.length >= 8) break; // Cap at 8 insights to avoid prompt bloat
      }
    }

    _cachedInsights = insights.length > 0
      ? `\nINTELLIGENCE AGENTS (tendances visuelles actuelles basees sur l'analyse de donnees):\n${insights.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}`
      : '';
    _cachedAt = Date.now();

    if (insights.length > 0) {
      console.log(`[PromptOptimizer] Loaded ${insights.length} visual insights from agent learnings`);
    }
    return _cachedInsights;
  } catch (err: any) {
    console.warn('[PromptOptimizer] Agent insights load failed (non-fatal):', err?.message);
    _cachedInsights = '';
    _cachedAt = Date.now();
    return '';
  }
}

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
      max_tokens: 650,
      messages: [{
        role: 'user',
        content: `Tu construis le pont visuel entre une actualité et le business d'un client. Les scènes générées DOIVENT représenter les personnalités et lieux cités dans l'article, pas des remplacements génériques — et toujours lier visuellement ces éléments au business.

ACTUALITÉ: ${newsTitle}
${newsDescription ? `DÉTAILS: ${newsDescription}` : ''}
${articleContent ? `CONTENU ARTICLE: ${articleContent.substring(0, 1200)}` : ''}

BUSINESS: ${businessType}${businessDescription ? ` — ${businessDescription}` : ''}

Sortie en anglais, PAS de JSON, exactement ces 5 sections :

PEOPLE:       personnes nommées dans l'article (acteurs, sportifs,
              politiques, chefs, influenceurs) avec leurs traits visuels
              reconnaissables (coupe, tenue signature, posture). Mets
              (none) si aucune personne réelle.

PLACES:       lieux nommés (ville, rue, monument, venue) avec leurs
              traits visuels reconnaissables (Tour Eiffel, parvis du
              Sacré-Cœur, enseigne Shibuya…). Mets (none) si aucun.

OBJECTS:      3-5 objets photographiables concrets liés à l'actu.

BUSINESS_BRIDGE: UNE phrase qui dit COMMENT cette actualité et le
              business partagent plausiblement une scène (ex. "Une
              pâtisserie prépare un entremet aux couleurs de l'équipe
              de France après leur victoire").

SCENE_IDEAS:  2-3 scènes précises combinant explicitement les PEOPLE ou
              PLACES nommés ci-dessus AVEC l'environnement du business
              dans un seul cadre. Les noms de l'article doivent
              apparaître ; pas de substitut générique.

Si PEOPLE et PLACES sont tous deux (none), concentre SCENE_IDEAS sur
OBJECTS × BUSINESS.`
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

  // Load background agent intelligence (Content + Marketing learnings)
  const agentInsights = await loadAgentVisualInsights();

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
${agentInsights}

TACHE: Transforme ce prompt en DESCRIPTION VISUELLE PURE pour un modele d'image.

PROMPT ORIGINAL:
${rawPrompt}
${trendAnalysis ? `\nANALYSE APPROFONDIE DE L'ACTUALITE (utilise ces details pour un lien FORT et VISIBLE entre business et actu):\n${trendAnalysis}` : ''}

METHODE EN 2 TEMPS:
A) D'abord, IDENTIFIE depuis l'ANALYSE APPROFONDIE si fournie :
   - Le BUSINESS exact: quel metier, quels produits/services, quel univers visuel ?
   - L'ACTUALITE exacte: quel evenement, quelle situation, quelles images ca evoque ?
   - Les PEOPLE nommes dans l'actu (si presents) avec leurs traits visuels
   - Les PLACES nommes dans l'actu (si presents) avec leurs reperes
   - Le BUSINESS_BRIDGE — le lien explicite qui doit transparaitre dans la scene

B) Ensuite, DECRIS cette scene en detaillant:
   - FOREGROUND (devant): le business en action — produits, outils, artisan, client, comptoir
   - BACKGROUND (fond): l'actualite traduite en DECOR VISUEL — objets, ambiance, elements reconnaissables, ET si PEOPLE/PLACES nommes : inclure leurs traits distinctifs (skyline specifique, monument, uniforme, coiffure signature, couleur d'equipe)
   - L'INTERACTION: comment les deux plans se repondent visuellement, le bridge doit etre evident

EXEMPLES DE PONTS VISUELS:
- Boulangerie + victoire Equipe de France (personnes: joueurs, place: stade) → vitrine avec entremets bleu-blanc-rouge, ballon au premier plan, maillots floutes en arriere-plan a travers la vitrine
- Coach sportif + Canicule a Marseille (place: Vieux-Port) → seance outdoor au lever du soleil avec la Bonne Mere en silhouette, brumisateurs et ombre rasante
- Bijoutier + Mariage royal britannique (people: couple, place: Westminster) → vitrine avec bijoux fins, decor de pierre claire, halo de lumiere rappelant l'abbaye
- Fleuriste + Cannes Festival (place: Croisette, people: celebrites en robe) → bouquet glamour avec lys et roses blanches, reflets dores suggerant les spots, palmiers en arriere-plan

REGLES:
1. Si PEOPLE ou PLACES sont nommes dans l'analyse, ils DOIVENT apparaitre visuellement (traits, silhouette, uniforme, architecture) — pas de remplacement generique
2. Business ET actualite a POIDS EGAL — les deux reconnaissables au premier regard, le bridge narratif evident
3. INTERPRETE la direction creative (camera, lumiere) — ne copie pas mot pour mot
4. AUCUN TEXTE dans la description — pas de panneaux, enseignes lisibles, ecrans avec du texte, tableaux ecrits, menus, etiquettes, prix. Remplace par des FORMES, COULEURS, OBJETS
5. VOCABULAIRE VARIE — JAMAIS "warm lighting", "vibrant colors", "cinematic feel"
6. Diversite naturelle si personnes presentes
7. Maximum 550 caracteres
8. PAS d'instruction "no text" explicite — mais ta description ne doit JAMAIS suggerer des elements contenant du texte lisible
9. En ANGLAIS
10. RESPECTE le style de rendu demande dans le prompt original (PHOTOREALISTIC = photo reelle, pas illustration/3D)

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
