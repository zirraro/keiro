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
    console.log('[Suggest] Starting...');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { imageTitle, newsTitle, newsDescription, newsCategory, contentAngle = 'informatif', audioScript, userKeywords, platform = 'instagram', trendingKeywords = [] } = body;

    console.log('[Suggest] Platform:', platform, 'Angle:', contentAngle);

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
      ? `ACTUALITÉ SÉLECTIONNÉE:\n- Titre: "${newsTitle}"\n${newsDescription ? `- Détails: ${newsDescription.substring(0, 300)}` : ''}\n- Catégorie: ${category}`
      : `Sujet: ${title}\nCatégorie: ${category}`;

    // Contexte audio si disponible
    const audioContext = audioScript ? `\nNarration audio: "${audioScript.substring(0, 200)}"` : '';
    const keywordsContext = userKeywords ? `\nMots-clés client: "${userKeywords}"` : '';
    const trendingContext = Array.isArray(trendingKeywords) && trendingKeywords.length > 0
      ? `\nTENDANCES DU MOMENT (hashtags populaires à intégrer si pertinents): ${trendingKeywords.slice(0, 15).map((k: string) => `#${k}`).join(' ')}`
      : '';

    // Background Agent Intelligence: load SEO + Content learnings for smarter captions
    let agentInsightsContext = '';
    try {
      const { data: insights } = await supabase
        .from('agent_logs')
        .select('data')
        .in('agent', ['seo', 'content', 'marketing'])
        .in('action', ['learning', 'learning_acquired'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (insights?.length) {
        const relevantCats = new Set([
          'hashtag_evolution', 'instagram_algorithm', 'instagram_history',
          'posting_frequency', 'content_format_evolution', 'french_market',
          'linkedin_algorithm', 'ugc_creator_economy', 'social_seo',
          'local_seo_france', 'keyword_evolution', 'ai_content',
        ]);
        const tips: string[] = [];
        for (const row of insights) {
          const d = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
          if (!d?.learning || (d?.confidence || 0) < 75) continue;
          if (relevantCats.has(d.category)) {
            tips.push(d.learning.substring(0, 150));
            if (tips.length >= 5) break;
          }
        }
        if (tips.length > 0) {
          agentInsightsContext = `\nINTELLIGENCE IA (tendances actuelles basées sur données agents):\n${tips.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
        }
      }
    } catch { /* non-fatal */ }

    // Angles par plateforme
    const angleInstructions: Record<string, Record<string, string>> = {
      instagram: {
        informatif: "Partage une découverte utile. Bénéfices concrets. Connexion via 'vous'/'tu'.",
        emotionnel: "Histoire qui touche le cœur. Rêves, peurs, désirs du client.",
        inspirant: "Aspirations du client. Transformation possible. 'Imaginez...'",
        humoristique: "Humour du quotidien, relatable. Léger et accessible.",
        professionnel: "Accessible mais crédible. Résultats, pas processus.",
        storytelling: "Histoire du CLIENT. Problème → transformation → action.",
        educatif: "Info utile et applicable. Exemples concrets.",
        provocateur: "Challenge les croyances. Questions qui font réfléchir."
      },
      linkedin: {
        professionnel: "Ton expert mais accessible. Insights sectoriels. Crédibilité.",
        'thought-leadership': "Vision d'avenir. Analyse tendances. Position de leader.",
        informatif: "Partage de savoir-faire. Données et faits. Valeur ajoutée.",
        inspirant: "Parcours entrepreneurial. Leçons apprises. Vision motivante.",
        storytelling: "Anecdote professionnelle. Leçon business concrète.",
        educatif: "Formation rapide. Tips actionnables. Expertise partagée."
      }
    };

    const platformAngles = angleInstructions[platform] || angleInstructions.instagram;
    const angleInstruction = platformAngles[contentAngle] || Object.values(platformAngles)[0];

    let promptText: string;

    if (platform === 'linkedin') {
      promptText = `Tu es un expert LinkedIn et personal branding B2B. Crée un post LinkedIn pour ${businessType}.

ÉTAPE 1 — ANALYSE DU CONTEXTE:
Business: ${businessType}${businessDesc ? ` — ${businessDesc}` : ''}
${newsContext}${audioContext}${keywordsContext}${trendingContext}

QUESTION CLÉ: Comment CE business peut se positionner comme expert/leader face à CETTE actualité ?
Quel insight UNIQUE ce business peut apporter à son réseau professionnel ?
${agentInsightsContext}

ÉTAPE 2 — RÉDIGE LE POST LINKEDIN:
Angle: ${contentAngle.toUpperCase()} — ${angleInstruction}

STRUCTURE:
1. HOOK (1ère ligne): Accroche forte qui arrête le scroll LinkedIn (question, stat, affirmation)
2. CONTEXTE: Lie l'actualité au secteur du business (2-3 lignes)
3. INSIGHT: Point de vue unique, leçon ou analyse (2-3 lignes)
4. VALEUR: Ce que le lecteur retient/apprend (1-2 lignes)
5. CTA: Engagement subtil (question ouverte, "Qu'en pensez-vous ?")

RÈGLES:
- Ton professionnel mais humain (pas corporate froid)
- Max 200 mots
- Sauts de ligne fréquents (lisibilité mobile)
- 1-2 emojis par paragraphe max
- Pas de hashtags dans le texte

HASHTAGS LINKEDIN:
- 3 à 5 hashtags max (LinkedIn pénalise plus)
- Mix: 1 secteur + 1 thématique + 1 niche
- Professionnels et pertinents

JSON pur:
{"caption": "...", "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"]}`;
    } else {
      // Instagram
      promptText = `Tu es un copywriter Instagram expert B2C. Crée un post Instagram pour ${businessType}.

ÉTAPE 1 — ANALYSE DU CONTEXTE:
Business: ${businessType}${businessDesc ? ` — ${businessDesc}` : ''}
${newsContext}${audioContext}${keywordsContext}${trendingContext}

QUESTION CLÉ: Comment CE business attire ses clients en surfant sur CETTE actualité ?
Quel BÉNÉFICE CONCRET le client retire de ce business face à cette situation ?
${agentInsightsContext}

ÉTAPE 2 — RÉDIGE LE POST INSTAGRAM:
Angle: ${contentAngle.toUpperCase()} — ${angleInstruction}

STRUCTURE:
1. HOOK (1ère ligne): Captive en 3 sec — question, affirmation choc, promesse
2. LIEN ACTU↔BUSINESS: Montre pourquoi ce business est LA solution face à cette actu
3. BÉNÉFICE CLIENT: Ce que le client GAGNE (pas ce que tu fais)
4. CTA: Simple et clair (DM, lien bio, commentez)

RÈGLES:
- Parle AU client ("Imaginez..." pas "Nous proposons...")
- Max 150-180 mots
- Emojis stratégiques (1-2 par paragraphe)
- Crée urgence/rareté si pertinent

HASHTAGS:
- 8-10 hashtags
- Mix populaires (100k-1M) + niches (10k-50k)
- INTÈGRE 2-3 hashtags des TENDANCES DU MOMENT si pertinents pour le contenu
- Hashtags locaux si business local
- Évite #love, #instagood (trop saturés)

JSON pur:
{"caption": "...", "hashtags": ["#h1", "#h2", "#h3", "#h4", "#h5", "#h6", "#h7", "#h8", "#h9", "#h10"]}`;
    }

    console.log('[Suggest] Calling Claude Haiku...');
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      temperature: 0.8,
      messages: [{ role: 'user', content: promptText }],
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

      // LinkedIn: max 5 hashtags
      if (platform === 'linkedin') {
        suggestion.hashtags = suggestion.hashtags.slice(0, 5);
      }

      console.log('[Suggest] Success!');
    } catch (e: any) {
      console.error('[Suggest] Parse error:', e.message);
      suggestion = {
        caption: `${title}\n\n✨ Découvrez notre actualité sur ${category.toLowerCase()}.\n\n💭 Qu'en pensez-vous ?\n\n👉 Commentez !`,
        hashtags: platform === 'linkedin'
          ? ['#business', '#entreprise', '#actualité']
          : ['#business', '#entreprise', '#inspiration', '#motivation', '#france', '#instagram', '#contenu', `#${category.toLowerCase().replace(/\s+/g, '')}`]
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
