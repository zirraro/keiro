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

    const prompt = `Tu es un expert Instagram en contenu viral. Crée un post qui STOPPE le scroll et CONVERTIT.

📋 CONTEXTE:
Image: ${imageTitle || newsTitle}
Actualité: ${newsTitle}
Catégorie: ${newsCategory || 'Business'}
Business: ${businessContext} (${industry})
Audience: ${audience}

🎯 MISSION 1 - CAPTION INSTAGRAM:

HOOK (3 premiers mots):
✅ Question choc: "Vous perdez combien ?"
✅ Affirmation provocante: "Le marketing est mort."
✅ Chiffre brutal: "97% des entrepreneurs échouent..."
✅ Urgence: "Plus que 48h..."
❌ Éviter: "Découvrez", "Profitez", formules fades

STRUCTURE:
1. HOOK mortel (3 mots)
2. CORPS: 100-200 mots, storytelling intense
3. CTA puissant (bio, DM, like, partage)
4. 3-5 emojis stratégiques
5. Line breaks pour lisibilité

TONALITÉ: Ironique, provocateur, inspirant, urgent (selon contexte)
MAX: 2200 caractères

EXEMPLES:
❌ "Découvrez notre solution innovante pour votre business..."
✅ "Vous brûlez 40% de votre budget. Chaque. Jour. 💸

Pendant que vos concurrents testent, analysent, optimisent... vous payez pour du vent.

J'ai perdu 50K€ avant de comprendre ça:
[développe avec tension puis résolution]

Lien en bio → On vous montre les vrais chiffres."

🏷️ MISSION 2 - HASHTAGS (15-20):

MIX STRATÉGIQUE:
- 3-5 GROS (100K-1M posts): visibilité
- 5-8 MOYENS (10K-100K): engagement
- 5-7 NICHE (<10K): audience qualifiée
- FR + EN si pertinent
- Liés à: actualité + secteur + émotion

📤 FORMAT (JSON pur, pas de markdown):
{
  "caption": "HOOK + corps + CTA",
  "hashtags": ["#tag1", "#tag2", "#tag3", ...]
}

Génère maintenant le post parfait pour ce contexte.`;

    // Appeler Claude API
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1536, // Augmenté pour des descriptions plus riches et détaillées
      temperature: 0.9, // Créativité élevée tout en gardant cohérence
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
