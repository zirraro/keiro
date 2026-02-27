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

    // 2 dimensions créatives aléatoires pour forcer la variété à chaque appel
    const ANGLES = [
      'MACRO — gros plan extrême sur un détail, textures visibles, bokeh',
      'PANORAMA — plan large, contexte environnemental, ambiance globale',
      'ACTION — mouvement figé, dynamisme, énergie brute',
      'PORTRAIT — focus sur une personne, expressions, regard caméra',
      'FLAT LAY — vue du dessus, composition graphique, objets arrangés',
      'COULISSES — en backstage, processus de fabrication, envers du décor',
      'CONTRASTE — opposition visuelle, lumière/ombre, ancien/nouveau',
      'GRAPHIQUE — composition géométrique, lignes fortes, minimalisme',
      'CINÉMATIQUE — cadrage de film, profondeur de champ, storytelling visuel',
      'DOCUMENTAIRE — pris sur le vif, authenticité, moment volé',
      'SURPLOMBANT — vue aérienne, drone, perspective en plongée',
      'INTIME — très proche, détail, chaleur humaine, proximité',
    ];
    const MOODS = [
      'Golden hour — lumière dorée, ombres longues',
      'Blue hour — teintes bleues, crépuscule, néons',
      'Clair-obscur — contrastes forts, dramatique',
      'Brumeux — atmosphère mystérieuse, voilée',
      'Nuit — néons, reflets, lumières artificielles',
      'Soleil cru — ombres dures, couleurs saturées',
      'Pastel — doux, aérien, lumineux',
      'Industriel — brut, béton, métal, vapeur',
      'Tropical — couleurs vives, luxuriant, exotique',
      'Hivernal — froid, blanc, givre, vapeur du souffle',
    ];
    const STRATEGIES = [
      'HUMOUR — décalage, clin d\'oeil, ironie douce',
      'ÉMOTION — toucher au coeur, empathie, nostalgie',
      'PROVOCATION — interpeller, bousculer, surprendre',
      'ASPIRATION — faire rêver, inspirer, projeter',
      'ÉDUCATION — apprendre, révéler, décrypter',
      'AUTHENTICITÉ — coulisses, vérité, sans filtre',
      'URGENCE — maintenant, dernière chance, exclusif',
      'COMMUNAUTÉ — ensemble, partage, appartenance',
    ];
    const randomAngle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
    const randomMood = MOODS[Math.floor(Math.random() * MOODS.length)];
    const randomStrategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];

    const prompt = `Tu es un DIRECTEUR CRÉATIF de campagnes social media. Chaque réponse doit être UNIQUE, CRÉATIVE et SURPRENANTE — JAMAIS de clichés marketing, JAMAIS la même chose deux fois.

DIRECTION CRÉATIVE IMPOSÉE (tu DOIS l'appliquer):
- Cadrage: ${randomAngle}
- Ambiance: ${randomMood}
- Stratégie: ${randomStrategy}

CONTEXTE:
- Business: "${businessType}"${businessDescription ? ` — ${businessDescription}` : ''}
- ${newsContext}
- Communication: ${communicationProfile || 'inspirant'}
${targetAudience ? `- Cible: ${targetAudience}` : ''}

${hasNews ? `ÉTAPE 1 — COMPRENDS L'ACTU EXACTE:
Lis attentivement le titre "${newsTitle}" et les détails.
Identifie: QUI fait QUOI, OÙ, et POURQUOI c'est important.
NE CONFONDS PAS les lieux, personnes ou événements. Si c'est du sport, identifie le sport EXACT et les équipes.

ÉTAPE 2 — TROUVE UN LIEN CRÉATIF:
Relie "${businessType}" à cette actu SPÉCIFIQUE de façon ORIGINALE et INATTENDUE.
Le lien doit être CONCRET, pas vague.` : `Mets en valeur "${businessType}" de façon ORIGINALE et INATTENDUE. Trouve un angle FRAIS.`}

GÉNÈRE ce JSON (9 champs) — CHAQUE champ doit être CRÉATIF, SPÉCIFIQUE et DIFFÉRENT à chaque appel:

{
  "imageAngle": "[1 phrase] Cadrage photo PRÉCIS (PAS 'vue rapprochée' mais 'macro sur les doigts tenant X avec Y en arrière-plan flou')",
  "marketingAngle": "[1 phrase] Stratégie de com ORIGINALE — PAS 'mettre en avant la qualité' mais un angle SURPRENANT",
  "contentAngle": "[1 phrase] Format PRÉCIS: coulisses, défi, avant/après, témoignage client, comparaison inattendue, quiz, making-of, confession, erreur courante...",
  "storyToTell": "[1-2 phrases] Le récit CONCRET et SURPRENANT ${hasNews ? 'liant business et actu — CITE des éléments SPÉCIFIQUES de l\'actu' : 'valorisant le business'}",
  "publicationGoal": "[1 phrase] Objectif MESURABLE et PRÉCIS du post",
  "emotionToConvey": "[2-4 mots] Émotion PRÉCISE (pas 'joie' mais 'fierté du fait-main', pas 'confiance' mais 'soulagement de trouver enfin')",
  "problemSolved": "[1 phrase] Problème QUOTIDIEN et CONCRET résolu par ${businessType}",
  "uniqueAdvantage": "[1 phrase] Détail SPÉCIFIQUE qui rend ${businessType} IRREMPLAÇABLE (pas des généralités)",
  "desiredVisualIdea": "[2-3 phrases] Scène VISUELLE 100% CONCRÈTE — DÉCRIS EXACTEMENT ce qu'on VOIT: quels objets, quelles couleurs dominantes, quelle lumière, quelle action en cours, quel cadrage précis. AUCUN texte, mot, panneau, étiquette visible. ${hasNews ? 'La scène doit ILLUSTRER le lien business/actu de façon VISUELLE (pas avec du texte).' : ''}"
}

RÈGLES ABSOLUES:
- NE copie PAS d'exemples précédents — invente du NEUF
- CHAQUE champ doit refléter la direction créative imposée ci-dessus
- desiredVisualIdea: ZÉRO texte visible, ZÉRO description vague, ZÉRO cliché photo ("éclairage cinématique", "ambiance chaleureuse")
- ${hasNews ? 'NE CONFONDS PAS le contexte de l\'actu (pays, sport, personnes)' : 'Sois SPÉCIFIQUE au business, pas générique'}

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
