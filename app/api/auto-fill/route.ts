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
            { ok: false, insufficientCredits: true, cost: check.cost, balance: check.balance },
            { status: 402 }
          );
        }
        shouldDeductCredits = true;
      }
    }
    // Non-connecté = gratuit (pas de déduction crédits)

    const body = await req.json();
    const { newsTitle, newsDescription, businessType, businessDescription, communicationProfile, targetAudience } = body;

    if (!businessType) {
      return NextResponse.json({ ok: false, error: 'Business type requis' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const hasNews = newsTitle && newsTitle.trim();
    const newsContext = hasNews
      ? `Actualité sélectionnée: "${newsTitle}"${newsDescription ? `\nDétails: ${newsDescription.substring(0, 300)}` : ''}`
      : 'Pas d\'actualité sélectionnée — génère des réponses centrées sur le business uniquement.';

    const prompt = `Tu es un expert en marketing digital et communication sur les réseaux sociaux. Tu dois analyser PRÉCISÉMENT le contexte ci-dessous et générer des réponses ULTRA-PERSONNALISÉES.

CONTEXTE COMPLET:
- Business: "${businessType}"${businessDescription ? ` — Description: "${businessDescription}"` : ''}
- ${newsContext}
- Style de communication souhaité: ${communicationProfile || 'inspirant'}
${targetAudience ? `- Public cible: ${targetAudience}` : ''}

INSTRUCTIONS CRITIQUES:
${hasNews ? `1. Lis et COMPRENDS l'actualité "${newsTitle}" — de quoi parle-t-elle exactement ?
2. Trouve le LIEN CONCRET entre "${businessType}" et CETTE actualité spécifique
3. Chaque réponse doit montrer que tu as COMPRIS l'actu et le business` : `1. Concentre-toi sur "${businessType}" et son activité
2. Chaque réponse doit être SPÉCIFIQUE à ce business, pas générique`}

GÉNÈRE exactement ce JSON (9 champs):

{
  "imageAngle": "[1 phrase] L'angle VISUEL de l'image — comment cadrer la scène",
  "marketingAngle": "[1 phrase] L'angle MARKETING — la stratégie de communication",
  "contentAngle": "[1 phrase] L'angle ÉDITORIAL — le type de contenu (témoignage, éducatif, coulisses, opinion, inspirant)",
  "storyToTell": "[1-2 phrases] L'angle narratif CONCRET pour ${hasNews ? 'lier ce business à cette actu' : 'mettre en valeur ce business'}",
  "publicationGoal": "[1 phrase] L'objectif PRÉCIS et MESURABLE de ce post",
  "emotionToConvey": "[2-4 mots] L'émotion EXACTE à provoquer chez la cible",
  "problemSolved": "[1 phrase] Le problème CONCRET que ${businessType} résout ${hasNews ? 'dans le contexte de cette actu' : 'pour ses clients'}",
  "uniqueAdvantage": "[1 phrase] Ce qui rend ${businessType} UNIQUE par rapport aux alternatives",
  "desiredVisualIdea": "[2-3 phrases] Description VISUELLE DÉTAILLÉE de la scène à créer — couleurs, ambiance, éléments, action"
}

EXEMPLE pour "bijouterie artisanale" + actu "Ligue des champions PSG vs Monaco":
{
  "imageAngle": "Gros plan dramatique sur le bijou avec reflets de projecteurs de stade en arrière-plan",
  "marketingAngle": "Surfer sur l'émotion du match pour montrer que nos pièces sont aussi exceptionnelles qu'un exploit sportif",
  "contentAngle": "Contenu inspirant liant l'émotion du sport à l'artisanat d'exception",
  "storyToTell": "Comme Monaco qui brille contre les géants, nos créations artisanales rivalisent avec les grandes maisons — petit mais éclatant",
  "publicationGoal": "Générer de l'engagement en surfant sur l'émotion du match pour montrer nos pièces de caractère",
  "emotionToConvey": "Fierté combative et élégance",
  "problemSolved": "Dans un monde de bijoux industriels, nos pièces uniques offrent le même frisson qu'un exploit sportif — l'exception face à la masse",
  "uniqueAdvantage": "Chaque bijou est une pièce unique faite main, comme chaque match de championnat est un moment irrepetible",
  "desiredVisualIdea": "Gros plan sur un bijou en forme d'animal étincelant sous des projecteurs façon stade, fond bleu nuit avec des reflets dorés comme les lumières d'une arène sportive, ambiance victoire et luxe"
}

Réponds UNIQUEMENT avec le JSON valide, sans texte avant ni après.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('[AutoFill] Claude response:', responseText.substring(0, 300));

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

    // Déduction crédits seulement si connecté et pas admin
    let newBalance: number | undefined;
    if (shouldDeductCredits && user) {
      const result = await deductCredits(user.id, 'text_suggest', 'Auto-fill IA');
      newBalance = result.newBalance;
    }

    return NextResponse.json({ ok: true, fields, newBalance });

  } catch (error: any) {
    console.error('[AutoFill] Error:', error);
    return NextResponse.json({ ok: false, error: 'Erreur auto-fill' }, { status: 500 });
  }
}
