import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';

export async function POST(req: NextRequest) {
  try {
    // --- Vérification auth + crédits ---
    const { user } = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, blocked: true, reason: 'requires_account', cta: true },
        { status: 403 }
      );
    }

    const isAdminUser = await isAdmin(user.id);
    if (!isAdminUser) {
      const check = await checkCredits(user.id, 'text_suggest');
      if (!check.allowed) {
        return NextResponse.json(
          { ok: false, error: 'Crédits insuffisants', insufficientCredits: true, cost: check.cost, balance: check.balance },
          { status: 402 }
        );
      }
    }

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

    // Construire le prompt optimisé pour Claude Haiku
    // Étape 1: Forcer l'IA à analyser le LIEN business↔actu avant de générer
    const prompt = `Tu es un copywriter expert qui crée des textes overlay pour les réseaux sociaux.

ÉTAPE 1 — ANALYSE DU LIEN (réfléchis avant de générer) :
Actualité: "${newsTitle}"
${newsDescription ? `Contexte: ${newsDescription}` : ''}
Business: ${businessType}
${businessDescription ? `Ce business fait: ${businessDescription}` : ''}
${targetAudience ? `Pour: ${targetAudience}` : ''}

Demande-toi: "Comment CE business est directement impacté ou peut profiter de CETTE actualité ?"
Quel est le PONT CONCRET entre les deux ? (ex: si actu=inflation et business=restaurant bio → le bio comme choix malin face aux prix qui montent)

ÉTAPE 2 — GÉNÈRE 10 PUNCHLINES basées sur CE LIEN :

RÈGLES ABSOLUES:
- Chaque punchline DOIT mentionner ou évoquer le business (pas juste reformuler l'actu)
- Le lien business↔actu doit être ÉVIDENT pour le lecteur
- Max 45 caractères (emojis inclus)
- Ton: ${tone || 'Confiant, premium'}
- Lecture instantanée

INTERDIT:
- Reformuler l'actu sans lien au business
- Mots vides: "innovation", "disruption", "découvrez", "profitez"
- Punchlines génériques qui marchent pour n'importe quel business

EXEMPLES AVEC BON LIEN:
Actu: "Inflation 5.2%" / Business: "Restaurant bio"
❌ "L'inflation monte encore" (juste l'actu, pas le business)
✅ "Bio à 15€ quand tout flambe 😏" (lien: le bio face à l'inflation)

Actu: "Canicule 42°C" / Business: "Glacier artisanal"
❌ "Il fait chaud cet été" (juste l'actu)
✅ "42°C, nos sorbets fondent pas 🍨" (lien: le produit face à la chaleur)

Actu: "IA remplace des jobs" / Business: "Formation professionnelle"
❌ "L'IA va tout changer" (juste l'actu)
✅ "Formé à l'IA > remplacé par l'IA" (lien: la formation comme solution)

10 APPROCHES DIFFÉRENTES:
1. Chiffre + business / 2. Question provocante / 3. Business = solution / 4. Ironie / 5. Urgence
6. Comparaison / 7. Promesse directe / 8. Défi au lecteur / 9. Double-sens / 10. Affirmation forte

FORMAT: JSON array pur, 10 éléments, EN FRANÇAIS.
["Punchline 1", "Punchline 2", ...]`;

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2048,
      temperature: 0.85, // Créatif mais pertinent
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

    // --- Déduction crédits après succès ---
    let newBalance: number | undefined;
    if (!isAdminUser) {
      const result = await deductCredits(user.id, 'text_suggest', 'Suggestion texte IA');
      newBalance = result.newBalance;
    }

    return NextResponse.json({
      ok: true,
      suggestions,
      newBalance,
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
