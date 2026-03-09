import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';

export const runtime = 'edge';

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
    const { newsTitle, newsDescription, newsSource, newsCategory, businessType, businessDescription, communicationProfile, targetAudience, contentFocus = 50 } = body;

    if (!businessType) {
      return NextResponse.json({ ok: false, error: 'Business type requis' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const hasNews = newsTitle && newsTitle.trim();
    const isTrend = newsCategory === 'Tendance' || newsCategory === 'Business' || (newsSource && /Trends|TikTok Trends|Instagram Trends|LinkedIn Trends|Google Trends/.test(newsSource));

    // Dimensions créatives aléatoires pour forcer la variété
    const ANGLES = [
      'MACRO — gros plan extrême sur un détail, textures visibles, bokeh',
      'PANORAMA — plan large, contexte environnemental, ambiance globale',
      'ACTION — mouvement figé, dynamisme, énergie brute',
      'PORTRAIT — focus sur une personne, expressions, regard caméra',
      'FLAT LAY — vue du dessus, composition graphique, objets arrangés',
      'COULISSES — en backstage, processus de fabrication, envers du décor',
      'CONTRASTE — opposition visuelle, lumière/ombre, ancien/nouveau',
      'CINÉMATIQUE — cadrage de film, profondeur de champ, storytelling visuel',
      'DOCUMENTAIRE — pris sur le vif, authenticité, moment volé',
      'INTIME — très proche, détail, chaleur humaine, proximité',
    ];
    const MOODS = [
      'Golden hour — lumière dorée, ombres longues',
      'Blue hour — teintes bleues, crépuscule, néons',
      'Clair-obscur — contrastes forts, dramatique',
      'Nuit — néons, reflets, lumières artificielles',
      'Soleil cru — ombres dures, couleurs saturées',
      'Pastel — doux, aérien, lumineux',
      'Industriel — brut, béton, métal, vapeur',
      'Tropical — couleurs vives, luxuriant, exotique',
    ];
    const STRATEGIES = [
      'HUMOUR — décalage, clin d\'oeil, ironie douce',
      'ÉMOTION — toucher au coeur, empathie, nostalgie',
      'PROVOCATION — interpeller, bousculer, surprendre',
      'ASPIRATION — faire rêver, inspirer, projeter',
      'ÉDUCATION — apprendre, révéler, décrypter',
      'AUTHENTICITÉ — coulisses, vérité, sans filtre',
      'COMMUNAUTÉ — ensemble, partage, appartenance',
    ];
    const NEWSJACKING_TYPES = [
      'DÉTOURNEMENT — reprendre un élément iconique de l\'actu et le transformer avec les codes du business',
      'RÉACTION — le business réagit "en direct" à l\'actu, comme un commentaire visuel',
      'PARALLÈLE — montrer que le business vit la même chose que l\'actu (même défi, même émotion, même dynamique)',
      'SOLUTION — le business apporte SA réponse au problème soulevé par l\'actu',
      'CÉLÉBRATION — le business fête/soutient ce que l\'actu annonce',
      'DÉCRYPTAGE — le business éclaire l\'actu avec son expertise métier',
    ];
    const randomAngle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
    const randomMood = MOODS[Math.floor(Math.random() * MOODS.length)];
    const randomStrategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
    const randomNewsjacking = NEWSJACKING_TYPES[Math.floor(Math.random() * NEWSJACKING_TYPES.length)];

    // Orientation focus — plus granulaire
    let focusInstruction: string;
    if (contentFocus <= 20) {
      focusInstruction = 'BUSINESS TOTAL (95% business, 5% actu): Le visuel montre UNIQUEMENT le business en action. L\'actu est juste un PRÉTEXTE pour le texte de la légende — elle n\'apparaît PAS visuellement.';
    } else if (contentFocus <= 40) {
      focusInstruction = 'BUSINESS DOMINANT (70% business, 30% actu): Le business occupe le premier plan. L\'actu est présente via UN DÉTAIL visuel (couleur, objet, ambiance) qui fait écho sans dominer.';
    } else if (contentFocus <= 60) {
      focusInstruction = 'FUSION ÉQUILIBRÉE (50/50): Business et actualité sont IMBRIQUÉS dans une seule scène. Les objets du métier côtoient les symboles de l\'actu. Impossible de séparer les deux mondes.';
    } else if (contentFocus <= 80) {
      focusInstruction = 'ACTUALITÉ DOMINANTE (30% business, 70% actu): L\'ACTUALITÉ est le SUJET PRINCIPAL du visuel. La scène ILLUSTRE l\'actu (ses acteurs, son contexte, son impact). Le business apparaît comme UN ÉLÉMENT dans cette scène — un produit posé là, un outil visible, un artisan qui participe.';
    } else {
      focusInstruction = 'ACTUALITÉ TOTALE (5% business, 95% actu): Le visuel est une ILLUSTRATION DIRECTE de l\'actualité. Le business n\'est qu\'un CLIN D\'OEIL discret (un logo, une touche de couleur, un objet du métier en arrière-plan).';
    }

    let prompt: string;

    if (hasNews) {
      // ===== MODE AVEC ACTUALITÉ OU TENDANCE =====
      const trendOrNewsLabel = isTrend ? 'TENDANCE' : 'ACTUALITÉ';
      const trendExtraContext = isTrend ? `

⚠️ IMPORTANT: "${newsTitle}" est une TENDANCE virale des réseaux sociaux (pas une actualité classique).
Tu dois donc:
1. COMPRENDRE ce que cette tendance représente (format vidéo, défi, hashtag, mème, mouvement culturel)
2. IMAGINER comment "${businessType}" peut PARTICIPER à cette tendance de façon authentique
3. ADAPTER le format au réseau d'origine (${newsSource || 'réseau social'}): vidéo courte, transition, before/after, POV, etc.
4. Le contenu doit donner l'impression que "${businessType}" SURFE naturellement sur la tendance, pas qu'il force le lien
5. Pense VIRAL: comment ce business peut-il reprendre cette tendance pour que ça BUZZ ?` : '';

      prompt = `Tu es un EXPERT EN ${isTrend ? 'TREND SURFING' : 'NEWSJACKING'} pour les réseaux sociaux. Ta spécialité: créer des visuels qui SURFENT sur ${isTrend ? 'les tendances virales' : "l'actualité"} pour propulser un business.

${isTrend
  ? `Le TREND SURFING c'est quoi: reprendre une tendance virale (format, hashtag, défi, mème) et l'adapter au métier du client de manière AUTHENTIQUE. Le public doit se dire "C'est trop bien fait, ils ont parfaitement compris la trend !" Le contenu doit être PARTAGEABLE et donner envie de recréer le même format.`
  : `Le NEWSJACKING c'est quoi: prendre une actualité qui fait parler, et montrer comment elle RÉSONNE avec le métier du client. Le public doit se dire "Ah c'est malin, je n'y avais pas pensé !" Le visuel doit être PARTAGEABLE — les gens le partagent parce que le lien actu-business est BRILLANT.`}
${trendExtraContext}

═══════════════════════════════════
${trendOrNewsLabel} DU JOUR:
═══════════════════════════════════
Titre: "${newsTitle}"
${newsDescription ? `Contexte complet: ${newsDescription.substring(0, 800)}` : ''}
${newsSource ? `Source: ${newsSource}` : ''}
${newsCategory ? `Catégorie: ${newsCategory}` : ''}

═══════════════════════════════════
BUSINESS À CONNECTER:
═══════════════════════════════════
Métier: "${businessType}"
${businessDescription ? `Détails: ${businessDescription}` : ''}
Style de communication: ${communicationProfile || 'inspirant'}
${targetAudience ? `Audience cible: ${targetAudience}` : ''}

═══════════════════════════════════
CURSEUR ACTU/BUSINESS: ${focusInstruction}
═══════════════════════════════════

TYPE DE NEWSJACKING À APPLIQUER: ${randomNewsjacking}
CADRAGE: ${randomAngle}
AMBIANCE: ${randomMood}
STRATÉGIE: ${randomStrategy}

${isTrend ? `ÉTAPE 1 — DÉCORTIQUE LA TENDANCE (dans ta tête):
• C'EST QUOI: Quel est le FORMAT exact de cette trend (défi, transition, POV, before/after, lip sync, danse, mème) ?
• POURQUOI ÇA MARCHE: Qu'est-ce qui rend cette trend virale (humour, surprise, satisfaction, émotion, relatabilité) ?
• LES CODES: Quels sont les éléments OBLIGATOIRES pour que le public RECONNAISSE la trend (musique, geste, format, caption) ?
• L'AUDIENCE: Qui participe à cette trend et pourquoi (créateurs, marques, particuliers) ?
• COMMENT L'ADAPTER: Comment un business peut reprendre ce format tout en restant AUTHENTIQUE ?` : `ÉTAPE 1 — DÉCORTIQUE L'ACTU (dans ta tête):
• QUI: Les acteurs précis (noms, entreprises, personnalités, équipes)
• QUOI: L'événement exact — pas une interprétation, les FAITS
• OÙ/QUAND: Le lieu, la date, le contexte temporel
• POURQUOI ÇA BUZZE: Pourquoi les gens en parlent — l'émotion collective (surprise, indignation, fierté, espoir, inquiétude)
• LES SYMBOLES: Quels objets, lieux, gestes, couleurs SYMBOLISENT cette actu dans l'imaginaire collectif`}

${isTrend ? `ÉTAPE 2 — ADAPTE LA TREND AU BUSINESS (dans ta tête):
• Quel GESTE ou MOMENT du métier "${businessType}" peut être mis en scène DANS LE FORMAT de cette trend ?
• Comment reprendre les CODES de la trend (transition, reveal, before/after) avec les OUTILS/PRODUITS de ${businessType} ?
• Quel serait le "plot twist" ou le "reveal" le plus SATISFAISANT pour montrer le savoir-faire de ${businessType} ?
• Comment rendre ça DRÔLE, IMPRESSIONNANT ou TOUCHANT — l'émotion qui fait que les gens PARTAGENT ?
• Si ${businessType} participait à cette trend, quelle serait la version la plus MÉMORABLE ?` : `ÉTAPE 2 — TROUVE LE PONT (dans ta tête):
• Quel GESTE du métier "${businessType}" fait ÉCHO à un geste/événement de l'actu ?
• Quel OBJET du métier peut SYMBOLISER ou DÉTOURNER un élément de l'actu ?
• Quelle VALEUR le business partage avec l'actu (précision, performance, créativité, résilience) ?
• Comment "${businessType}" VIVRAIT cette actu au quotidien — quel serait l'IMPACT sur son métier ?
• Si un professionnel de "${businessType}" voyait cette actu, quelle serait sa RÉACTION MÉTIER ?`}

ÉTAPE 3 — GÉNÈRE CE JSON:

{
  "imageAngle": "[1 phrase] LE PONT VISUEL entre l'actu et le business. PAS un cadrage générique mais LE moment où les deux mondes se croisent. Ex boulanger + victoire sportive: 'Un croissant doré posé sur une table aux couleurs du drapeau du pays champion, vu en macro avec la farine qui retombe comme des confettis'.",
  "marketingAngle": "[1 phrase] Le message NEWSJACKING — pourquoi le public de cette actu devrait s'intéresser à ${businessType} MAINTENANT. Le lien doit être MALIN, pas opportuniste.",
  "contentAngle": "[1 phrase] Le format éditorial qui exploite le lien: 'Notre réaction de [métier] à [actu]', 'Ce que [actu] et [métier] ont en commun', 'Si [actu] était un [produit/service du métier]'...",
  "storyToTell": "[2-3 phrases] Le RÉCIT NEWSJACKING. CITE des éléments PRÉCIS de l'actu (noms propres, chiffres, lieux). Raconte comment le business REBONDIT sur l'actu de manière NATURELLE et CRÉDIBLE. Le ton doit être celui d'un post social qui fait sourire ou réfléchir.",
  "publicationGoal": "[1 phrase] Objectif social media: 'Capter l'audience de [sujet de l'actu] vers ${businessType}' ou 'Devenir LE post de ${businessType} que les fans de [sujet] partagent'",
  "emotionToConvey": "[2-4 mots] L'émotion DU PONT actu-business — ex: 'fierté artisanale de champion', 'solidarité créative', 'ironie tendre du quotidien face au grandiose'",
  "problemSolved": "[1 phrase] Comment ${businessType} apporte une réponse CONCRÈTE et PERTINENTE dans le CONTEXTE de cette actu — pas un problème générique mais lié au sujet du moment",
  "uniqueAdvantage": "[1 phrase] Ce qui rend ${businessType} LÉGITIME pour parler de cette actu — le lien NATUREL entre le métier et le sujet",
  "desiredVisualIdea": "[5-6 phrases] CONCEPT VISUEL NEWSJACKING détaillé. ${focusInstruction} APPLIQUE le type: ${randomNewsjacking.split(' — ')[0]}. Tu DOIS inclure: (1) Les éléments visuels SPÉCIFIQUES de l'actu (les objets, couleurs, symboles que tout le monde associe à cette actu), (2) Les éléments visuels du métier ${businessType} (outils, produits, gestes RÉELS), (3) COMMENT ils coexistent dans la même image. Décris les COULEURS dominantes, la LUMIÈRE (${randomMood.split(' — ')[0]}), ce que font les PERSONNAGES s'il y en a. ZÉRO texte visible dans l'image. L'image seule doit faire comprendre le lien actu-business."
}

RÈGLES ABSOLUES:
${isTrend ? `- La TENDANCE doit être RECONNAISSABLE (le public doit comprendre DE QUELLE TREND il s'agit)
- L'adaptation par "${businessType}" doit être AUTHENTIQUE et NATURELLE (pas forcée)
- DÉCRIS le FORMAT de la trend dans storyToTell (comment la trend fonctionne + comment le business la reprend)
- desiredVisualIdea: Montre un MOMENT CLÉ de la trend adapté au business — le frame le plus IMPACTANT
- ZÉRO texte visible dans le visuel
- Pense comme un CM de marque qui veut que son contenu soit viral parce que l'adaptation de la trend est PARFAITE` : `- L'actualité doit être RECONNAISSABLE dans le visuel (le public doit comprendre DE QUELLE ACTU il s'agit en voyant l'image)
- Le lien avec "${businessType}" doit être INTELLIGENT et NATUREL (pas forcé)
- CITE des éléments CONCRETS de l'actu dans storyToTell (noms, lieux, chiffres)
- desiredVisualIdea: ${contentFocus >= 50 ? 'L\'ACTU DOIT ÊTRE VISUELLEMENT DOMINANTE — les symboles de l\'actu occupent le premier plan' : 'Le BUSINESS est au premier plan mais l\'actu est VISIBLE, pas juste suggérée'}
- ZÉRO texte visible dans le visuel
- Pense comme un CM de marque qui veut que son post soit PARTAGÉ parce que le lien actu-business est BRILLANT`}

Réponds UNIQUEMENT avec le JSON valide.`;
    } else {
      // ===== MODE SANS ACTUALITÉ =====
      prompt = `Tu es un DIRECTEUR CRÉATIF expert en social media. Tu crées des campagnes UNIQUES et PERSONNALISÉES pour chaque type de business.

BUSINESS DU CLIENT:
━━━━━━━━━━━━━━━━━━━━━
Type: "${businessType}"
${businessDescription ? `Description: ${businessDescription}` : ''}
Communication: ${communicationProfile || 'inspirant'}
${targetAudience ? `Cible: ${targetAudience}` : ''}
━━━━━━━━━━━━━━━━━━━━━

DIRECTION CRÉATIVE (applique-la):
- Cadrage: ${randomAngle}
- Ambiance: ${randomMood}
- Stratégie: ${randomStrategy}

PROCESSUS DE RÉFLEXION (dans ta tête):
1. Quels sont les PRODUITS/SERVICES concrets de "${businessType}" ?
2. Quels GESTES, OUTILS, OBJETS sont associés à ce métier ?
3. Quelle est l'EXPÉRIENCE CLIENT unique ?
4. Quel MOMENT FORT du quotidien de ce business mérite d'être montré ?

GÉNÈRE ce JSON avec 9 champs HYPER-SPÉCIFIQUES au métier "${businessType}":

{
  "imageAngle": "[1 phrase] Cadrage PRÉCIS avec des objets RÉELS du métier ${businessType}. PAS 'vue rapprochée' mais 'macro sur [outil spécifique] avec [matière spécifique] en arrière-plan flou'.",
  "marketingAngle": "[1 phrase] Angle SURPRENANT qui valorise ${businessType} sans cliché. Trouve ce que les CLIENTS ne voient JAMAIS.",
  "contentAngle": "[1 phrase] Format: coulisses du métier, défi technique, avant/après, savoir-faire caché, erreur courante que ${businessType} corrige, comparaison amateur vs pro...",
  "storyToTell": "[2-3 phrases] Récit CONCRET d'un moment QUOTIDIEN de ${businessType}. Détails sensoriels (sons, textures, odeurs). Le public doit RESSENTIR le métier.",
  "publicationGoal": "[1 phrase] Objectif PRÉCIS du post pour ${businessType}",
  "emotionToConvey": "[2-4 mots] Émotion liée au VÉCU de ${businessType}: 'satisfaction du geste parfait', 'émerveillement du client', 'fierté du détail invisible'...",
  "problemSolved": "[1 phrase] Problème CONCRET et QUOTIDIEN que ${businessType} résout pour ses clients (spécifique au métier)",
  "uniqueAdvantage": "[1 phrase] DÉTAIL PRÉCIS qui rend CE ${businessType} irremplaçable (technique, savoir-faire, philosophie)",
  "desiredVisualIdea": "[4-5 phrases] CONCEPT VISUEL pour "${businessType}". Montre le métier EN ACTION: les mains au travail, les outils spécifiques, les matières premières, l'espace de travail. DÉCRIS: objets EXACTS du métier, couleurs dominantes, lumière, geste en cours. ZÉRO texte visible."
}

RÈGLES:
- Chaque champ doit être ULTRA-SPÉCIFIQUE au métier "${businessType}" (cite des outils, gestes, produits RÉELS de CE métier)
- PAS de généralités marketing applicables à n'importe quel business
- SOIS CRÉATIF — le public doit découvrir un angle qu'il n'a JAMAIS vu
- desiredVisualIdea: OBJETS CONCRETS, ZÉRO texte visible, ZÉRO description vague

Réponds UNIQUEMENT avec le JSON valide.`;
    }

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      temperature: 0.9,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('[AutoFill] Claude response:', responseText.substring(0, 400));

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
      const result = await deductCredits(user.id, 'text_suggest', 'Auto-fill');
      newBalance = result.newBalance;
    }

    return NextResponse.json({ ok: true, fields, newBalance });

  } catch (error: any) {
    console.error('[AutoFill] Error:', error);
    return NextResponse.json({ ok: false, error: 'Erreur auto-fill' }, { status: 500 });
  }
}
