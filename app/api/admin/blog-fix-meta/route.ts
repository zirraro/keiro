import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callGemini } from '@/lib/agents/gemini';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/blog-fix-meta
 *
 * Rewrites blog articles' meta_title / meta_description that exceed SEO limits
 * (title >60 chars, description >158 chars) — Google truncates them in the
 * SERP, which hurts CTR. The LLM rewrites them punchy AND within limits,
 * keeping the primary keyword + a benefit hook. Content bodies are untouched
 * (already top-level: long-form, FAQ schema, internal links).
 *
 * Auth: CRON_SECRET or admin. Idempotent — only touches out-of-bounds meta.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body?.limit) || 200, 200);
  const dryRun = body?.dryRun === true;

  const { data: posts } = await supabase
    .from('blog_posts')
    .select('id, slug, title, meta_title, meta_description, keywords_primary, excerpt, content_html')
    .eq('status', 'published')
    .limit(limit);

  const results: any[] = [];
  let fixed = 0;

  for (const p of posts || []) {
    const metaTitleLong = !p.meta_title || p.meta_title.length > 60;
    const metaDescLong = !p.meta_description || p.meta_description.length < 120 || p.meta_description.length > 158;
    if (!metaTitleLong && !metaDescLong) continue;

    const firstText = String(p.content_html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    const kw = p.keywords_primary || '';

    let out: { meta_title?: string; meta_description?: string } = {};
    try {
      const raw = await callGemini({
        system: `Tu es expert SEO + copywriter FR. On te donne un article. Tu réécris SON meta_title et SA meta_description pour respecter STRICTEMENT les limites Google et maximiser le taux de clic.

RÈGLES DURES :
- meta_title : 50-60 caractères MAX (jamais plus de 60). Contient le mot-clé principal, accrocheur, sans "| KeiroAI".
- meta_description : 140-155 caractères MAX (jamais plus de 158, jamais moins de 130). Une accroche + un bénéfice concret + une légère incitation. Naturelle, pas de bourrage de mots-clés.
- Français impeccable, tutoiement, zéro faute, pas d'emoji.
- Sortie JSON STRICT : {"meta_title":"...","meta_description":"..."}`,
        message: `Titre article : ${p.title}\nMot-clé principal : ${kw}\nDébut du contenu : ${firstText}\n\nRéécris meta_title (≤60) et meta_description (≤155).`,
        maxTokens: 300,
      });
      const clean = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      out = JSON.parse(clean);
    } catch {
      // Fallback : troncature intelligente si le LLM échoue.
      out = {};
    }

    const update: Record<string, any> = {};
    // meta_title
    if (metaTitleLong) {
      let mt = (out.meta_title || '').trim();
      if (!mt || mt.length > 60) {
        const base = mt || p.meta_title || p.title || '';
        mt = base.length <= 60 ? base : base.slice(0, 57).replace(/\s+\S*$/, '') + '…';
      }
      update.meta_title = mt;
    }
    // meta_description
    if (metaDescLong) {
      let md = (out.meta_description || '').trim();
      if (!md || md.length > 158 || md.length < 100) {
        const base = md || p.meta_description || p.excerpt || '';
        md = base.length <= 158 ? base : base.slice(0, 155).replace(/\s+\S*$/, '') + '…';
      }
      update.meta_description = md;
    }

    if (Object.keys(update).length) {
      if (!dryRun) {
        update.updated_at = new Date().toISOString();
        await supabase.from('blog_posts').update(update).eq('id', p.id);
      }
      fixed++;
      results.push({ slug: p.slug, ...update });
    }
  }

  return NextResponse.json({ ok: true, scanned: (posts || []).length, fixed, dryRun, sample: results.slice(0, 8) });
}
