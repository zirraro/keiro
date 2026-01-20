import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Vérifier que la clé API Anthropic est configurée
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[Suggest] ANTHROPIC_API_KEY is not configured in environment variables');
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

/**
 * API Route: Suggérer du contenu Instagram avec IA
 * POST /api/instagram/suggest
 * Body: { imageTitle, newsTitle, newsCategory, userBusiness? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Vérifier l'authentification depuis les cookies
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // Récupérer les données de la requête
    const body = await request.json();
    const { imageTitle, newsTitle, newsCategory, userBusiness } = body;

    // Récupérer les informations du profil utilisateur (si disponible)
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_description, industry, target_audience')
      .eq('id', user.id)
      .single();

    // Construire le prompt pour Claude
    const businessContext = userBusiness || profile?.business_description || 'entreprise générale';
    const industry = profile?.industry || 'business général';
    const audience = profile?.target_audience || 'professionnels';

    const prompt = `Tu es un GROWTH HACKER Instagram spécialisé en contenu viral qui convertit.
Ta mission : créer des posts qui STOPPENT le scroll, CAPTENT l'attention et CONVERTISSENT en clics + likes.

CONTEXTE:
📸 Image: ${imageTitle || 'Non spécifié'}
📰 Actualité: ${newsTitle || 'Non spécifié'}
🏷️ Catégorie: ${newsCategory || 'Non spécifié'}
🎯 Business: ${businessContext} (${industry})
👥 Audience: ${audience}

MISSION 1 - DESCRIPTION QUI CONVERTIT:

✅ RÈGLES D'OR (IMPÉRATIF):
- 3 PREMIERS MOTS = HOOK MORTEL (question choc, affirmation provocante, chiffre brutal)
- Ton VARIÉ selon le contexte: ironique, satirique, provocateur, inspirant, urgent, confidentiel
- AUCUNE limite de ton : si ça capte l'attention proprement, GO
- Storytelling court mais INTENSE (créer tension → résolution)
- CTA IRRÉSISTIBLE en fin (clic bio, DM, like, partage)
- Max 2200 caractères mais viser 150-200 mots optimal
- Emojis STRATÉGIQUES (3-5 max, pas décoratif)
- Line breaks pour rythme et lisibilité

❌ INTERDIT:
- "Découvrez", "Profitez", "Ne manquez pas"
- Gentillesse corporate fade
- Description plate de l'actualité
- Hook faible qui n'arrête pas le scroll

🎯 APPROCHES À MIXER (selon contexte):
1. QUESTION CHOC → "Vous gaspillez 40% de votre budget ?"
2. AFFIRMATION PROVOCANTE → "Le marketing traditionnel est mort."
3. CHIFFRE BRUTAL → "97% des entrepreneurs échouent car..."
4. STORY PERSONNELLE → "J'ai perdu 50K€ avant de comprendre..."
5. IRONIE/SATIRE → "Ah oui, l'inflation n'existe pas 🙃"
6. URGENCE → "Dans 48h il sera trop tard."
7. EXCLUSIVITÉ → "Ce que personne ne vous dit sur..."
8. CALL-OUT → "Si tu lis ça, c'est que..."

MISSION 2 - HASHTAGS STRATÉGIQUES:

Génère 15-20 hashtags MIX:
- 3-5 GROS (100K-1M posts) → Visibilité max
- 5-8 MOYENS (10K-100K) → Taux engagement optimal
- 5-7 NICHE (<10K) → Audience ultra-qualifiée
- Mix FR + EN si pertinent
- Liés à l'actu + secteur + émotion du post
- Ordre décroissant de pertinence

FORMAT JSON UNIQUEMENT (pas de markdown):
{
  "caption": "HOOK MORTEL + description intense + CTA irrésistible",
  "hashtags": ["#tag1", "#tag2", ...]
}`;

    // Appeler Claude API
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    // Extraire la réponse
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parser la réponse JSON
    let suggestion;
    try {
      // Nettoyer la réponse si elle contient des backticks markdown
      const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      suggestion = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('[Suggest] Failed to parse AI response:', responseText);
      return NextResponse.json(
        { ok: false, error: 'Erreur lors du parsing de la réponse IA' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      caption: suggestion.caption,
      hashtags: suggestion.hashtags
    });

  } catch (error: any) {
    console.error('[Suggest] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
