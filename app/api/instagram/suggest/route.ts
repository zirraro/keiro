import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[Suggest] ANTHROPIC_API_KEY not configured');
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

export async function POST(request: NextRequest) {
  try {
    console.log('[Suggest] Starting...');

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'API IA non configurée' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      console.error('[Suggest] Auth error:', authError);
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { imageUrl, imageTitle, newsTitle, newsCategory, contentAngle = 'informatif' } = body;

    console.log('[Suggest] Image URL:', imageUrl);
    console.log('[Suggest] Content angle:', contentAngle);

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_type, business_description')
      .eq('id', user.id)
      .single();

    const business = profile?.business_description || profile?.business_type || 'entreprise';
    const title = imageTitle || newsTitle || 'contenu';
    const category = newsCategory || 'Business';

    // Définir le prompt selon l'angle choisi
    const angleInstructions = {
      informatif: "Adopte un ton informatif et factuel. Présente des informations claires et vérifiables. Utilise des données si possible.",
      emotionnel: "Adopte un ton émotionnel et touchant. Crée une connexion personnelle avec l'audience. Parle aux émotions et sentiments.",
      inspirant: "Adopte un ton inspirant et motivant. Encourage l'action et le dépassement de soi. Utilise des messages positifs.",
      humoristique: "Adopte un ton humoristique et léger. Fais sourire ou rire. Utilise l'humour intelligent.",
      professionnel: "Adopte un ton professionnel et expert. Démontre ton expertise. Reste formel mais accessible.",
      storytelling: "Raconte une histoire captivante. Utilise une structure narrative avec début, milieu, fin. Crée du suspense.",
      educatif: "Adopte un ton éducatif et pédagogique. Enseigne quelque chose de concret. Rends l'apprentissage facile.",
      provocateur: "Adopte un ton provocateur et questionnant. Suscite le débat. Remets en question les idées reçues."
    };

    const angleInstruction = angleInstructions[contentAngle as keyof typeof angleInstructions] || angleInstructions.informatif;

    const prompt = `Tu es un expert en marketing Instagram. Analyse cette image et crée un post Instagram engageant.

CONTEXTE:
- Business: ${business}
- Titre: ${title}
- Catégorie: ${category}
- ANGLE DEMANDÉ: ${contentAngle.toUpperCase()}
  ${angleInstruction}

INSTRUCTIONS:
1. Analyse visuellement l'image fournie
2. Identifie les éléments clés, couleurs, émotions, message visuel
3. Crée une description qui CORRESPOND à ce que tu vois dans l'image
4. Utilise l'angle "${contentAngle}" pour le ton et le style
5. Rends le post viral et engageant pour Instagram

Réponds UNIQUEMENT avec ce JSON (pas de markdown, pas de \`\`\`):
{
  "caption": "Hook accrocheur basé sur l'image\\n\\nCorps du post (150-200 mots) qui décrit et complète l'image\\n\\nCTA avec emoji",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8", "#tag9", "#tag10"]
}`;

    console.log('[Suggest] Calling Claude Vision...');

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2000,
      temperature: 0.8,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'url',
              url: imageUrl
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }]
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('[Suggest] Response:', text.substring(0, 200));

    let suggestion;
    try {
      let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) cleaned = match[0];

      suggestion = JSON.parse(cleaned);

      if (!suggestion.caption) suggestion.caption = `${title}\n\nDécouvrez notre actualité.\n\n👉 En savoir plus !`;
      if (!Array.isArray(suggestion.hashtags)) suggestion.hashtags = [];
      suggestion.hashtags = suggestion.hashtags.map((t: string) => t.startsWith('#') ? t : `#${t}`);

      console.log('[Suggest] Success!');

    } catch (e: any) {
      console.error('[Suggest] Parse error:', e.message);
      suggestion = {
        caption: `${title}\n\n✨ Découvrez notre actualité sur ${category.toLowerCase()}.\n\n💭 Qu'en pensez-vous ?\n\n👉 Commentez !`,
        hashtags: ['#business', '#entreprise', '#inspiration', '#motivation', '#france', '#instagram', '#contenu', `#${category.toLowerCase().replace(/\s+/g, '')}`]
      };
    }

    return NextResponse.json({
      ok: true,
      caption: suggestion.caption,
      hashtags: suggestion.hashtags
    });

  } catch (error: any) {
    console.error('[Suggest] Error:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
