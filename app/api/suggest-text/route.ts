import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

/**
 * API Route pour générer des suggestions de texte IA via Claude
 * Génère 5 propositions expertes basées sur l'actualité + business
 */
export async function POST(req: NextRequest) {
  try {
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

    // Construire le prompt expert ULTRA-ULTRA-ciblé avec analyse approfondie
    const prompt = `Tu es un EXPERT STRATÈGE en communication Instagram spécialisé dans les textes overlay viraux.
Ta spécialité : créer des accroches ultra-ciblées qui mixent PARFAITEMENT actualité + business pour maximiser l'engagement.

ANALYSE DU CONTEXTE:

📰 ACTUALITÉ PRÉCISE:
Titre: "${newsTitle}"
${newsDescription ? `Détails: ${newsDescription}` : ''}

🏢 BUSINESS CLIENT:
Type: ${businessType}
${businessDescription ? `Description: ${businessDescription}` : ''}
${targetAudience ? `Audience cible: ${targetAudience}` : ''}
Ton général: ${tone || 'Inspirant et engageant'}

🎯 ÉTAPE 1 : ANALYSE STRATÉGIQUE (fais-la mentalement, ne l'écris pas)

Avant de générer, ANALYSE :
1. Quel est le LIEN CONCRET entre "${newsTitle.substring(0, 40)}..." et "${businessType}" ?
2. Quelle OPPORTUNITÉ ou PROBLÈME cette actu crée-t-elle pour ce business ?
3. Quelle est la PROPOSITION DE VALEUR unique que ce business peut offrir face à cette actu ?
4. Quel BÉNÉFICE TANGIBLE le client final peut-il tirer de ce business dans le contexte de cette actu ?

🎯 ÉTAPE 2 : GÉNÉRATION DES 5 TEXTES

Créer 5 TEXTES COURTS (max 45 caractères) pour overlay sur image Instagram.
Chaque texte doit :
1. CONNECTER EXPLICITEMENT "${newsTitle.substring(0, 30)}..." avec "${businessType}"
2. Montrer une VALEUR CONCRÈTE ou un BÉNÉFICE TANGIBLE MESURABLE
3. Utiliser un TON et une APPROCHE DIFFÉRENTS
4. Être VIRAL : percutant, mémorable, partageable

📋 LES 5 APPROCHES OBLIGATOIRES (une par suggestion):

1️⃣ APPROCHE STATISTIQUE/CHIFFRES + EMOJI
→ Chiffres, %, €, temps gagné, économies + emoji pertinent
→ Ex: "IA = -50% temps compta 📊" | "Prix fixes 12 mois 🔒"
→ Impact MESURABLE, emoji qui RENFORCE le message

2️⃣ APPROCHE QUESTION PROVOCANTE + EMOJI
→ Question qui CHOQUE ou INTERPELLE + emoji d'alerte
→ Ex: "Inflation = faillite ? 😰" | "ChatGPT te remplace ? 🤖"
→ CURIOSITÉ maximale, emoji qui amplifie l'émotion

3️⃣ APPROCHE SOLUTION/CTA + EMOJI
→ Problème → Solution claire + emoji de réussite
→ Ex: "Hausse prix ? On bloque tout ! 🛡️" | "Cyberattaque ? Protégé 24h ✅"
→ TON business = LA réponse, emoji de confiance

4️⃣ APPROCHE ÉMOTIONNELLE/INSPIRANTE + EMOJI
→ Aspiration, transformation, espoir + emoji rêve
→ Ex: "Ton futur commence ici ✨" | "Libère ton potentiel 🚀"
→ CONNEXION émotionnelle forte, emoji aspirationnel

5️⃣ APPROCHE URGENCE/FOMO + EMOJI
→ Temps limité, exclusivité, rareté + emoji temps/feu
→ Ex: "Derniers jours -40% ⏰" | "Offre spéciale actu 🔥"
→ ACTION IMMÉDIATE, emoji d'urgence visuelle

⚠️ RÈGLES CRITIQUES:

✅ OBLIGATOIRE (sinon = ÉCHEC):
- Maximum 45 caractères TOTAL (avec emojis)
- Lien ULTRA-EXPLICITE : l'actu "${newsTitle.substring(0, 25)}..." + "${businessType}" = ÉVIDENT
- Vocabulaire SPÉCIFIQUE du secteur (termes métier)
- 5 tons DIFFÉRENTS (stat, question, CTA, émotion, urgence)
- Valeur MESURABLE ou TANGIBLE (pas vague!)
- 1 emoji STRATÉGIQUE par texte (renforce le message)
- Format Instagram : percutant, visuel, viral

❌ INTERDIT (= INACCEPTABLE):
- Clichés marketing : "Découvrez", "Profitez", "Saisissez", "Ne manquez pas"
- Textes génériques (qui marchent pour tout business)
- Lien VAGUE avec l'actu (trop abstrait, trop étiré)
- Répétition du même ton ou du même emoji
- Formulations plates, ennuyeuses, corporate
- Questions rhétoriques sans punch

📐 EXEMPLES ULTRA-CIBLÉS PAR SECTEUR:

💡 EXEMPLE 1
Actu: "Inflation record 5.2%"
Business: "Restaurant bio local"

1️⃣ Stat: "Menu 15€ garanti 1 an 🔒"
2️⃣ Question: "Inflation = renoncer au bio ? 🤔"
3️⃣ CTA: "Prix bloqués, qualité intacte ✅"
4️⃣ Émotion: "Le bonheur se mange ici ❤️"
5️⃣ Urgence: "-20% avant hausse tarifs ⏰"

💡 EXEMPLE 2
Actu: "IA ChatGPT explose, 100M utilisateurs"
Business: "Formation professionnelle digitale"

1️⃣ Stat: "Maîtrise IA = +35% salaire 📈"
2️⃣ Question: "Ton job existe encore en 2030 ? 🤖"
3️⃣ CTA: "Certifié IA en 30 jours 🎓"
4️⃣ Émotion: "Deviens expert IA dès demain ⚡"
5️⃣ Urgence: "Dernières places formation IA 🔥"

💡 EXEMPLE 3
Actu: "Nouveau CPF 2025 : 500€ de crédit"
Business: "École de code web"

1️⃣ Stat: "500€ CPF = formation gratuite 💰"
2️⃣ Question: "Gaspiller ton CPF ou changer de vie ? 💻"
3️⃣ CTA: "CPF accepté, reste 0€ à payer ✅"
4️⃣ Émotion: "Code ton futur, c'est maintenant ✨"
5️⃣ Urgence: "CPF 2025 : places limitées ⏳"

💡 EXEMPLE 4
Actu: "Canicule record : 42°C en France"
Business: "Climatisation écologique"

1️⃣ Stat: "Clim éco = -60% conso élec 🌱"
2️⃣ Question: "Canicule = souffrir ou polluer ? 🥵"
3️⃣ CTA: "Fraîcheur garantie 0% culpabilité 🍃"
4️⃣ Émotion: "Respire frais, dors tranquille 😌"
5️⃣ Urgence: "Installé sous 48h avant prochaine vague 🔥"

⚡ CONSIGNES FINALES ULTRA-IMPORTANTES:

1. RÉFLÉCHIS d'abord au lien CONCRET entre l'actu et ce business SPÉCIFIQUE
2. Trouve l'ANGLE UNIQUE qui fait que ce business est LA solution face à cette actu
3. GÉNÈRE 5 textes qui montrent ce lien de façon CLAIRE et PERCUTANTE
4. Chaque texte = approche DIFFÉRENTE (stat, question, CTA, émotion, urgence)
5. Utilise 1 emoji STRATÉGIQUE par texte (qui renforce le message, pas décoratif)
6. Max 45 caractères TOTAL (emojis inclus)
7. ÉVITE les formules bateau, sois CRÉATIF et SPÉCIFIQUE

🎯 Objectif final : Quand quelqu'un lit un de tes textes sur Instagram, il doit IMMÉDIATEMENT comprendre :
- De quelle actu on parle
- Ce que fait ce business
- Pourquoi ce business est la solution/opportunité face à cette actu

GÉNÈRE maintenant 5 propositions EN FRANÇAIS pour :
Actu: "${newsTitle}"
Business: "${businessType}"

FORMAT DE RÉPONSE:
JSON array uniquement, rien d'autre. Pas de texte avant ou après.
["Texte 1", "Texte 2", "Texte 3", "Texte 4", "Texte 5"]`;

    const message = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 2048, // Augmenté pour permettre une meilleure analyse
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
      .slice(0, 5);

    console.log('[SuggestText] ✅ Generated', suggestions.length, 'suggestions');

    return NextResponse.json({
      ok: true,
      suggestions
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
