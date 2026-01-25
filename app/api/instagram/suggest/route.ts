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
    const { imageTitle, newsTitle, newsCategory } = body;

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_type, business_description')
      .eq('id', user.id)
      .single();

    const business = profile?.business_description || profile?.business_type || 'entreprise';
    const title = imageTitle || newsTitle || 'contenu';
    const category = newsCategory || 'Business';

    const prompt = `Crée un post Instagram viral pour "${title}" (catégorie: ${category}, business: ${business}).

Réponds UNIQUEMENT avec ce JSON (pas de markdown):
{
  "caption": "Hook accrocheur\n\nCorps du post (150-200 mots)\n\nCTA avec emoji",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8", "#tag9", "#tag10"]
}`;

    console.log('[Suggest] Calling Claude...');

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }]
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
