import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { getAuthUser } from '@/lib/auth-server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!process.env.OPENAI_API_KEY) {
  console.error('[TikTok Suggest] OPENAI_API_KEY not configured');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

export async function POST(request: NextRequest) {
  try {
    console.log('[TikTok Suggest] Starting...');

    if (!process.env.OPENAI_API_KEY) {
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
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { imageUrl, imageTitle, newsTitle, newsCategory, contentAngle = 'viral', audioUrl, audioScript } = body;

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

    // Ajouter contexte audio si disponible
    const audioContext = audioScript ? `\n\n🎙️ CONTEXTE AUDIO:\nUne narration audio accompagne cette vidéo avec le script suivant:\n"${audioScript}"\n\nTiens compte de ce script audio dans ta suggestion pour créer une cohérence entre l'audio et le texte.` : '';

    const prompt = `Tu es un expert TikTok spécialisé dans les vidéos virales. Ta mission : créer du contenu qui EXPLOSE sur TikTok et attire des clients vers ${business}.

🎯 OBJECTIF CRITIQUE:
Cette vidéo doit CAPTER L'ATTENTION en 0.5 secondes et RETENIR jusqu'à la fin.
Sur TikTok, les 3 premières secondes sont TOUT.

📊 CONTEXTE:
- Business: ${business}
- Sujet: ${title}
- Catégorie: ${category}
- ANGLE: ${contentAngle.toUpperCase()}
  ${angleInstruction}${audioContext}

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

    // Build message: with image if available, text-only otherwise
    const messageContent: any[] = [];
    if (imageUrl) {
      console.log('[TikTok Suggest] Calling GPT-4o Vision (with image)...');
      messageContent.push({ type: 'image_url', image_url: { url: imageUrl, detail: 'auto' } });
    } else {
      console.log('[TikTok Suggest] Calling GPT-4o (text-only, no thumbnail)...');
    }
    messageContent.push({ type: 'text', text: prompt });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      temperature: 0.9,
      messages: [{ role: 'user', content: messageContent }],
      response_format: { type: 'json_object' }
    });

    const text = response.choices[0]?.message?.content || '';
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
