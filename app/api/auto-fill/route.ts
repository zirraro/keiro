import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';

export async function POST(req: NextRequest) {
  try {
    // --- Auth + crédits ---
    const { user } = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, blocked: true, reason: 'requires_account' },
        { status: 403 }
      );
    }

    const isAdminUser = await isAdmin(user.id);
    if (!isAdminUser) {
      const check = await checkCredits(user.id, 'text_suggest');
      if (!check.allowed) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, cost: check.cost, balance: check.balance },
          { status: 402 }
        );
      }
    }

    const body = await req.json();
    const { newsTitle, newsDescription, businessType, businessDescription, communicationProfile, targetAudience } = body;

    if (!businessType) {
      return NextResponse.json({ ok: false, error: 'Business type requis' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const hasNews = newsTitle && newsTitle.trim();
    const newsContext = hasNews
      ? `Actualité sélectionnée: "${newsTitle}"${newsDescription ? `\nDétails: ${newsDescription.substring(0, 200)}` : ''}`
      : 'Pas d\'actualité sélectionnée — génère des réponses centrées sur le business uniquement.';

    const prompt = `Tu es un expert marketing et communication digitale. Analyse ce contexte et génère des réponses PERSONNALISÉES, CONCRÈTES et SPÉCIFIQUES (jamais génériques).

CONTEXTE:
- Business: ${businessType}${businessDescription ? ` — ${businessDescription}` : ''}
- ${newsContext}
- Profil de communication: ${communicationProfile || 'inspirant'}
${targetAudience ? `- Audience cible: ${targetAudience}` : ''}

GÉNÈRE un JSON avec ces 6 champs. Chaque réponse doit être SPÉCIFIQUE à CE business et ${hasNews ? 'CETTE actualité' : 'son activité'}. Pas de phrases bateaux.

{
  "storyToTell": "L'histoire concrète à raconter (1-2 phrases, spécifique au business${hasNews ? ' face à cette actu' : ''})",
  "publicationGoal": "Le but précis de cette publication (1 phrase, actionnable)",
  "emotionToConvey": "L'émotion exacte à transmettre (2-3 mots max)",
  "problemSolved": "Le problème concret que CE business résout${hasNews ? ' face à CETTE actu' : ''} (1 phrase)",
  "uniqueAdvantage": "L'avantage unique de ce TYPE de business (1 phrase, pas générique)",
  "desiredVisualIdea": "Une idée visuelle originale et concrète pour CE business${hasNews ? ' en lien avec cette actu' : ''} (1-2 phrases descriptives)"
}

EXEMPLES de BONNES réponses (pour un restaurant bio face à "Inflation 5.2%"):
- storyToTell: "Quand les prix flambent partout, notre carte reste accessible grâce aux circuits courts"
- problemSolved: "L'inflation rend les repas au restaurant inabordables — nos prix restent stables grâce au local"
- desiredVisualIdea: "Un chef souriant dans sa cuisine ouverte, entouré de légumes colorés du marché, ambiance chaleureuse et accessible"

EXEMPLES de MAUVAISES réponses (trop génériques):
- storyToTell: "Nous proposons des solutions innovantes" ❌
- problemSolved: "Nous résolvons les problèmes de nos clients" ❌

Réponds UNIQUEMENT avec le JSON, sans markdown ni explication.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    let fields: any = {};
    try {
      fields = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        fields = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Format de réponse invalide');
      }
    }

    // Déduction crédits
    let newBalance: number | undefined;
    if (!isAdminUser) {
      const result = await deductCredits(user.id, 'text_suggest', 'Auto-fill IA');
      newBalance = result.newBalance;
    }

    return NextResponse.json({ ok: true, fields, newBalance });

  } catch (error: any) {
    console.error('[AutoFill] Error:', error);
    return NextResponse.json({ ok: false, error: 'Erreur auto-fill' }, { status: 500 });
  }
}
