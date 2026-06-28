import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { analyzeSite } from '@/lib/agents/seo-site-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 120;

const sb = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SEO_PLANS = new Set(['pro', 'fondateurs', 'business', 'elite', 'agence', 'admin']);

/**
 * GET /api/agents/seo/analyze-site  — analyse SEO du site du client (à la demande).
 *   ?force=1 pour ignorer le cache 7j.
 * Teaser (score + résumé) visible par tous = UPSELL. Rapport complet + articles = Pro+.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();

  const { data: dossier } = await supabase
    .from('business_dossiers')
    .select('website_url, company_name, business_type, city, main_products, value_proposition')
    .eq('user_id', user.id).maybeSingle();
  if (!dossier?.website_url) {
    return NextResponse.json({ ok: false, reason: 'no_site', message: 'Ajoute l\'URL de ton site dans l\'onboarding pour lancer l\'analyse SEO.' });
  }

  const { data: prof } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle();
  const isPro = SEO_PLANS.has(String(prof?.plan || '').toLowerCase());

  // Cache 7j (sauf force) — l'analyse coûte un appel LLM + un crawl.
  const force = req.nextUrl.searchParams.get('force') === '1';
  let analysis: any = null;
  if (!force) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: cached } = await supabase.from('agent_logs')
      .select('data, created_at').eq('user_id', user.id).eq('agent', 'seo').eq('action', 'seo_site_analysis')
      .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (cached?.data?.analysis) analysis = cached.data.analysis;
  }

  if (!analysis) {
    try {
      analysis = await analyzeSite(dossier.website_url, dossier);
    } catch (e: any) {
      return NextResponse.json({ ok: false, reason: 'error', error: e?.message?.substring(0, 200) }, { status: 500 });
    }
    if (analysis?.ok) {
      await supabase.from('agent_logs').insert({
        agent: 'seo', action: 'seo_site_analysis', status: 'ok', user_id: user.id,
        data: { analysis, url: analysis.url }, created_at: new Date().toISOString(),
      }).then(() => {}, () => {});
    }
  }

  if (!analysis?.ok) return NextResponse.json(analysis || { ok: false, reason: 'unknown' });

  // Pro+ : rapport complet. Sinon : teaser (upsell).
  if (isPro) {
    return NextResponse.json({ ok: true, locked: false, ...analysis });
  }
  return NextResponse.json({
    ok: true,
    locked: true,
    url: analysis.url,
    score: analysis.score,
    summary: analysis.summary,
    issuesCount: (analysis.issues || []).length,
    topIssue: (analysis.issues || [])[0]?.title || null,
    upsell: `On a analysé ton site : ${(analysis.issues || []).length} points à corriger pour attirer plus de monde. Passe au pack Pro pour le rapport complet + les articles SEO rédigés pour toi.`,
  });
}
