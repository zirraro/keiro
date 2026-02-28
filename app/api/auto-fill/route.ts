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
    const { newsTitle, newsDescription, businessType, businessDescription, communicationProfile, targetAudience, contentFocus = 50 } = body;

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
    const VISUAL_CONCEPTS = [
      'JUXTAPOSITION — deux mondes qui se rencontrent dans le même cadre, contraste fort entre business et contexte',
      'MÉTAPHORE VISUELLE — un objet du business transformé ou détourné pour évoquer l\'actualité sans la montrer littéralement',
      'MISE EN ABYME — une image dans l\'image, écran/reflet/cadre montrant un autre univers',
      'POINT DE VUE INATTENDU — vu depuis l\'intérieur d\'un objet, à travers une vitrine, depuis le sol, depuis le plafond',
      'SÉRIE/RÉPÉTITION — motif répétitif d\'objets du business créant un pattern graphique puissant',
      'SPLIT SCREEN NATUREL — la scène naturellement divisée en deux par un élément (porte, mur, ombre, route)',
      'MOUVEMENT FIGÉ — action en cours capturée à l\'instant parfait, dynamisme gelé',
      'MINIMALISME — un seul objet emblématique du business isolé dans un espace vide ou coloré',
      'STORYTELLING SÉQUENTIEL — la scène raconte une micro-histoire visible en un regard (avant/après, cause/effet)',
      'IMMERSION — vue subjective comme si le spectateur était dans la scène, first person',
      'ÉCHELLE DÉCALÉE — jouer sur les proportions, objet miniature ou géant dans un contexte réel',
      'SYMÉTRIE BRISÉE — composition symétrique avec un seul élément qui casse l\'équilibre',
      'TEXTURE HERO — gros plan extrême sur la matière, le grain, la surface qui raconte tout',
      'LUMIÈRE NARRATIVE — la lumière elle-même raconte l\'histoire (rayon, ombre portée, néon, bougie)',
      'ENVIRONNEMENT VIVANT — le décor/lieu est le personnage principal, il respire l\'identité du business',
    ];
    const randomAngle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
    const randomMood = MOODS[Math.floor(Math.random() * MOODS.length)];
    const randomStrategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
    const randomVisualConcept = VISUAL_CONCEPTS[Math.floor(Math.random() * VISUAL_CONCEPTS.length)];

    const prompt = `Tu es un DIRECTEUR CRÉATIF de campagnes social media. Chaque réponse doit être UNIQUE, CRÉATIVE et SURPRENANTE — JAMAIS de clichés marketing, JAMAIS la même chose deux fois.

DIRECTION CRÉATIVE IMPOSÉE (tu DOIS l'appliquer):
- Cadrage: ${randomAngle}
- Ambiance: ${randomMood}
- Stratégie: ${randomStrategy}
- Concept visuel: ${randomVisualConcept}

CONTEXTE:
- Business: "${businessType}"${businessDescription ? ` — ${businessDescription}` : ''}
- ${newsContext}
- Communication: ${communicationProfile || 'inspirant'}
${targetAudience ? `- Cible: ${targetAudience}` : ''}
- Orientation: ${contentFocus <= 30 ? 'BUSINESS-DOMINANT — le business est le héros, l\'actu est un contexte subtil' : contentFocus >= 70 ? 'ACTUALITÉ-DOMINANTE — l\'actu est au premier plan, le business est participant' : 'ÉQUILIBRÉE — poids égal entre business et actualité'} (${100 - contentFocus}% business, ${contentFocus}% actualité)

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
  "desiredVisualIdea": "[3-4 phrases] CONCEPT VISUEL UNIQUE pour "${businessType}" — Applique OBLIGATOIREMENT le concept visuel imposé (${randomVisualConcept.split(' — ')[0]}). ${contentFocus <= 30 ? `Le BUSINESS est le HÉROS: montre les produits/outils/espace de "${businessType}" en gros plan, en action, avec des détails SPÉCIFIQUES à ce métier. L'actu n'est qu'un subtil indice en arrière-plan (un détail, une couleur, un objet évocateur).` : contentFocus >= 70 ? `L'ACTUALITÉ est le HÉROS: plonge dans la scène de l'actu (lieu, ambiance, personnages, objets concrets de l'événement). "${businessType}" apparaît comme un élément intégré dans cette scène (un produit posé là, un outil en cours d'utilisation, un détail de la marque).` : `FUSION business+actu: crée une scène où on ne peut pas séparer "${businessType}" de l'actualité — ils sont imbriqués dans une composition unifiée.`} DÉCRIS: objets EXACTS, couleurs dominantes, lumière, cadrage, action en cours. ZÉRO texte/mot/panneau visible."
}

RÈGLES ABSOLUES:
- NE copie PAS d'exemples précédents — invente du NEUF à chaque fois
- CHAQUE champ doit refléter la direction créative ET le concept visuel imposés ci-dessus
- desiredVisualIdea est le champ LE PLUS IMPORTANT — il doit être CINÉMATOGRAPHIQUE, PRÉCIS et UNIQUE
- desiredVisualIdea: ZÉRO texte visible, ZÉRO description vague ("belle image", "éclairage cinématique", "ambiance chaleureuse", "composition harmonieuse")
- desiredVisualIdea: cite des OBJETS CONCRETS du métier "${businessType}" (outils, produits, matériaux, gestes spécifiques)
- ${hasNews ? 'NE CONFONDS PAS le contexte de l\'actu (pays, sport, personnes). CITE des éléments VISUELS CONCRETS de l\'actu.' : 'Sois HYPER-SPÉCIFIQUE au business, pas générique'}

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
