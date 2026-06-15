import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/agents/hook-extract
 * Body: { url: string, caption?: string }
 *
 * "Paste a URL → extract the hook." SAFE by design — uses ONLY official oEmbed
 * (TikTok public oEmbed + Meta oEmbed, which the app already has approved). It
 * does NOT scrape the video file or the platform pages, so it can't jeopardize
 * the Meta review. TikTok oEmbed returns the caption (title); Instagram oEmbed
 * returns author + thumbnail (caption isn't exposed → the UI lets the user
 * paste it). The hook + its formula are extracted with the shared hook
 * knowledge base and stored (agent_logs) so future generations get smarter.
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const url: string = (body.url || '').trim();
  const pastedCaption: string = (body.caption || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'URL invalide' }, { status: 400 });
  }

  const platform = /tiktok\.com/i.test(url) ? 'tiktok' : /instagram\.com/i.test(url) ? 'instagram' : 'unknown';

  // ── Fetch metadata via OFFICIAL oEmbed only ──
  let sourceCaption = pastedCaption;
  let author = '';
  let thumbnail = '';
  try {
    if (platform === 'tiktok') {
      const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(12_000) });
      if (r.ok) {
        const j = await r.json();
        if (!sourceCaption) sourceCaption = j.title || '';
        author = j.author_name || '';
        thumbnail = j.thumbnail_url || '';
      }
    } else if (platform === 'instagram') {
      const appId = process.env.FACEBOOK_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET;
      if (appId && appSecret) {
        const token = `${appId}|${appSecret}`;
        const r = await fetch(`https://graph.facebook.com/v21.0/instagram_oembed?url=${encodeURIComponent(url)}&fields=author_name,thumbnail_url&access_token=${token}`, { signal: AbortSignal.timeout(12_000) });
        if (r.ok) {
          const j = await r.json();
          author = j.author_name || '';
          thumbnail = j.thumbnail_url || '';
        }
      }
      // Instagram oEmbed does not expose the caption → rely on pasted caption.
    }
  } catch { /* best-effort — fall through to whatever we have */ }

  if (!sourceCaption) {
    return NextResponse.json({
      ok: false,
      needCaption: true,
      platform,
      author,
      thumbnail,
      message: platform === 'instagram'
        ? "Instagram ne fournit pas la légende via oEmbed — colle aussi la légende du post pour extraire le hook."
        : "Impossible de lire la légende — colle-la manuellement.",
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 });

  // Load the client's business so the adapted hook fits THEIR niche.
  let businessCtx = '';
  try {
    const supa = sb();
    const { data: d } = await supa.from('business_dossiers')
      .select('company_name, business_type, main_products, brand_tone')
      .eq('user_id', user.id).maybeSingle();
    if (d) businessCtx = [d.company_name, d.business_type, d.main_products].filter(Boolean).join(' — ');
  } catch { /* best-effort */ }

  const { HOOK_FORMULAS } = await import('@/lib/agents/hook-knowledge');
  const formulaList = HOOK_FORMULAS.map(f => f.key).join(', ');

  const SCHEMA = {
    type: 'object',
    properties: {
      source_hook: { type: 'string', description: 'The exact hook/opening line of the source video' },
      formula: { type: 'string', description: `Which hook family it uses (one of: ${formulaList})` },
      why: { type: 'string', description: 'One short line: why this hook works' },
      adapted_hook: { type: 'string', description: "A fresh 3-7 word hook in the SAME formula, adapted to the user's business. French. No hashtag/emoji." },
    },
    required: ['source_hook', 'formula', 'why', 'adapted_hook'],
    additionalProperties: false,
  };

  try {
    const r = await new Anthropic({ apiKey }).messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      tools: [{ name: 'hook', description: 'Return the extracted + adapted hook', input_schema: SCHEMA as any }],
      tool_choice: { type: 'tool', name: 'hook' },
      messages: [{
        role: 'user',
        content: `Analyse ce post ${platform} et identifie son HOOK (l'accroche des 3 premières secondes / la 1ère ligne) et POURQUOI il fonctionne. Puis propose un hook adapté au commerce du client, MÊME formule, sujet du client, jamais copié mot pour mot.

Légende/texte du post source: "${sourceCaption.slice(0, 800)}"
${businessCtx ? `Commerce du client: ${businessCtx}` : ''}`,
      }],
    });
    const toolUse = r.content.find((b: any) => b.type === 'tool_use') as any;
    const out = toolUse?.input || {};

    // Store the learned hook so future generations get smarter (first-party
    // knowledge accumulation — the more URLs the user feeds, the better).
    try {
      await sb().from('agent_logs').insert({
        agent: 'content', action: 'hook_learned', status: 'ok', user_id: user.id,
        data: { url, platform, author, source_hook: out.source_hook, formula: out.formula, adapted_hook: out.adapted_hook },
        created_at: new Date().toISOString(),
      });
    } catch { /* best-effort */ }

    return NextResponse.json({ ok: true, platform, author, thumbnail, ...out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'extraction_failed' }, { status: 500 });
  }
}
