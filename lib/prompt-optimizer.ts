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
 * Optimise un prompt d'image pour éliminer tout texte et créer une scène visuelle pure.
 * Injecte un angle et un mood aléatoires pour varier les résultats.
 */
export async function optimizePromptForImage(rawPrompt: string): Promise<string> {
  const angle = getRandomElement(CREATIVE_ANGLES);
  const mood = getRandomElement(CREATIVE_MOODS);

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
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
- Boulangerie + Inflation → artisan qui ajuste ses prix a la craie sur l'ardoise, clients souriants au comptoir
- Coach sportif + Canicule → seance d'entrainement outdoor au lever du soleil pour eviter la chaleur
- Bijoutier + Finale foot → vitrine avec bijoux disposes en forme de coupe, eclairage stadium
- Fleuriste + Elections → compositions florales aux couleurs du drapeau en vitrine

REGLES:
1. INTERPRETE la direction creative (camera, lumiere) — ne copie pas mot pour mot
2. Business ET actualite a POIDS EGAL — les deux reconnaissables au premier regard
3. ZERO texte litteral — transforme tout en symboles visuels
4. VOCABULAIRE VARIE — JAMAIS "warm lighting", "vibrant colors", "cinematic feel"
5. Diversite naturelle si personnes presentes
6. Maximum 500 caracteres
7. PAS d'instruction "no text" — ajoutee separement
8. En ANGLAIS

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
