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

    const prompt = `Tu es un expert en marketing Instagram. Génère une description Instagram engageante et des hashtags pertinents.

Contexte de l'image :
- Titre de l'image : ${imageTitle || 'Non spécifié'}
- Actualité liée : ${newsTitle || 'Non spécifié'}
- Catégorie : ${newsCategory || 'Non spécifié'}

Contexte business :
- Secteur : ${industry}
- Description : ${businessContext}
- Audience cible : ${audience}

Instructions :
1. Crée une description Instagram captivante (2-3 phrases) qui :
   - Accroche l'attention dans les premiers mots
   - Lie l'actualité au business de l'utilisateur
   - Inclut un appel à l'action subtil
   - Est professionnelle mais accessible
   - Maximum 150 mots

2. Propose 10-15 hashtags pertinents qui :
   - Mélangent hashtags populaires et de niche
   - Sont adaptés au secteur et à l'actualité
   - Incluent des hashtags français et anglais si pertinent
   - Sont classés par pertinence

Réponds UNIQUEMENT au format JSON suivant (sans markdown) :
{
  "caption": "La description ici",
  "hashtags": ["#hashtag1", "#hashtag2", ...]
}`;

    // Appeler Claude API
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
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
