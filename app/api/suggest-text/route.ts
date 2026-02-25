import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';

export async function POST(req: NextRequest) {
  try {
    // --- Auth optionnelle (fonctionne aussi sans compte) ---
    const { user } = await getAuthUser();
    let isAdminUser = false;
    let shouldDeductCredits = false;

    if (user) {
      isAdminUser = await isAdmin(user.id);
      if (!isAdminUser) {
        const check = await checkCredits(user.id, 'text_suggest');
        if (!check.allowed) {
          return NextResponse.json(
            { ok: false, error: 'Crédits insuffisants', insufficientCredits: true, cost: check.cost, balance: check.balance },
            { status: 402 }
          );
        }
        shouldDeductCredits = true;
      }
    }
    // Non-connecté = gratuit (pas de déduction crédits)

    const body = await req.json();
    const { newsTitle, newsDescription, businessType, businessDescription, tone, targetAudience } = body;

    if (!businessType) {
      return NextResponse.json(
        { ok: false, error: 'Type de business requis' },
        { status: 400 }
      );
    }

    const hasNews = newsTitle && newsTitle.trim();

    console.log('[SuggestText] Generating suggestions with Claude...', {
      hasNews,
      newsTitle: hasNews ? newsTitle.substring(0, 50) : '(sans actu)',
      businessType
    });

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Prompt adapté selon le mode (avec ou sans actualité)
    let prompt: string;

    if (hasNews) {
      prompt = `Tu es un copywriter expert en textes overlay pour les réseaux sociaux.

ÉTAPE 1 — ANALYSE DU LIEN :
Actualité: "${newsTitle}"
${newsDescription ? `Contexte: ${newsDescription}` : ''}
Business: ${businessType}
${businessDescription ? `Ce business fait: ${businessDescription}` : ''}
${targetAudience ? `Pour: ${targetAudience}` : ''}

Question clé: "Quel est le PONT CONCRET entre CE business et CETTE actualité ?"

ÉTAPE 2 — GÉNÈRE 10 PUNCHLINES basées sur ce lien :

RÈGLES:
- Chaque punchline DOIT évoquer le business ET l'actu — les deux !
- Entre 4 et 10 mots par punchline — phrase COMPLÈTE, COHÉRENTE et qui a du SENS
- CHAQUE phrase doit être AUTONOME — compréhensible sans contexte supplémentaire
- Ton: ${tone || 'Confiant, premium'}
- VARIÉTÉ : 10 angles différents, pas 10 reformulations de la même idée
- Le DERNIER MOT de chaque phrase doit être un vrai mot qui conclut la phrase (pas un mot coupé)

INTERDIT:
- Phrases tronquées, incomplètes ou qui s'arrêtent en plein milieu
- Finir par "..." ou par un mot sans sens
- Reformuler l'actu sans lien au business
- Mots vides: "innovation", "disruption", "découvrez", "profitez"
- Punchlines génériques applicables à tout

EXEMPLES:
Actu: "Inflation 5.2%" / Business: "Restaurant bio"
✅ "Le bio malin quand tout flambe"
✅ "Bien manger sans se ruiner 🍃"
✅ "Prix doux, saveurs intenses"

Actu: "IA remplace des emplois" / Business: "Agence de design"
✅ "L'IA dessine, on crée l'émotion"
✅ "Le design humain a de l'avenir ✨"

10 APPROCHES: Chiffre, Question, Solution, Ironie, Urgence, Comparaison, Promesse, Défi, Double-sens, Affirmation

FORMAT: JSON array pur, 10 éléments, EN FRANÇAIS.
["Punchline 1", "Punchline 2", ...]`;
    } else {
      prompt = `Tu es un copywriter expert en textes overlay pour les réseaux sociaux.

CONTEXTE:
Business: ${businessType}
${businessDescription ? `Description: ${businessDescription}` : ''}
${targetAudience ? `Cible: ${targetAudience}` : ''}

GÉNÈRE 10 PUNCHLINES pour mettre en valeur CE business :

RÈGLES:
- Chaque punchline DOIT être SPÉCIFIQUE à "${businessType}" (pas générique)
- Entre 4 et 10 mots par punchline — phrase COMPLÈTE, COHÉRENTE et qui a du SENS
- CHAQUE phrase doit être AUTONOME — compréhensible sans contexte supplémentaire
- Le DERNIER MOT doit conclure la phrase proprement (jamais un mot coupé)
- Ton: ${tone || 'Confiant, premium'}
- VARIÉTÉ : 10 angles différents, pas 10 reformulations

INTERDIT:
- Phrases tronquées, incomplètes ou qui s'arrêtent en plein milieu
- Finir par "..." ou par un mot sans sens
- Textes génériques ("Découvrez-nous", "Le meilleur choix")
- Mots vides: "innovation", "disruption", "profitez"
- Punchlines applicables à n'importe quel business

EXEMPLES pour "Boulangerie artisanale":
✅ "Fait main, cuit au feu de bois"
✅ "L'odeur du pain à 5h du mat'"
✅ "Croûte dorée, mie fondante 🥖"

EXEMPLES pour "Coach sportif":
✅ "Ton corps te remerciera demain"
✅ "Zéro excuse, que des résultats 💪"

10 APPROCHES: Savoir-faire, Émotion, Qualité, Histoire, Humour, Promesse, Exclusivité, Proximité, Passion, Identité

FORMAT: JSON array pur, 10 éléments, EN FRANÇAIS.
["Punchline 1", "Punchline 2", ...]`;
    }

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2048,
      temperature: 0.85,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('[SuggestText] Claude response:', responseText.substring(0, 200));

    let suggestions: string[] = [];
    try {
      suggestions = JSON.parse(responseText);
    } catch (parseError) {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Format de réponse invalide');
      }
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      throw new Error('Aucune suggestion générée');
    }

    suggestions = suggestions
      .filter(s => typeof s === 'string' && s.trim().length > 0)
      .map(s => s.trim())
      .filter(s => {
        // Filtrer les phrases manifestement tronquées (finissent par un mot coupé ou '...')
        if (s.endsWith('...') || s.endsWith('…')) return false;
        // Vérifier que la phrase est complète (au moins 3 mots)
        const words = s.split(/\s+/);
        if (words.length < 2) return false;
        return true;
      })
      .slice(0, 10);

    console.log('[SuggestText] Generated', suggestions.length, 'suggestions');

    let newBalance: number | undefined;
    if (shouldDeductCredits && user) {
      const result = await deductCredits(user.id, 'text_suggest', 'Suggestion texte IA');
      newBalance = result.newBalance;
    }

    return NextResponse.json({ ok: true, suggestions, newBalance });

  } catch (error: any) {
    console.error('[SuggestText] Error:', error);

    const fallbackSuggestions = [
      'Votre solution',
      'L\'opportunité du moment',
      'On en parle ?',
      'Votre atout',
      'À découvrir'
    ];

    return NextResponse.json({
      ok: true,
      suggestions: fallbackSuggestions,
      warning: 'Suggestions par défaut (IA indisponible)'
    });
  }
}
