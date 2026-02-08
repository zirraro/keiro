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
  // If already under limit, return as-is
  const currentWords = text.trim().split(/\s+/).length;
  console.log('[Condense] Current words:', currentWords, '/ Target:', targetWords);

  if (currentWords <= targetWords) {
    console.log('[Condense] Text already under limit, returning as-is');
    return text.trim();
  }

  // Style-specific instructions
  const styleInstructions: Record<string, string> = {
    informative: 'Style journalistique factuel et clair',
    catchy: 'Style accrocheur et viral pour TikTok/Instagram',
    storytelling: 'Style narratif captivant avec suspense',
  };

  const prompt = `Tu es un expert en écriture de scripts audio pour réseaux sociaux.

Condense ce texte en EXACTEMENT ${targetWords} mots maximum pour une narration audio de ${Math.ceil(targetWords / 2.5)} secondes.

TEXTE ORIGINAL:
${text}

CONTRAINTES:
- Maximum ${targetWords} mots (strict)
- ${styleInstructions[style]}
- Garde l'information essentielle
- Phrase complète et fluide
- Adapté pour narration audio (pas de texte écrit)

Réponds UNIQUEMENT avec le texte condensé, sans introduction ni explication.`;

  console.log('[Condense] Calling Claude to condense text...');

  const message = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const condensedText = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
  const finalWords = condensedText.split(/\s+/).length;

  console.log('[Condense] ✅ Condensed from', currentWords, 'to', finalWords, 'words');
  console.log('[Condense] Result:', condensedText);

  return condensedText;
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

  const prompt = `Tu es un expert en scripts audio pour TikTok/Instagram Reels.

CONTEXTE: ${context}

Génère 3 scripts de narration audio (EXACTEMENT ${targetWords} mots chacun, durée ~${targetDuration}s) avec ces styles:

1. INFORMATIF: Style journalistique factuel et clair
2. ACCROCHEUR: Style viral TikTok avec hook puissant
3. STORYTELLING: Style narratif captivant avec suspense

Format JSON strict:
{
  "informative": "script informatif ici",
  "catchy": "script accrocheur ici",
  "storytelling": "script narratif ici"
}

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;

  console.log('[Suggestions] Generating 3 narration suggestions...');

  const message = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 500,
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
