import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[TikTok Suggest] ANTHROPIC_API_KEY not configured');
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

export async function POST(request: NextRequest) {
  try {
    console.log('[TikTok Suggest] Starting...');

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'API IA non configurée' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      console.error('[TikTok Suggest] Auth error:', authError);
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { imageUrl, imageTitle, newsTitle, newsCategory, contentAngle = 'viral' } = body;

    console.log('[TikTok Suggest] Image URL:', imageUrl);
    console.log('[TikTok Suggest] Content angle:', contentAngle);

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_type, business_description')
      .eq('id', user.id)
      .single();

    const business = profile?.business_description || profile?.business_type || 'entreprise';
    const title = imageTitle || newsTitle || 'contenu';
    const category = newsCategory || 'Business';

    // Définir le prompt selon l'angle choisi - OPTIMISÉ TIKTOK
    const angleInstructions = {
      viral: "Capte l'attention en 1 seconde. Utilise des hooks choquants, surprenants ou intrigants. Crée l'urgence de regarder jusqu'au bout.",
      fun: "Sois léger, relatable et amusant. Utilise l'humour du quotidien. Fais sourire ou rire. Reste accessible et authentique.",
      informatif: "Apprends quelque chose d'utile en 5 secondes. Info rapide, claire et mémorable. Partage des faits surprenants.",
      inspirant: "Motive et inspire. Parle de transformation, de possibilités. Crée de l'espoir et de l'ambition. Utilise des mots puissants.",
      educatif: "Enseigne quelque chose d'utile et applicable immédiatement. Exemples concrets. Format 'Saviez-vous que...' fonctionne bien."
    };

    const angleInstruction = angleInstructions[contentAngle as keyof typeof angleInstructions] || angleInstructions.viral;

    const prompt = `Tu es un expert TikTok spécialisé dans les vidéos virales. Ta mission : créer du contenu qui EXPLOSE sur TikTok et attire des clients vers ${business}.

🎯 OBJECTIF CRITIQUE:
Cette vidéo doit CAPTER L'ATTENTION en 0.5 secondes et RETENIR jusqu'à la fin.
Sur TikTok, les 3 premières secondes sont TOUT.

📊 CONTEXTE:
- Business: ${business}
- Sujet: ${title}
- Catégorie: ${category}
- ANGLE: ${contentAngle.toUpperCase()}
  ${angleInstruction}

🖼️ ANALYSE DE L'IMAGE:
1. Repère ce qui attire l'œil IMMÉDIATEMENT
2. Identifie le potentiel viral (surprise, émotion, intrigue)
3. Trouve le hook visuel le plus fort
4. Pense "scroll stopper" - qu'est-ce qui ferait arrêter le scroll ?

✍️ RÉDACTION:
Structure TikTok (vidéo de 5 secondes):
1. HOOK ULTRA-PUISSANT (ligne 1): Question choc, affirmation surprenante, ou promesse claire
   Exemples: "POV:", "Attends quoi?!", "Personne n'en parle mais...", "La VRAIE raison pour..."
2. BÉNÉFICE/RÉVÉLATION (ligne 2): Le "pourquoi" je devrais regarder
3. CTA SUBTIL (ligne 3): "Sauvegarde pour plus tard", "Partage à qui en a besoin", "Follow pour la suite"

RÈGLES D'OR TIKTOK:
- Première ligne = HOOK qui arrête le scroll instantanément
- Utilise le langage TikTok ("POV", "Storytime", "Wait for it", "Part 1/2")
- Parle comme si tu parlais à un ami (ton casual, direct)
- Crée la curiosité - donne envie de regarder jusqu'au bout
- Max 100-120 mots (lecture rapide)
- Emojis stratégiques mais pas trop (TikTok = moins formel qu'Instagram)
- Pense vertical (9:16) - le texte doit être lisible sur mobile

🏷️ HASHTAGS TIKTOK:
- TOUJOURS inclure: #fyp #pourtoi #viral
- Ajouter des hashtags de niche liés au contenu
- Mix de populaires (1M+ posts) et émergents (10k-100k)
- Hashtags français ET anglais (TikTok = international)
- Total: 8-12 hashtags max

Réponds UNIQUEMENT avec ce JSON (pas de \`\`\`, pas de markdown):
{
  "caption": "🔥 Hook viral qui arrête le scroll\\n\\n💡 Révélation/bénéfice en 1 ligne\\n\\n✨ CTA subtil avec emoji",
  "hashtags": ["#fyp", "#pourtoi", "#viral", "#trending", "#foryou", "#hashtag6", "#hashtag7", "#hashtag8", "#hashtag9", "#hashtag10"]
}`;

    console.log('[TikTok Suggest] Calling Claude Vision...');

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2000,
      temperature: 0.9, // Plus créatif pour TikTok
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
    console.log('[TikTok Suggest] Response:', text.substring(0, 200));

    let suggestion: { caption: string; hashtags: string[] };
    try {
      let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) cleaned = match[0];

      suggestion = JSON.parse(cleaned);

      if (!suggestion.caption) suggestion.caption = `${title}\n\n🔥 Découvrez notre contenu viral\n\n✨ Follow pour plus !`;
      if (!Array.isArray(suggestion.hashtags)) suggestion.hashtags = [];
      suggestion.hashtags = suggestion.hashtags.map((t: string) => t.startsWith('#') ? t : `#${t}`);

      // S'assurer que les hashtags essentiels TikTok sont présents
      const essentialTags = ['#fyp', '#pourtoi', '#viral'];
      essentialTags.forEach(tag => {
        if (!suggestion.hashtags.includes(tag)) {
          suggestion.hashtags.unshift(tag);
        }
      });

      console.log('[TikTok Suggest] Success!');

    } catch (e: any) {
      console.error('[TikTok Suggest] Parse error:', e.message);
      suggestion = {
        caption: `${title}\n\n🔥 Découvrez notre actualité sur ${category.toLowerCase()}\n\n💬 Commentez votre avis !\n\n✨ Follow pour plus de contenu !`,
        hashtags: ['#fyp', '#pourtoi', '#viral', '#trending', '#foryou', '#tiktok', '#france', `#${category.toLowerCase().replace(/\s+/g, '')}`]
      };
    }

    return NextResponse.json({
      ok: true,
      caption: suggestion.caption,
      hashtags: suggestion.hashtags
    });

  } catch (error: any) {
    console.error('[TikTok Suggest] Error:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
