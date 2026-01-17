import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

/**
 * API Route pour générer des suggestions de texte IA via Claude
 * Génère 5 propositions expertes basées sur l'actualité + business
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { newsTitle, newsDescription, businessType, businessDescription, tone, targetAudience } = body;

    if (!newsTitle || !businessType) {
      return NextResponse.json(
        { ok: false, error: 'Actualité et type de business requis' },
        { status: 400 }
      );
    }

    console.log('[SuggestText] Generating suggestions with Claude...', {
      newsTitle: newsTitle.substring(0, 50),
      businessType
    });

    // Initialiser le client Anthropic
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Construire le prompt expert
    const prompt = `Tu es un expert en community management et copywriting pour les réseaux sociaux, spécialisé dans Instagram.

CONTEXTE:
Actualité: "${newsTitle}"
${newsDescription ? `Détails: ${newsDescription}` : ''}

Business client: ${businessType}
${businessDescription ? `Description: ${businessDescription}` : ''}

Ton souhaité: ${tone || 'Inspirant et engageant'}
${targetAudience ? `Audience cible: ${targetAudience}` : ''}

MISSION:
Génère 5 propositions de texte à superposer sur un visuel Instagram (1080x1080) qui lie intelligemment cette actualité au business du client.

CONTRAINTES:
- Maximum 60 caractères par proposition (lisibilité mobile)
- Ton ${tone || 'inspirant'}, percutant, moderne
- Lien clair entre l'actualité et le business
- Appel à l'action ou émotion forte
- Vocabulaire adapté à Instagram
- Pas de hashtags (juste le texte overlay)
- Évite les clichés marketing

FORMAT DE RÉPONSE:
Réponds UNIQUEMENT avec un JSON array de 5 strings, rien d'autre.
Exemple: ["Texte 1", "Texte 2", "Texte 3", "Texte 4", "Texte 5"]`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    // Extraire le texte de la réponse
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('[SuggestText] Claude response:', responseText.substring(0, 200));

    // Parser le JSON
    let suggestions: string[] = [];
    try {
      suggestions = JSON.parse(responseText);
    } catch (parseError) {
      // Si parsing échoue, essayer d'extraire le JSON du texte
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Format de réponse invalide');
      }
    }

    // Valider les suggestions
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      throw new Error('Aucune suggestion générée');
    }

    // Filtrer et limiter la longueur
    suggestions = suggestions
      .filter(s => typeof s === 'string' && s.trim().length > 0)
      .map(s => s.trim().substring(0, 60))
      .slice(0, 5);

    console.log('[SuggestText] ✅ Generated', suggestions.length, 'suggestions');

    return NextResponse.json({
      ok: true,
      suggestions
    });

  } catch (error: any) {
    console.error('[SuggestText] ❌ Error:', error);

    // Fallback vers suggestions basiques si l'IA échoue
    const fallbackSuggestions = [
      'Votre solution face à cette actu',
      'L\'opportunité de la semaine',
      'Comment ça vous impacte ?',
      'Votre réponse à cette tendance',
      'Saisissez cette opportunité'
    ];

    return NextResponse.json({
      ok: true,
      suggestions: fallbackSuggestions,
      warning: 'Suggestions par défaut (IA indisponible)'
    });
  }
}
