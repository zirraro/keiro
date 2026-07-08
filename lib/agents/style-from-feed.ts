/**
 * STYLE-FROM-FEED (doc suite C1) — à la connexion Instagram, on lit le feed
 * RÉEL du client pour seeder son style. Tue l'objection n°1 (« le contenu IA ne
 * me ressemble pas ») : Léna écrit comme LUI, en mieux tenu, dès le jour 1.
 *
 * Ce qu'on extrait : ton/voix réel, piliers de contenu, formats/créneaux
 * gagnants, ET ce qui n'a jamais marché (à éviter). Coût ~0,10€ (1 lecture API +
 * 1 analyse Haiku), une fois. Best-effort, jamais bloquant pour l'OAuth.
 */
import { SupabaseClient } from '@supabase/supabase-js';

interface FeedPost {
  caption: string;
  like_count: number;
  comments_count: number;
  media_type: string;
  timestamp: string;
}

async function fetchOwnFeed(token: string, igBusinessId: string | null): Promise<FeedPost[]> {
  // Dual-host : IGAA (Instagram Login) → graph.instagram.com/me/media ;
  // token page FB legacy → graph.facebook.com/{ig-id}/media.
  const fields = 'caption,like_count,comments_count,media_type,timestamp';
  const isIgaa = token.startsWith('IGAA');
  const url = isIgaa
    ? `https://graph.instagram.com/v21.0/me/media?fields=${fields}&limit=25&access_token=${token}`
    : `https://graph.facebook.com/v20.0/${igBusinessId}/media?fields=${fields}&limit=25&access_token=${token}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.data || []).map((p: any) => ({
      caption: (p.caption || '').slice(0, 400),
      like_count: Number(p.like_count) || 0,
      comments_count: Number(p.comments_count) || 0,
      media_type: p.media_type || 'IMAGE',
      timestamp: p.timestamp || '',
    })).filter((p: FeedPost) => p.caption || p.like_count);
  } catch { return []; }
}

async function extractStyle(posts: FeedPost[]): Promise<{ tone: string; pillars: string[]; works: string; avoid: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || posts.length < 3) return null;
  // Trie par engagement pour montrer top + flops au modèle.
  const scored = [...posts].sort((a, b) => (b.like_count + b.comments_count * 3) - (a.like_count + a.comments_count * 3));
  const top = scored.slice(0, 6);
  const flops = scored.slice(-4);
  const fmt = (p: FeedPost) => `[${p.media_type}, ${p.like_count}❤ ${p.comments_count}💬] ${p.caption.replace(/\n/g, ' ').slice(0, 180)}`;
  const prompt = `Voici les posts Instagram réels d'un commerce (avec engagement).
POSTS QUI MARCHENT LE MIEUX:
${top.map(fmt).join('\n')}

POSTS QUI MARCHENT LE MOINS:
${flops.map(fmt).join('\n')}

Analyse le STYLE RÉEL de ce compte et réponds en JSON strict:
{"tone":"description du ton/voix réel en 1 phrase (tutoiement/vouvoiement, chaleureux/pro, emojis, longueur…)","pillars":["3-5 thèmes récurrents"],"works":"ce qui génère le plus d'engagement chez EUX, 1 phrase","avoid":"ce qui ne marche pas chez eux, 1 phrase"}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text = j?.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    return {
      tone: String(parsed.tone || '').slice(0, 300),
      pillars: Array.isArray(parsed.pillars) ? parsed.pillars.slice(0, 5).map((s: any) => String(s).slice(0, 60)) : [],
      works: String(parsed.works || '').slice(0, 200),
      avoid: String(parsed.avoid || '').slice(0, 200),
    };
  } catch { return null; }
}

/**
 * Analyse le feed IG du client et seed son style. Best-effort, ne throw jamais.
 * Ne SURÉCRIT PAS un brand_tone déjà défini explicitement par le client.
 */
export async function seedStyleFromFeed(supabase: SupabaseClient, userId: string): Promise<{ seeded: boolean; reason?: string }> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('instagram_access_token, instagram_business_account_id, brand_tone, content_themes')
      .eq('id', userId).single();
    if (!profile?.instagram_access_token) return { seeded: false, reason: 'no_token' };

    const posts = await fetchOwnFeed(profile.instagram_access_token, profile.instagram_business_account_id);
    if (posts.length < 3) return { seeded: false, reason: 'too_few_posts' };

    const style = await extractStyle(posts);
    if (!style) return { seeded: false, reason: 'analysis_failed' };

    // Seed : ne surécrit PAS un ton déjà défini par le client.
    const update: any = {};
    if (!profile.brand_tone || String(profile.brand_tone).trim().length < 3) {
      update.brand_tone = style.tone;
    }
    if (!profile.content_themes || (Array.isArray(profile.content_themes) && profile.content_themes.length === 0)) {
      if (style.pillars.length) update.content_themes = style.pillars;
    }
    if (Object.keys(update).length) {
      await supabase.from('profiles').update(update).eq('id', userId);
    }
    // Pont onboarding : si un brand_kit existe déjà avec un ton vide, on y reflète
    // le ton détecté pour que la page brand-kit le montre pré-rempli (« oui c'est
    // moi » au lieu d'un formulaire vide). Conservateur : jamais de surécriture,
    // jamais de création de ligne (pour ne pas interférer avec l'état onboarding).
    try {
      const { data: kit } = await supabase.from('brand_kits').select('id, tone').eq('org_id', userId).maybeSingle();
      if (kit?.id && (!kit.tone || String(kit.tone).trim().length < 3)) {
        await supabase.from('brand_kits').update({ tone: style.tone }).eq('id', kit.id);
      }
    } catch { /* best-effort */ }
    // Trace l'analyse (mémoire agent, consultable) même si on n'a rien surécrit.
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'style_from_feed', status: 'ok',
      data: { user_id: userId, posts_analyzed: posts.length, tone: style.tone, pillars: style.pillars, works: style.works, avoid: style.avoid, seeded: Object.keys(update) },
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    return { seeded: Object.keys(update).length > 0 };
  } catch (e: any) {
    return { seeded: false, reason: e?.message?.slice(0, 80) };
  }
}
