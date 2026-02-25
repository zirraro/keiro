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
      prompt = `Tu es un copywriter expert qui crée des textes overlay COURTS pour les réseaux sociaux.

ÉTAPE 1 — ANALYSE DU LIEN (réfléchis avant de générer) :
Actualité: "${newsTitle}"
${newsDescription ? `Contexte: ${newsDescription}` : ''}
Business: ${businessType}
${businessDescription ? `Ce business fait: ${businessDescription}` : ''}
${targetAudience ? `Pour: ${targetAudience}` : ''}

Demande-toi: "Comment CE business est directement impacté ou peut profiter de CETTE actualité ?"
Quel est le PONT CONCRET entre les deux ?

ÉTAPE 2 — GÉNÈRE 10 PUNCHLINES basées sur CE LIEN :

RÈGLES ABSOLUES:
- Chaque punchline DOIT évoquer le business ET l'actu
- Max 30 caractères (emojis inclus) — COURT pour overlay image
- Ton: ${tone || 'Confiant, premium'}
- Lecture instantanée en 1 seconde

INTERDIT:
- Reformuler l'actu sans lien au business
- Mots vides: "innovation", "disruption", "découvrez", "profitez"
- Punchlines génériques

EXEMPLES:
Actu: "Inflation 5.2%" / Business: "Restaurant bio"
✅ "Bio à 15€ quand tout flambe 😏"

10 APPROCHES: Chiffre, Question, Solution, Ironie, Urgence, Comparaison, Promesse, Défi, Double-sens, Affirmation

FORMAT: JSON array pur, 10 éléments, EN FRANÇAIS.
["Punchline 1", "Punchline 2", ...]`;
    } else {
      // Mode sans actualité — centré sur le business uniquement
      prompt = `Tu es un copywriter expert qui crée des textes overlay COURTS pour les réseaux sociaux.

CONTEXTE:
Business: ${businessType}
${businessDescription ? `Description: ${businessDescription}` : ''}
${targetAudience ? `Cible: ${targetAudience}` : ''}

GÉNÈRE 10 PUNCHLINES pour mettre en valeur CE business :

RÈGLES ABSOLUES:
- Chaque punchline DOIT être SPÉCIFIQUE à "${businessType}" (pas générique)
- Max 30 caractères (emojis inclus) — COURT pour overlay image
- Ton: ${tone || 'Confiant, premium'}
- Lecture instantanée en 1 seconde

INTERDIT:
- Textes génériques ("Découvrez-nous", "Le meilleur choix")
- Mots vides: "innovation", "disruption", "profitez"
- Punchlines applicables à n'importe quel business

EXEMPLES pour "Boulangerie artisanale":
✅ "Pétri à la main, pas en usine"
✅ "Pain chaud, 5h du mat' 🥖"

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
      .map(s => s.trim().substring(0, 30))
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
