/**
 * Text Condensation Helper using Claude
 *
 * Intelligently condenses text to fit target duration for audio narration
 * Uses Claude AI to maintain meaning while reducing word count
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Condense text to target word count using Claude AI
 *
 * @param text - Original text to condense
 * @param targetWords - Target number of words (e.g., 15 words for ~5 seconds)
 * @param style - Style of condensation ('informative', 'catchy', 'storytelling')
 * @returns Condensed text maintaining core message
 */
export async function condenseText(
  text: string,
  targetWords: number = 15,
  style: 'informative' | 'catchy' | 'storytelling' = 'informative'
): Promise<string> {
  const currentWords = text.trim().split(/\s+/).length;
  const targetDuration = Math.ceil(targetWords / 2.5);
  console.log('[Condense] Current words:', currentWords, '/ Target:', targetWords, `(~${targetDuration}s)`);

  // If within ±20% of target, return as-is
  if (currentWords >= targetWords * 0.8 && currentWords <= targetWords * 1.2) {
    console.log('[Condense] Text already near target, returning as-is');
    return text.trim();
  }

  const styleInstructions: Record<string, string> = {
    informative: 'Style journalistique factuel et clair',
    catchy: 'Style accrocheur et viral pour TikTok/Instagram',
    storytelling: 'Style narratif captivant avec suspense',
  };

  const action = currentWords > targetWords ? 'CONDENSE' : 'DÉVELOPPE';
  const actionInstruction = currentWords > targetWords
    ? `Condense ce texte en ${targetWords} mots maximum. Garde l'information essentielle.`
    : `Développe ce texte pour atteindre ~${targetWords} mots (~${targetDuration} secondes de narration). Ajoute des détails, du contexte, des transitions naturelles. Enrichis le propos sans répéter. Crée un vrai script engageant qui remplit toute la durée.`;

  const prompt = `Tu es un expert en écriture de scripts audio pour réseaux sociaux.

${actionInstruction}

TEXTE ORIGINAL:
${text}

CONTRAINTES:
- OBLIGATOIRE : le texte final DOIT être en FRANÇAIS. Si le texte original est en anglais ou dans une autre langue, TRADUIS-LE en français naturel avant de le condenser/développer.
- Objectif: ~${targetWords} mots pour ~${targetDuration} secondes de narration
- ${styleInstructions[style] || styleInstructions.informative}
- Phrases courtes (max 15 mots par phrase)
- Pauses naturelles (virgules, points)
- Le texte doit être agréable à ÉCOUTER à voix haute
- Tutoyer le spectateur
- Adapté pour narration audio (pas de texte écrit)

JAMAIS de préfixe comme "Script voix off:", "Narration:" — commence DIRECTEMENT par le texte parlé.
Réponds UNIQUEMENT avec le texte ${action === 'CONDENSE' ? 'condensé' : 'développé'} EN FRANÇAIS, sans introduction ni explication.`;

  console.log(`[Condense] Calling Claude to ${action} text (${currentWords} → ${targetWords} words)...`);

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const result = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
  const finalWords = result.split(/\s+/).length;

  console.log(`[Condense] ✅ ${action} from`, currentWords, 'to', finalWords, 'words');
  console.log('[Condense] Result:', result);

  return result;
}

/**
 * Generate multiple text suggestions for narration
 *
 * @param context - Context or description to base suggestions on
 * @param targetWords - Target word count per suggestion
 * @returns Array of 3 text suggestions (informative, catchy, storytelling)
 */
export async function generateNarrationSuggestions(
  context: string,
  targetWords: number = 15
): Promise<{ informative: string; catchy: string; storytelling: string }> {
  const targetDuration = Math.ceil(targetWords / 2.5);

  const prompt = `Tu es un expert en scripts audio viraux pour TikTok/Instagram Reels. Tu écris des textes qui sonnent NATURELS quand ils sont lus à voix haute — comme une vraie personne qui parle à son audience, pas un robot.

CONTEXTE: ${context}

Génère 3 scripts de narration audio (~${targetWords} mots chacun, durée ~${targetDuration}s) avec ces styles:

1. INFORMATIF: Style journalistique fluide et engageant. Phrases courtes et percutantes. Ton conversationnel mais crédible. Lie l'actualité/tendance au business de façon naturelle.
2. ACCROCHEUR: Style viral TikTok. Hook puissant dans les 3 premiers mots. Rythme rapide. Langage familier et direct. Phrases qui créent l'urgence ou la curiosité.
3. STORYTELLING: Style narratif captivant. Commence par une situation concrète, crée du suspense, résolution surprenante. Ton intime comme si on racontait une histoire à un ami.

RÈGLES CRITIQUES:
- OBLIGATOIRE : les 3 scripts DOIVENT être en FRANÇAIS. Si le contexte est en anglais, traduis et adapte en français naturel.
- JAMAIS commencer par "Script voix off", "Narration:", "Voix off:" ou tout autre préfixe méta — le texte commence DIRECTEMENT par le contenu parlé
- Phrases courtes (max 15 mots par phrase)
- Éviter les mots compliqués ou techniques
- Utiliser des pauses naturelles (virgules, points)
- Le texte doit être agréable à ÉCOUTER, pas juste à lire
- Tutoyer le spectateur pour créer de la proximité
- Si le contexte mentionne une actualité ou tendance, ANALYSER et FAIRE LE LIEN INTELLIGENT entre l'actu et le business — c'est là que Claude brille
- Le texte doit apporter de la VALEUR : insight, conseil, révélation, perspective unique
- Pas de phrases bateau ou génériques — chaque mot doit compter

Format JSON strict:
{
  "informative": "script informatif ici",
  "catchy": "script accrocheur ici",
  "storytelling": "script narratif ici"
}

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;

  console.log('[Suggestions] Generating 3 narration suggestions...');

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}';

  // Extract JSON from response (handle potential markdown code blocks)
  let jsonText = responseText;
  if (responseText.includes('```json')) {
    const match = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      jsonText = match[1];
    }
  } else if (responseText.includes('```')) {
    const match = responseText.match(/```\s*([\s\S]*?)\s*```/);
    if (match) {
      jsonText = match[1];
    }
  }

  try {
    const suggestions = JSON.parse(jsonText);
    console.log('[Suggestions] ✅ Generated 3 suggestions');
    return suggestions;
  } catch (error) {
    console.error('[Suggestions] Failed to parse JSON:', error);
    console.error('[Suggestions] Raw response:', responseText);
    throw new Error('Failed to generate suggestions: Invalid JSON response from Claude');
  }
}
