import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * L'article de blog hebdomadaire de KeiroAI, écrit et publié par Théo.
 *
 * Demande fondateur (2026-07-31) : « Théo doit nous créer un blog top qualité
 * pour attirer du trafic sur notre site chaque semaine, surtout qu'en plus on
 * partage ses articles en donnant de la valeur lors de nos campagnes d'emailing
 * — ça permet un contact sans forcer la conversion. »
 *
 * Tout existait déjà côté agent (generate_article puis publish sur
 * /api/agents/seo) mais rien ne l'appelait : les 88 articles en ligne avaient
 * été lancés à la main, et le blog n'avait pas bougé depuis. C'est le
 * planificateur qui manquait, pas la capacité.
 *
 * Deux garde-fous :
 *   • on ne publie que si aucun article n'est déjà sorti dans les 5 derniers
 *     jours — un doublon le lundi d'une semaine chargée ferait plus de mal au
 *     référencement que de bien ;
 *   • l'article part en brouillon puis est publié explicitement, donc un échec
 *     de génération ne laisse jamais une page à moitié écrite en ligne.
 */

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const force = new URL(req.url).searchParams.get('force') === '1';

  // Un article récent = on ne double pas.
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
  const { data: recent } = await supabase
    .from('blog_posts')
    .select('id, title, published_at')
    .eq('status', 'published')
    .gte('published_at', fiveDaysAgo)
    .limit(1);

  if (!force && recent && recent.length > 0) {
    return NextResponse.json({
      ok: true,
      skipped: 'article_recent',
      message: `Article publié il y a moins de 5 jours : « ${recent[0].title} »`,
    });
  }

  const base = process.env.INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
  const headers = { 'Content-Type': 'application/json', authorization: `Bearer ${cronSecret}` };

  try {
    // 1. Théo choisit le mot-clé (le plus fort du cluster non encore traité)
    //    et rédige l'article.
    const genRes = await fetch(`${base}/api/agents/seo`, {
      method: 'POST', headers, body: JSON.stringify({ action: 'generate_article' }),
    });
    const gen = await genRes.json().catch(() => null);
    if (!gen?.ok || !gen?.article?.id) {
      return NextResponse.json({ ok: false, step: 'generate', error: gen?.error || 'génération échouée' }, { status: 200 });
    }

    // 2. Publication.
    const pubRes = await fetch(`${base}/api/agents/seo`, {
      method: 'POST', headers, body: JSON.stringify({ action: 'publish', article_id: gen.article.id }),
    });
    const pub = await pubRes.json().catch(() => null);

    // 3. Journal, pour que l'article apparaisse dans le suivi d'activité.
    try {
      await supabase.from('agent_logs').insert({
        agent: 'seo',
        action: 'weekly_blog_published',
        status: pub?.ok ? 'success' : 'error',
        data: { article_id: gen.article.id, title: gen.article.title, slug: gen.article.slug },
      });
    } catch { /* le journal ne doit jamais faire échouer la publication */ }

    return NextResponse.json({
      ok: !!pub?.ok,
      article: { id: gen.article.id, title: gen.article.title, slug: gen.article.slug },
      published: !!pub?.ok,
      error: pub?.ok ? undefined : pub?.error,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'échec' }, { status: 200 });
  }
}
