/**
 * Prompt Optimizer — Transforme un prompt brut en description purement visuelle
 *
 * Utilise Claude Haiku pour :
 * 1. Analyser le lien news↔business
 * 2. Convertir en scène visuelle concrète (ZERO texte à rendre)
 * 3. Supprimer tout élément textuel (titres, citations, noms)
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Optimise un prompt d'image pour éliminer tout texte et créer une scène visuelle pure.
 * Retourne un prompt court, visuel, sans aucun élément textuel à rendre.
 */
export async function optimizePromptForImage(rawPrompt: string): Promise<string> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 800,
      temperature: 0.6,
      messages: [{
        role: 'user',
        content: `Tu es un expert en prompts pour la génération d'images IA.

TÂCHE: Réécris ce prompt en une DESCRIPTION VISUELLE PURE. Le résultat sera envoyé à un modèle d'image.

PROMPT ORIGINAL:
${rawPrompt}

RÈGLES ABSOLUES:
1. DÉCRIS UNIQUEMENT ce qu'on VOIT — couleurs, lumières, textures, compositions, perspectives, ambiances
2. SUPPRIME tout texte littéral, toute citation d'actualité, tout titre, tout nom propre, toute marque
3. TRANSFORME les concepts abstraits (actualités, business) en ÉLÉMENTS VISUELS CONCRETS:
   - "restaurant bio face à l'inflation" → "cuisine lumineuse avec légumes frais colorés, ambiance chaleureuse et accessible"
   - "bijoux face à match de foot" → "bijou étincelant sous éclairage dramatique façon projecteurs de stade, fond bleu nuit"
   - "tech startup face à crise" → "bureau moderne épuré avec écrans lumineux, ambiance confiante et innovante"
4. GARDE la composition (70/30, foreground/background) si mentionnée
5. Si des personnes sont mentionnées, inclure diversité naturelle d'origines
6. Maximum 500 caractères
7. NE METS AUCUNE instruction "no text" — je les ajouterai moi-même
8. Écris en ANGLAIS pour de meilleurs résultats avec les modèles d'image

RÉPONDS uniquement avec le prompt visuel optimisé, rien d'autre.`
      }],
    });

    const optimized = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    if (!optimized || optimized.length < 20) {
      console.warn('[PromptOptimizer] Output too short, using raw prompt');
      return rawPrompt;
    }

    console.log(`[PromptOptimizer] ${rawPrompt.length} chars → ${optimized.length} chars`);
    return optimized;
  } catch (error: any) {
    console.error('[PromptOptimizer] Error, using raw prompt:', error.message);
    return rawPrompt; // Fallback: utiliser le prompt original
  }
}
