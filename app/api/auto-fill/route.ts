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

    // Direction créative aléatoire pour forcer la variété à chaque appel
    const DIRECTIONS = [
      'MACRO — gros plan extrême sur un détail, textures visibles, bokeh',
      'PANORAMA — plan large, contexte environnemental, ambiance globale',
      'ACTION — mouvement capturé, dynamisme, énergie brute',
      'PORTRAIT — focus sur les personnes, expressions, regard caméra',
      'FLAT LAY — vue du dessus, composition graphique, objets arrangés',
      'AMBIANCE — focus sur l\'atmosphère, lumière, couleurs dominantes',
      'COULISSES — en backstage, le processus, la fabrication, l\'envers du décor',
      'CONTRASTE — opposition visuelle, lumière/ombre, grand/petit, neuf/ancien',
      'EMOTION — l\'instant décisif, la réaction humaine, le sourire, la surprise',
      'GRAPHIQUE — composition géométrique, lignes fortes, minimalisme',
    ];
    const randomDirection = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];

    const prompt = `Tu es un DIRECTEUR CRÉATIF audacieux. Chaque réponse doit être UNIQUE et SURPRENANTE — jamais de clichés marketing.

DIRECTION CRÉATIVE IMPOSÉE: ${randomDirection}
(Utilise cette direction pour TOUT : angle image, histoire, visuel)

CONTEXTE:
- Business: "${businessType}"${businessDescription ? ` — ${businessDescription}` : ''}
- ${newsContext}
- Communication: ${communicationProfile || 'inspirant'}
${targetAudience ? `- Cible: ${targetAudience}` : ''}

${hasNews ? `ANALYSE le lien CONCRET entre "${businessType}" et l'actu "${newsTitle}".` : `Mets en valeur "${businessType}" de façon ORIGINALE et INATTENDUE.`}

GÉNÈRE ce JSON (9 champs) — sois CRÉATIF et SPÉCIFIQUE, PAS générique:

{
  "imageAngle": "[1 phrase] Cadrage PRÉCIS inspiré de la direction créative",
  "marketingAngle": "[1 phrase] Stratégie de com ORIGINALE, pas du marketing bateau",
  "contentAngle": "[1 phrase] Type de contenu (coulisses, défi, avant/après, témoignage, humour, comparaison, éducatif)",
  "storyToTell": "[1-2 phrases] Le récit CONCRET et SURPRENANT ${hasNews ? 'liant business et actu' : 'valorisant le business'}",
  "publicationGoal": "[1 phrase] Objectif PRÉCIS du post",
  "emotionToConvey": "[2-4 mots] Émotion EXACTE à provoquer",
  "problemSolved": "[1 phrase] Problème CONCRET résolu par ${businessType}",
  "uniqueAdvantage": "[1 phrase] Ce qui rend ${businessType} IRREMPLAÇABLE",
  "desiredVisualIdea": "[2-3 phrases] Scène VISUELLE CONCRÈTE — DÉCRIS ce qu'on VOIT: objets, couleurs, lumière, action, cadrage. PAS de concepts abstraits. AUCUN texte, mot, panneau, étiquette visible dans la scène."
}

INTERDIT dans desiredVisualIdea:
- Panneaux, enseignes, écrans avec du texte, étiquettes de prix, menus
- Descriptions vagues ("ambiance chaleureuse", "éclairage cinématique")
- Répéter les mêmes visuels que d'habitude

Réponds UNIQUEMENT avec le JSON valide.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      temperature: 0.95,
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
