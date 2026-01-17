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

    // Construire le prompt expert ultra-ciblé
    const prompt = `Tu es un expert stratège en communication digitale et copywriting Instagram, spécialisé dans la création de propositions de valeur percutantes.

ANALYSE DU CONTEXTE:

📰 ACTUALITÉ:
Titre: "${newsTitle}"
${newsDescription ? `Détails: ${newsDescription}` : ''}

🏢 BUSINESS CLIENT:
Type: ${businessType}
${businessDescription ? `Description: ${businessDescription}` : ''}
${targetAudience ? `Audience: ${targetAudience}` : ''}
Ton: ${tone || 'Inspirant et engageant'}

🎯 TA MISSION STRATÉGIQUE:

1. ANALYSER le lien entre cette actualité et ce business spécifique
2. IDENTIFIER l'opportunité, le problème résolu, ou la valeur ajoutée CONCRÈTE
3. CRÉER 5 propositions ultra-ciblées qui montrent CE business comme LA solution face à CETTE actualité

RÈGLES STRICTES:

✅ FAIRE:
- Lien DIRECT et ÉVIDENT actualité → business (pas générique!)
- Proposition de valeur CONCRÈTE (comment ça aide le client?)
- Vocabulaire SPÉCIFIQUE au secteur du business
- Angle unique qui positionne ce business comme expert
- Call-to-action implicite ou question engageante
- Maximum 50 caractères (ultra-lisible sur mobile)

❌ NE PAS FAIRE:
- Textes génériques qui marcheraient pour n'importe quel business
- Clichés marketing ("saisissez l'opportunité", "découvrez", etc.)
- Questions vagues sans lien précis
- Formules bateau qui ne montrent pas la valeur

EXEMPLES DE QUALITÉ:

❌ MAUVAIS (générique): "Votre solution face à l'actu"
✅ BON (spécifique): "IA = -50% temps comptable" [si actu IA + business comptabilité]

❌ MAUVAIS: "Comment ça vous impacte?"
✅ BON: "Inflation? On fixe vos prix 12 mois" [si actu inflation + business fournisseur]

❌ MAUVAIS: "L'opportunité du moment"
✅ BON: "Nouveau CPF = formation cybersécurité offerte" [si actu CPF + business formation]

GÉNÈRE 5 propositions qui suivent ce niveau d'excellence.
Chaque texte doit montrer un lien ULTRA-PRÉCIS entre l'actualité et la valeur unique de ce business.

FORMAT DE RÉPONSE:
JSON array uniquement, rien d'autre.
["Texte 1", "Texte 2", "Texte 3", "Texte 4", "Texte 5"]`;

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
      .map(s => s.trim().substring(0, 50))
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
