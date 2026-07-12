import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callGemini } from '@/lib/agents/gemini';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/blog-reformat
 *
 * Reforme la MISE EN PAGE des articles existants (founder 12/07 : "les blogs
 * sont trop denses, tout d'affilée — plus de tableaux, bullets, flèches, sauts
 * de ligne"). Un LLM restructure le content_html en version AÉRÉE : paragraphes
 * courts, listes à puces/flèches, tableaux comparatifs, blockquotes — SANS
 * changer le sens, le texte, les titres, les liens NI les images.
 *
 * Idempotent-ish : on saute les articles déjà aérés (≥1 tableau ET ≥3 listes).
 * Traite par lots (`limit`) pour ne pas timeout. Auth: CRON_SECRET.
 *
 * Body: { limit?: number, dryRun?: boolean, force?: boolean }
 */
function countTag(html: string, tag: string): number {
  const m = html.match(new RegExp(`<${tag}[\\s>]`, 'gi'));
  return m ? m.length : 0;
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body?.limit) || 8, 20); // petits lots (rewrite = lourd)
  const dryRun = body?.dryRun === true;
  const force = body?.force === true;

  const { data: posts } = await supabase
    .from('blog_posts')
    .select('id, slug, title, content_html')
    .eq('status', 'published')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(limit * 4); // on sur-fetch puis on filtre les déjà-aérés (skip si ≥1 table & ≥3 listes)

  const results: any[] = [];
  let done = 0;

  for (const p of posts || []) {
    if (done >= limit) break;
    const html = String(p.content_html || '');
    if (html.length < 400) continue;
    const tables = countTag(html, 'table');
    const lists = countTag(html, 'ul') + countTag(html, 'ol');
    // Déjà aéré → on saute (sauf force).
    if (!force && tables >= 1 && lists >= 3) continue;

    let newHtml = '';
    try {
      const raw = await callGemini({
        system: `Tu es expert SEO + mise en page éditoriale FR. On te donne le content_html d'un article de blog. Tu le RESTRUCTURES pour qu'il soit AÉRÉ et SCANNABLE, sans changer le fond.

CE QUE TU FAIS :
- Découper les longs paragraphes en paragraphes COURTS (2-3 phrases max).
- Transformer les énumérations/successions d'idées en listes <ul>/<ol> (utilise "→" en début de puce quand c'est une progression d'actions).
- Ajouter AU MOINS 2 <table> comparatifs LÀ OÙ le texte contient des comparaisons, options, étapes, prix, avant/après (n'invente pas de données : réutilise ce qui est déjà dit).
- Mettre les phrases-clés / stats en <blockquote>.
- Mettre en <strong> les mots importants (points d'ancrage pour l'œil).
- Garder AU MOINS 1 liste ou 1 tableau par section <h2>.

CE QUE TU NE CHANGES JAMAIS :
- Le SENS, les faits, les chiffres. Tu ne réécris pas le message, tu le REMET EN FORME.
- Les titres <h1>/<h2>/<h3> (garde le même texte).
- TOUTES les balises <img ...> (garde-les à l'identique, même position relative — surtout data-seo-generate et les src existants).
- TOUS les liens <a href="..."> (mêmes URL, mêmes ancres).
- La langue (français, tutoiement).

SORTIE : UNIQUEMENT le content_html restructuré, HTML pur valide, RIEN d'autre (pas de \`\`\`, pas de commentaire).`,
        message: `Voici le content_html à ré-aérer (garde images, liens, titres, sens) :\n\n${html.slice(0, 24000)}`,
        maxTokens: 8000,
      });
      newHtml = String(raw || '').replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
    } catch { newHtml = ''; }

    // Garde-fous : le résultat doit être crédible et ne pas PERDRE d'images/liens.
    const okLength = newHtml.length > html.length * 0.5;
    const keptImgs = countTag(newHtml, 'img') >= countTag(html, 'img');
    const keptLinks = (newHtml.match(/<a\s/gi)?.length || 0) >= Math.floor((html.match(/<a\s/gi)?.length || 0) * 0.8);
    const improved = force || countTag(newHtml, 'table') + countTag(newHtml, 'ul') + countTag(newHtml, 'ol') > tables + lists;

    if (newHtml && okLength && keptImgs && keptLinks && improved) {
      if (!dryRun) {
        await supabase.from('blog_posts').update({
          content_html: newHtml,
          updated_at: new Date().toISOString(),
        }).eq('id', p.id);
      }
      done++;
      results.push({ slug: p.slug, before: { tables, lists }, after: { tables: countTag(newHtml, 'table'), lists: countTag(newHtml, 'ul') + countTag(newHtml, 'ol') } });
    } else {
      results.push({ slug: p.slug, skipped: true, reason: !newHtml ? 'llm_empty' : !okLength ? 'too_short' : !keptImgs ? 'lost_images' : !keptLinks ? 'lost_links' : 'not_improved' });
    }
  }

  return NextResponse.json({ ok: true, reformatted: done, dryRun, results });
}
