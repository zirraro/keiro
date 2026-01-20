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

    // Construire le prompt expert ULTRA-AGRESSIF pour textes Instagram qui STOPPENT le scroll
    const prompt = `Tu es un EXPERT en copywriting Instagram viral et provocateur.
Ta mission : créer des punchlines overlay qui ARRÊTENT le défilement en 0,5 seconde.

CONTEXTE:
📰 Actualité: "${newsTitle}"
${newsDescription ? `Détails: ${newsDescription}` : ''}
🏢 Business: ${businessType}
${businessDescription ? `Description: ${businessDescription}` : ''}
${targetAudience ? `Audience: ${targetAudience}` : ''}
Ton voulu: ${tone || 'Confiant, premium, provocateur'}

RÈGLES DE CRÉATION (IMPÉRATIF):

✅ AUTORISÉ et ENCOURAGÉ:
- Ellipse et tension (phrases incomplètes mais évocatrices)
- Ton confiant, premium, provocateur, ironique, satirique
- Questions qui dérangent, affirmations qui choquent
- Jeux de mots, double-sens, second degré
- Chiffres brutaux, vérités crues
- Emojis stratégiques (max 1 par texte)
- Lecture instantanée (0,5 seconde max)

❌ INTERDICTIONS ABSOLUES:
- Banalités marketing ("Découvrez", "Profitez", "Saisissez l'opportunité")
- Mots creux (innovation, disruption, révolution, transformation digitale)
- Reformulation plate de l'actualité
- Textes qui passent inaperçus
- Gentillesse corporate fade
- Questions rhétoriques molles

🎯 10 PUNCHLINES OBLIGATOIRES (approches variées):

1. CHIFFRE BRUTAL → Ex: "IA = -70% jobs 🤖"
2. QUESTION PROVOCANTE → Ex: "T'es obsolète en 2026 ?"
3. AFFIRMATION CHOC → Ex: "Ton diplôme ne vaut rien"
4. IRONIE/SATIRE → Ex: "Inflation ? Quelle inflation ? 🙃"
5. ELLIPSE TENDUE → Ex: "Quand ton boss découvre..."
6. VÉRITÉ CRUE → Ex: "Marketing = mensonge légal"
7. URGENCE BRUTALE → Ex: "2 semaines pour survivre ⏰"
8. DOUBLE-SENS → Ex: "Tout le monde te ment. Nous aussi."
9. CALL-OUT DIRECT → Ex: "Oui, toi qui scrolles"
10. PUNCHLINE PREMIUM → Ex: "Pendant que tu hésites..."

EXEMPLES DE PUNCHLINES QUI TUENT:

Actu: "Inflation 5.2%"
Business: "Restaurant bio"
❌ FADE: "Manger bio malgré l'inflation"
✅ TUEUR: "Bio à 15€ quand tout explose ? 😏"

Actu: "IA ChatGPT 100M users"
Business: "Formation"
❌ FADE: "Formez-vous à l'IA"
✅ TUEUR: "Ton job n'existe plus en 2027"

Actu: "Canicule 42°C"
Business: "Climatisation"
❌ FADE: "Climatisation écologique"
✅ TUEUR: "Crever de chaud ET de culpabilité ?"

CONTRAINTES TECHNIQUES:
- Maximum 45 caractères (emojis inclus)
- 10 propositions DISTINCTES
- Aucune justification, juste les textes
- Chaque texte = approche DIFFÉRENTE
- Lisible et compris en 0,5 seconde

TON MISSION MAINTENANT:

1. Analyse le lien entre "${newsTitle}" et "${businessType}"
2. Trouve l'ANGLE LE PLUS VIOLENT/PROVOCANT/INATTENDU
3. Génère 10 PUNCHLINES qui STOPPENT le scroll Instagram
4. Varie les approches (chiffre brutal, question choc, ironie, ellipse, etc.)
5. Zéro banalité. Zéro politesse corporate. Pure efficacité.

CRITÈRES DE RÉUSSITE:
- Si je peux lire le texte sur n'importe quelle autre marque → ÉCHEC
- Si ça ne choque/interpelle/intrigue pas → ÉCHEC
- Si c'est "gentil" et consensuel → ÉCHEC
- Si ça dépasse 45 caractères → ÉCHEC
- Si quelqu'un scroll sans s'arrêter → ÉCHEC TOTAL

GÉNÈRE maintenant 10 punchlines EN FRANÇAIS pour:
Actu: "${newsTitle}"
Business: "${businessType}"

FORMAT DE RÉPONSE:
JSON array uniquement. Une punchline par ligne. Aucune explication.
["Punchline 1", "Punchline 2", "Punchline 3", "Punchline 4", "Punchline 5", "Punchline 6", "Punchline 7", "Punchline 8", "Punchline 9", "Punchline 10"]`;

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2048, // Augmenté pour permettre une meilleure analyse
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
      .map(s => s.trim().substring(0, 45))
      .slice(0, 10);

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
