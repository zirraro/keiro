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

    // Construire le prompt expert ultra-ciblé avec TONS VARIÉS
    const prompt = `Tu es un expert stratège en communication Instagram et réseaux sociaux, spécialisé dans la création de textes overlay percutants qui génèrent de l'engagement.

ANALYSE DU CONTEXTE:

📰 ACTUALITÉ PRÉCISE:
Titre: "${newsTitle}"
${newsDescription ? `Détails: ${newsDescription}` : ''}

🏢 BUSINESS CLIENT:
Type: ${businessType}
${businessDescription ? `Description: ${businessDescription}` : ''}
${targetAudience ? `Audience cible: ${targetAudience}` : ''}
Ton général: ${tone || 'Inspirant et engageant'}

🎯 MISSION ULTRA-CIBLÉE:

Tu dois créer 5 TEXTES COURTS (max 45 caractères) pour overlay sur image Instagram.
Chaque texte doit :
1. CONNECTER explicitement CETTE actualité spécifique avec CE business précis
2. Montrer une VALEUR CONCRÈTE ou un BÉNÉFICE TANGIBLE
3. Utiliser un TON et une APPROCHE DIFFÉRENTS à chaque fois

📋 LES 5 APPROCHES OBLIGATOIRES (une par suggestion):

1️⃣ APPROCHE STATISTIQUE/CHIFFRES
→ Utilise des chiffres, %, €, temps gagné, économies
→ Ex: "IA = -50% temps compta" | "Prix fixes 12 mois"
→ Montre un impact MESURABLE et CONCRET

2️⃣ APPROCHE QUESTION PROVOCANTE
→ Pose UNE question qui connecte l'actu au besoin du client
→ Ex: "Inflation = faillite ?" | "ChatGPT va remplacer ton job ?"
→ Crée de la CURIOSITÉ et du DÉBAT

3️⃣ APPROCHE SOLUTION/CTA DIRECTE
→ Formule claire : Problème → Solution
→ Ex: "Hausse prix ? Nous on bloque !" | "Cyber-attaque ? Protégé en 24h"
→ Montre TON business comme LA réponse immédiate

4️⃣ APPROCHE ÉMOTIONNELLE/INSPIRANTE
→ Joue sur l'aspiration, la transformation, l'espoir
→ Ex: "Ton futur commence ici" | "Libère ton potentiel"
→ Crée de la CONNEXION émotionnelle

5️⃣ APPROCHE URGENCE/OPPORTUNITÉ
→ FOMO, temps limité, exclusivité, opportunité rare
→ Ex: "Derniers jours -40%" | "Offre spéciale actu"
→ Pousse à l'ACTION IMMÉDIATE

⚠️ RÈGLES CRITIQUES:

✅ OBLIGATOIRE:
- Maximum 45 caractères (lisibilité mobile)
- Lien EXPLICITE entre l'actu "${newsTitle.substring(0, 30)}..." et "${businessType}"
- Vocabulaire du SECTEUR (pas générique!)
- Chaque suggestion = TON DIFFÉRENT (statistique, question, CTA, émotionnel, urgence)
- Proposition de valeur ULTRA-CONCRÈTE

❌ INTERDIT:
- "Découvrez", "Profitez", "Saisissez" (clichés marketing)
- Textes qui marcheraient pour N'IMPORTE quel business
- Lien vague ou forcé avec l'actualité
- Répétition du même ton/approche

📐 EXEMPLES PAR APPROCHE:

Actu: "Inflation record 5.2%"
Business: "Restaurant"

1️⃣ Stat: "Menu 15€ garanti 1 an 🔒"
2️⃣ Question: "Manger bon = ruiner son budget ?"
3️⃣ CTA: "Inflation ? Pas chez nous ! 🍽️"
4️⃣ Émotion: "Le bonheur se mange ici ❤️"
5️⃣ Urgence: "-20% avant hausse tarifs ⏰"

Actu: "IA ChatGPT explose"
Business: "Formation professionnelle"

1️⃣ Stat: "IA = +35% productivité 📈"
2️⃣ Question: "Ton job existe encore en 2030 ?"
3️⃣ CTA: "Maîtrise l'IA avant qu'elle te remplace"
4️⃣ Émotion: "Deviens expert IA dès demain ⚡"
5️⃣ Urgence: "Formation IA complète ce mois 🔥"

GÉNÈRE 5 propositions EN FRANÇAIS qui suivent CES APPROCHES EXACTES.
Chaque texte = lien ULTRA-PRÉCIS entre "${newsTitle.substring(0, 40)}..." et "${businessType}".

FORMAT DE RÉPONSE:
JSON array uniquement, rien d'autre.
["Texte 1", "Texte 2", "Texte 3", "Texte 4", "Texte 5"]`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
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
