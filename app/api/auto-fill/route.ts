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
    const { newsTitle, newsDescription, newsSource, newsCategory, businessType, businessDescription, communicationProfile, targetAudience, contentFocus = 50 } = body;

    if (!businessType) {
      return NextResponse.json({ ok: false, error: 'Business type requis' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const hasNews = newsTitle && newsTitle.trim();

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
    const VISUAL_CONCEPTS = [
      'JUXTAPOSITION — deux mondes qui se rencontrent dans le même cadre',
      'MÉTAPHORE VISUELLE — un objet du business détourné pour évoquer l\'actualité',
      'POINT DE VUE INATTENDU — vu depuis l\'intérieur d\'un objet, à travers une vitrine, depuis le sol',
      'MOUVEMENT FIGÉ — action en cours capturée à l\'instant parfait',
      'MINIMALISME — un seul objet emblématique isolé dans un espace vide ou coloré',
      'IMMERSION — vue subjective comme si le spectateur était dans la scène',
      'TEXTURE HERO — gros plan extrême sur la matière, le grain, la surface',
      'LUMIÈRE NARRATIVE — la lumière raconte l\'histoire (rayon, ombre portée, néon)',
      'ENVIRONNEMENT VIVANT — le décor est le personnage principal',
    ];
    const randomAngle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
    const randomMood = MOODS[Math.floor(Math.random() * MOODS.length)];
    const randomStrategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
    const randomVisualConcept = VISUAL_CONCEPTS[Math.floor(Math.random() * VISUAL_CONCEPTS.length)];

    // Orientation focus
    const focusLabel = contentFocus <= 30 ? 'BUSINESS-DOMINANT' : contentFocus >= 70 ? 'ACTUALITÉ-DOMINANTE' : 'ÉQUILIBRÉE';

    let prompt: string;

    if (hasNews) {
      // ===== MODE AVEC ACTUALITÉ =====
      prompt = `Tu es un DIRECTEUR CRÉATIF expert en social media et newsjacking. Tu crées des campagnes qui connectent INTELLIGEMMENT un business à l'actualité du jour.

ACTUALITÉ SÉLECTIONNÉE:
━━━━━━━━━━━━━━━━━━━━━
Titre: "${newsTitle}"
${newsDescription ? `Détails: ${newsDescription.substring(0, 500)}` : ''}
${newsSource ? `Source: ${newsSource}` : ''}
${newsCategory ? `Catégorie: ${newsCategory}` : ''}
━━━━━━━━━━━━━━━━━━━━━

BUSINESS DU CLIENT:
━━━━━━━━━━━━━━━━━━━━━
Type: "${businessType}"
${businessDescription ? `Description: ${businessDescription}` : ''}
Communication: ${communicationProfile || 'inspirant'}
${targetAudience ? `Cible: ${targetAudience}` : ''}
Orientation visuelle: ${focusLabel} (${100 - contentFocus}% business, ${contentFocus}% actualité)
━━━━━━━━━━━━━━━━━━━━━

DIRECTION CRÉATIVE (applique-la):
- Cadrage: ${randomAngle}
- Ambiance: ${randomMood}
- Stratégie: ${randomStrategy}
- Concept visuel: ${randomVisualConcept}

PROCESSUS DE RÉFLEXION (suis ces étapes DANS TA TÊTE avant de répondre):

1. ANALYSE L'ACTU EN PROFONDEUR:
   - Qui sont les ACTEURS (personnes, entreprises, pays, équipes) ?
   - Quel est l'ÉVÉNEMENT EXACT (pas une interprétation vague) ?
   - Où ça se passe ? Quand ?
   - Quel IMPACT sur la société/les gens au quotidien ?
   - Quelle ÉMOTION COLLECTIVE cette actu provoque ?

2. COMPRENDS LE BUSINESS "${businessType}" :
   - Quels sont ses PRODUITS/SERVICES concrets ?
   - Qui sont ses CLIENTS au quotidien ?
   - Quels GESTES, OUTILS, OBJETS sont associés à ce métier ?
   - Dans quel LIEU/ESPACE ce business opère ?

3. TROUVE LE PONT CRÉATIF:
   - Quel PARALLÈLE SURPRENANT entre l'actu et le business ?
   - Quelle VALEUR COMMUNE les relie (persévérance, innovation, tradition, précision...) ?
   - Comment le business peut-il RÉAGIR/REBONDIR sur cette actu de façon PERTINENTE ?
   - Le lien doit être INTELLIGENT, pas forcé ou superficiel

GÉNÈRE ce JSON avec 9 champs. CHAQUE champ doit démontrer que tu as COMPRIS l'actu et trouvé un VRAI lien avec "${businessType}":

{
  "imageAngle": "[1 phrase] Cadrage photo PRÉCIS et CONCRET. Exemple pour un boulanger + actu sportive: 'Gros plan sur des mains pétrissant une pâte en forme de ballon, farine qui vole comme de la neige de stade'. CITE des objets RÉELS du métier de ${businessType}.",
  "marketingAngle": "[1 phrase] Angle de communication qui EXPLOITE le lien entre l'actu et le business. PAS de cliché marketing vague. L'angle doit faire que le public se dise 'c'est malin, bien trouvé !'.",
  "contentAngle": "[1 phrase] Format éditorial PRÉCIS qui met en scène le lien actu-business: réaction en direct, défi inspiré de l'actu, comparaison inattendue, coulisses montrant l'impact, détournement humoristique...",
  "storyToTell": "[2-3 phrases] Le RÉCIT qui lie "${businessType}" à cette actu. CITE des éléments SPÉCIFIQUES de l'actu (noms, lieux, chiffres). Raconte COMMENT le business vit/réagit/s'inspire de cet événement. Le récit doit être CRÉDIBLE et TOUCHANT.",
  "publicationGoal": "[1 phrase] Objectif PRÉCIS: 'Que les fans de [sujet de l'actu] découvrent ${businessType}' ou 'Montrer que ${businessType} comprend l'actualité de ses clients'",
  "emotionToConvey": "[2-4 mots] Émotion COMPOSITE et PRÉCISE liée au croisement actu+business. PAS 'joie' ou 'fierté' seuls, mais 'fierté artisanale face au défi' ou 'solidarité gourmande'",
  "problemSolved": "[1 phrase] En quoi ${businessType} apporte une RÉPONSE CONCRÈTE au quotidien dans le CONTEXTE de cette actu (comment le service/produit aide les gens face à ce qui se passe)",
  "uniqueAdvantage": "[1 phrase] Ce qui rend ${businessType} PARTICULIÈREMENT PERTINENT dans le contexte de cette actualité. Le lien doit être INTELLIGENT et CRÉDIBLE.",
  "desiredVisualIdea": "[4-5 phrases] CONCEPT VISUEL CINÉMATOGRAPHIQUE. Applique le concept ${randomVisualConcept.split(' — ')[0]}. ${contentFocus <= 30 ? `BUSINESS AU PREMIER PLAN: Le métier "${businessType}" occupe 70% du cadre — ses outils, produits, gestes en action. L'actu transparaît à travers un DÉTAIL SUBTIL mais PARLANT (un objet évocateur, une couleur symbolique, un élément de décor qui fait écho).` : contentFocus >= 70 ? `ACTUALITÉ AU PREMIER PLAN: La scène ÉVOQUE l'actu (ambiance, objets, contexte). "${businessType}" s'y intègre NATURELLEMENT — un de ses produits posé là, un artisan qui observe/participe, un outil du métier au milieu de la scène de l'actu.` : `FUSION: Une scène unique où "${businessType}" et l'actu sont IMBRIQUÉS — impossible de les séparer.`} DÉCRIS: les OBJETS EXACTS (du métier ${businessType} ET de l'actu), les couleurs dominantes, la lumière, ce que font les personnages. ZÉRO texte visible dans l'image."
}

RÈGLES:
- CHAQUE champ doit prouver que tu as COMPRIS l'actu (cite des éléments concrets)
- CHAQUE champ doit montrer un VRAI LIEN avec "${businessType}" (pas un lien forcé)
- NE CONFONDS PAS les acteurs/lieux/événements de l'actu
- Sois CRÉATIF et SURPRENANT, pas générique
- desiredVisualIdea: OBJETS CONCRETS du métier "${businessType}", ZÉRO texte visible, ZÉRO description vague

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
- Concept visuel: ${randomVisualConcept}

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
  "desiredVisualIdea": "[4-5 phrases] CONCEPT VISUEL pour "${businessType}". Applique le concept ${randomVisualConcept.split(' — ')[0]}. Montre le métier EN ACTION: les mains au travail, les outils spécifiques, les matières premières, l'espace de travail. DÉCRIS: objets EXACTS du métier, couleurs dominantes, lumière, geste en cours. ZÉRO texte visible."
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
      max_tokens: 1500,
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
