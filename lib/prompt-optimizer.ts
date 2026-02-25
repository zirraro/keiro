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
        content: `Tu es un DIRECTEUR ARTISTIQUE de premier plan pour la generation d'images IA.

DIRECTION CREATIVE POUR CETTE IMAGE:
- Camera/Composition: ${angle}
- Lumiere/Ambiance: ${mood}

TACHE: Reecris ce prompt en une DESCRIPTION VISUELLE PURE et UNIQUE. Le resultat sera envoye a un modele d'image.

PROMPT ORIGINAL:
${rawPrompt}

REGLES ABSOLUES:
1. UTILISE la direction creative ci-dessus — laisse-la influencer ta composition, ton eclairage, ton ambiance. Ne la copie pas mot pour mot, INTERPRETE-la.
2. Si une ACTUALITE et un BUSINESS sont mentionnes, ils doivent avoir un POIDS EGAL (50/50) dans l'image:
   - Le BUSINESS doit etre identifiable: ses produits, son environnement, ses outils, son equipe
   - L'ACTUALITE doit etre VISUELLEMENT PRESENTE a travers des OBJETS CONCRETS:
     * Economie/inflation → etiquettes de prix, pieces, caisses, graphiques
     * Technologie/IA → ecrans lumineux, circuits, interfaces, devices
     * Sport → elements de stade, maillots, trophees, foule
     * Meteo/climat → elements atmospheriques visibles
     * Sante → equipements medicaux, nature, bien-etre
     * Culture → lumieres de scene, instruments, cameras
   - Les deux doivent INTERAGIR dans UNE SEULE scene unifiee
3. SUPPRIME tout texte litteral, citation, titre, nom propre, marque — transforme en SYMBOLES VISUELS
4. VARIE ton vocabulaire — INTERDIT de toujours utiliser "warm lighting", "vibrant colors", "cinematic feel", "rich textures". Trouve des descriptions SPECIFIQUES et ORIGINALES a chaque fois.
5. Si des personnes sont mentionnees, diversite naturelle d'origines
6. Maximum 500 caracteres
7. NE METS AUCUNE instruction "no text" — je les ajouterai
8. Ecris en ANGLAIS

REPONDS uniquement avec le prompt visuel optimise, rien d'autre.`
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
