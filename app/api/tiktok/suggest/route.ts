import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  try {
    console.log('[TikTok Suggest] Starting...');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { imageTitle, newsTitle, newsDescription, newsCategory, contentAngle = 'viral', audioScript, userKeywords, trendingKeywords = [] } = body;

    console.log('[TikTok Suggest] Angle:', contentAngle);

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_type, business_description')
      .eq('id', user.id)
      .single();

    const businessType = profile?.business_type || 'entreprise';
    const businessDesc = profile?.business_description || '';
    const title = newsTitle || imageTitle || 'contenu';
    const category = newsCategory || 'Business';

    // Contexte actualité enrichi
    const newsContext = newsTitle
      ? `ACTUALITÉ:\n- Titre: "${newsTitle}"\n${newsDescription ? `- Détails: ${newsDescription.substring(0, 300)}` : ''}\n- Catégorie: ${category}`
      : `Sujet: ${title}\nCatégorie: ${category}`;

    const audioContext = audioScript ? `\nNarration audio: "${audioScript.substring(0, 200)}"` : '';
    const keywordsContext = userKeywords ? `\nMots-clés: "${userKeywords}"` : '';
    const trendingContext = Array.isArray(trendingKeywords) && trendingKeywords.length > 0
      ? `\nTENDANCES DU MOMENT (hashtags populaires à intégrer si pertinents): ${trendingKeywords.slice(0, 15).map((k: string) => `#${k}`).join(' ')}`
      : '';

    const angleInstructions: Record<string, string> = {
      viral: "Hook choquant/surprenant/intrigant. Urgence de regarder jusqu'au bout.",
      fun: "Humour du quotidien, relatable. Fais sourire. Authentique.",
      informatif: "Info rapide, claire, mémorable. Faits surprenants.",
      inspirant: "Motive et inspire. Transformation, possibilités, espoir.",
      educatif: "Enseigne quelque chose d'applicable. 'Saviez-vous que...' fonctionne bien."
    };

    const angleInstruction = angleInstructions[contentAngle] || angleInstructions.viral;

    const promptText = `Tu es un expert TikTok spécialisé vidéos virales. Crée une description TikTok pour ${businessType}.

ÉTAPE 1 — ANALYSE DU CONTEXTE:
Business: ${businessType}${businessDesc ? ` — ${businessDesc}` : ''}
${newsContext}${audioContext}${keywordsContext}${trendingContext}

QUESTION CLÉ: Comment CE business peut devenir VIRAL en surfant sur CETTE actualité ?
Quel angle TikTok (POV, storytime, fait surprenant) fonctionne le mieux ?

ÉTAPE 2 — RÉDIGE LA DESCRIPTION TIKTOK:
Angle: ${contentAngle.toUpperCase()} — ${angleInstruction}

STRUCTURE (vidéo courte 5s):
1. HOOK ULTRA-PUISSANT (ligne 1): Arrête le scroll instantanément
   Ex: "POV:", "Attends quoi?!", "Personne n'en parle mais...", "La VRAIE raison pour..."
2. LIEN ACTU↔BUSINESS: Pourquoi CE business EST la réponse à cette actu
3. CTA SUBTIL: "Sauvegarde", "Partage", "Follow pour la suite"

RÈGLES TIKTOK:
- Langage TikTok naturel ("POV", "Storytime", "Wait for it", "Part 1/2")
- Ton casual, comme un ami
- Max 100-120 mots
- Crée la curiosité — envie de regarder jusqu'au bout

HASHTAGS TIKTOK:
- TOUJOURS: #fyp #pourtoi #viral
- INTÈGRE 2-3 hashtags des TENDANCES DU MOMENT si pertinents pour le contenu
- + hashtags de niche liés au contenu et au business
- Mix français + anglais
- 8-12 hashtags max

JSON pur:
{"caption": "...", "hashtags": ["#fyp", "#pourtoi", "#viral", "#h4", "#h5", "#h6", "#h7", "#h8", "#h9", "#h10"]}`;

    console.log('[TikTok Suggest] Calling Claude Haiku...');
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      temperature: 0.9,
      messages: [{ role: 'user', content: promptText }],
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

      // Assurer les hashtags essentiels TikTok
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
        caption: `${title}\n\n🔥 Découvrez notre actualité sur ${category.toLowerCase()}\n\n💬 Commentez !\n\n✨ Follow pour plus !`,
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
