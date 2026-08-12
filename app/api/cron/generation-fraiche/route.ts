import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Une génération NEUVE par réseau et par jour, pour voir le niveau réel.
 *
 * ── Pourquoi ──
 *
 * Fondateur, 2026-08-12 : « lance tous les jours de nouvelles générations, au
 * moins une pour chaque réseau, en plus, pour que je voie le niveau et qu'on
 * commence à suivre. »
 *
 * Le constat qui l'a déclenché : la mesure du « bon du premier coup » restait
 * vide. Le calendrier est servi par un stock de 239 publications déjà
 * produites et requalifiées ; la chaîne de génération ne tournait donc plus, et
 * on ne pouvait rien affirmer sur la qualité du prompting — seulement l'espérer.
 *
 * Une sonde quotidienne remet la chaîne complète à l'épreuve, tous les jours :
 * prompt → génération → contrôle qualité → publication. Ce n'est pas du
 * remplissage, c'est l'instrument qui permet de dire « on sort du bon du
 * premier coup » avec un chiffre plutôt qu'une conviction.
 *
 * ── Un réseau par passage, à des heures différentes ──
 *
 * Fondateur : « à des heures différentes, jamais en même temps. » Trois
 * passages espacés dans la journée plutôt qu'un seul qui produirait trois
 * publications d'un coup — une salve fait chuter la portée, et c'est justement
 * ce qu'on cherche à mesurer.
 *
 * ── Qui en bénéficie ──
 *
 * Par défaut, les comptes NON PLAFONNÉS : le compte de référence et les
 * administrateurs. Ajouter une publication quotidienne à un client payant
 * ferait sauter son pool de crédits et la marge de 80 % — la sonde sert à
 * observer notre propre qualité, pas à gonfler la sienne. Un client peut
 * l'activer explicitement (`generation_fraiche: true`).
 */

const RESEAU_VERS_SLOT: Record<string, string> = {
  instagram: 'morning',
  tiktok: 'tiktok',
  linkedin: 'linkedin_1',
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const reseau = (req.nextUrl.searchParams.get('reseau') || 'instagram').toLowerCase();
  const slot = RESEAU_VERS_SLOT[reseau];
  if (!slot) return NextResponse.json({ ok: false, error: 'réseau inconnu' }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';

  // Les comptes concernés : administrateurs et compte de référence, plus ceux
  // qui l'ont demandé explicitement.
  const { data: profils } = await supabase
    .from('profiles').select('id, email, is_admin').limit(200);

  const { data: configs } = await supabase
    .from('org_agent_configs').select('user_id, config').eq('agent_id', 'content');
  const aDemande = new Set(
    (configs || []).filter((c: any) => c.config?.generation_fraiche === true).map((c: any) => c.user_id),
  );

  const REFERENCE = new Set(['mrzirraro@gmail.com']);
  const cibles = (profils || []).filter((p: any) =>
    p.is_admin || REFERENCE.has(String(p.email || '').toLowerCase().trim()) || aDemande.has(p.id));

  if (!cibles.length) return NextResponse.json({ ok: true, reseau, message: 'aucun compte éligible' });

  const resultats: Array<{ email: string; ok: boolean; detail?: string }> = [];
  for (const c of cibles) {
    try {
      const r = await fetch(`${base}/api/agents/content?slot=${slot}&user_id=${c.id}`, {
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(240_000),
      });
      const j = await r.json().catch(() => ({}));
      resultats.push({ email: c.email, ok: r.ok, detail: j?.skipped || j?.message || (r.ok ? 'généré' : `HTTP ${r.status}`) });
    } catch (e: any) {
      resultats.push({ email: c.email, ok: false, detail: e?.message?.slice(0, 100) });
    }
  }

  try {
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'generation_fraiche', status: 'ok',
      data: { reseau, comptes: resultats.length, resultats },
      created_at: new Date().toISOString(),
    });
  } catch { /* la trace ne bloque pas */ }

  return NextResponse.json({ ok: true, reseau, resultats });
}
