import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { getAuthUser } from '@/lib/auth-server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!process.env.OPENAI_API_KEY) {
  console.error('[Suggest] OPENAI_API_KEY not configured');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

export async function POST(request: NextRequest) {
  try {
    console.log('[Suggest] Starting...');

    if (!process.env.OPENAI_API_KEY) {
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
    const { imageUrl, imageTitle, newsTitle, newsCategory, contentAngle = 'informatif', audioUrl, audioScript } = body;

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

    // Définir le prompt selon l'angle choisi - APPROCHE B2C
    const angleInstructions = {
      informatif: "Parle comme un ami qui partage une découverte utile. Mets en avant les BÉNÉFICES concrets pour le client. Utilise 'vous' et 'tu' pour créer une connexion.",
      emotionnel: "Raconte une histoire qui touche le cœur. Parle des rêves, peurs, désirs du client. Crée une connexion émotionnelle forte. Utilise des mots sensoriels.",
      inspirant: "Parle directement aux aspirations du client. Montre la transformation possible. Utilise 'vous pouvez', 'imaginez', 'c'est possible'. Crée du rêve.",
      humoristique: "Amuse-toi ! Utilise l'humour du quotidien, des situations relatable. Fais sourire le lecteur. Reste léger et accessible.",
      professionnel: "Reste accessible mais crédible. Montre la valeur sans jargon. Parle des résultats, pas des processus. Le client veut des solutions, pas des features.",
      storytelling: "Raconte l'histoire du CLIENT, pas du produit. Commence par un problème relatable, montre la transformation, termine par l'invitation à agir.",
      educatif: "Apprends quelque chose d'utile et APPLICABLE immédiatement. Utilise des exemples concrets. Rends l'info facile à retenir et partager.",
      provocateur: "Challenge les croyances limitantes. Pose des questions qui font réfléchir. Crée la curiosité. Donne envie de découvrir la solution."
    };

    const angleInstruction = angleInstructions[contentAngle as keyof typeof angleInstructions] || angleInstructions.informatif;

    // Ajouter contexte audio si disponible
    const audioContext = audioScript ? `\n\n🎙️ CONTEXTE AUDIO:\nUne narration audio accompagne ce post avec le script suivant:\n"${audioScript}"\n\nTiens compte de ce script audio dans ta suggestion pour créer une cohérence entre l'audio et le texte.` : '';

    const prompt = `Tu es un copywriter Instagram expert en conversion B2C. Ta mission : créer du contenu qui ATTIRE les clients vers ${business}.

🎯 OBJECTIF CRITIQUE:
Ce post doit attirer des CONSOMMATEURS FINAUX (clients potentiels), PAS des professionnels.
Le contenu doit donner ENVIE d'acheter, d'essayer, de découvrir, de contacter.

📊 CONTEXTE:
- Business: ${business}
- Sujet: ${title}
- Catégorie: ${category}
- ANGLE: ${contentAngle.toUpperCase()}
  ${angleInstruction}${audioContext}

🖼️ ANALYSE DE L'IMAGE:
1. Regarde VRAIMENT l'image - couleurs, ambiance, éléments visuels
2. Identifie l'émotion principale qu'elle dégage
3. Trouve le message subtil qu'elle communique
4. Repère ce qui attire l'œil en premier

✍️ RÉDACTION:
Structure du post:
1. HOOK (1ère ligne): Captive en 3 secondes max - question, affirmation choc, ou promesse claire
2. BÉNÉFICE CLIENT: Parle de CE QUE LE CLIENT GAGNE (pas de ce que tu fais)
3. PREUVE SOCIALE/CRÉDIBILITÉ: Léger, subtil (ex: "Des centaines de clients satisfaits")
4. CALL TO ACTION: Clair et simple (DM, visite profil, clic lien bio, réserve maintenant)

RÈGLES D'OR:
- Parle AU client, pas DU produit ("Imaginez..." pas "Nous proposons...")
- Utilise des verbes d'action et mots émotionnels
- Crée l'urgence ou la rareté si pertinent (sans mentir)
- Reste authentique - pas de sur-promesses
- Max 150-180 mots (Instagram = scroll rapide)
- Emojis stratégiques (1-2 par paragraphe max)

🏷️ HASHTAGS:
- Mélange de hashtags populaires (100k-1M posts) et niches (10k-50k)
- Inclus des hashtags locaux si business local
- Évite les hashtags trop saturés (#love, #instagood)

Réponds UNIQUEMENT avec ce JSON (pas de \`\`\`, pas de markdown):
{
  "caption": "🎯 Hook percutant basé sur l'image\\n\\n💡 Bénéfice client clair\\n\\n✨ Mini preuve sociale\\n\\n👉 CTA avec emoji",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7", "#hashtag8", "#hashtag9", "#hashtag10"]
}`;

    // Build message: with image if available, text-only otherwise
    const messageContent: any[] = [];
    if (imageUrl) {
      console.log('[Suggest] Calling GPT-4o Vision (with image)...');
      messageContent.push({ type: 'image_url', image_url: { url: imageUrl, detail: 'auto' } });
    } else {
      console.log('[Suggest] Calling GPT-4o (text-only, no thumbnail)...');
    }
    messageContent.push({ type: 'text', text: prompt });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      temperature: 0.8,
      messages: [{ role: 'user', content: messageContent }],
      response_format: { type: 'json_object' }
    });

    const text = response.choices[0]?.message?.content || '';
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
