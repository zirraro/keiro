import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Combien d'essais nous coûte la qualité, et le plafond est-il au bon niveau ?
 *
 * ── Pourquoi cette route ──
 *
 * Fondateur, 2026-08-14 : « baisse ou augmente le nombre d'essais, on doit
 * comprendre dans les 2 sens et analyser pour s'améliorer constamment. »
 *
 * Il a raison contre la façon dont j'ai posé les plafonds : trois pour une
 * image, deux pour un reel, cinq en sauvetage — trois chiffres décidés en une
 * phrase, sans une seule donnée. Ils sont peut-être trop bas, et on jette des
 * posts qu'un essai de plus aurait sauvés ; peut-être trop hauts, et on paie
 * des reprises qui n'apportent rien. Sans mesure, impossible de savoir dans
 * quel sens se tromper.
 *
 * ── Les deux sens ──
 *
 * On BAISSE le plafond quand les derniers essais n'apportent plus rien : si
 * aucun post n'est jamais sauvé au 4e ou 5e coup, ces essais sont une dépense
 * pure.
 *
 * On MONTE le plafond quand il mord : si beaucoup de posts échouent
 * exactement à la limite, c'est qu'on les abandonne au moment où ils
 * progressaient encore.
 *
 * ── Ce que ça sert vraiment ──
 *
 * Voir si le nombre moyen d'essais BAISSE dans le temps. C'est la seule preuve
 * que les corrections de prompt servent à quelque chose : un système qui
 * s'améliore réussit de plus en plus souvent du premier coup. Si la moyenne
 * stagne, on change des consignes sans effet, et il vaut mieux le savoir.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const jours = Math.min(90, Math.max(3, Number(req.nextUrl.searchParams.get('jours') || 14)));
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();

  const { data: logs } = await supabase
    .from('agent_logs')
    .select('action, data, created_at')
    .in('action', ['reparation_effectuee', 'reparation_epuisee', 'qc_verdict'])
    .gte('created_at', depuis)
    .order('created_at', { ascending: true })
    .limit(3000);

  // Les posts qui n'ont demandé AUCUNE réparation comptent pour un essai : les
  // omettre gonflerait la moyenne et donnerait un système bien pire qu'il n'est.
  const duPremierCoup = (logs || []).filter(l => (l as any).action === 'qc_verdict'
    && (l as any).data?.publiable === true).length;

  const reparations = (logs || []).filter(l => (l as any).action === 'reparation_effectuee');
  const epuisements = (logs || []).filter(l => (l as any).action === 'reparation_epuisee');

  if (reparations.length === 0 && duPremierCoup === 0) {
    return NextResponse.json({
      ok: true, fenetre_jours: jours,
      message: "Aucune donnée sur la période. Le traçage des réparations date du 2026-08-14 : l'analyse deviendra lisible après quelques jours de publication.",
    });
  }

  // ── Répartition par nombre d'essais ──
  const parEssais = new Map<number, number>();
  parEssais.set(1, duPremierCoup);
  for (const r of reparations) {
    const n = Number((r as any).data?.essais || 0);
    if (n > 0) parEssais.set(n, (parEssais.get(n) || 0) + 1);
  }
  for (const e of epuisements) {
    parEssais.set(6, (parEssais.get(6) || 0) + 1);   // 6 = épuisé sans succès
  }

  const total = [...parEssais.values()].reduce((a, b) => a + b, 0);
  const moyenne = total
    ? Math.round(([...parEssais.entries()].reduce((s, [n, c]) => s + n * c, 0) / total) * 100) / 100
    : null;

  // ── Le plafond mord-il, et les derniers essais servent-ils ? ──
  const sauvesAu4ou5 = reparations.filter(r => {
    const g = Number((r as any).data?.essai_gagnant || 0);
    return g >= 4;
  }).length;
  const echouentALaLimite = epuisements.length;

  // ── Les causes qui coûtent des essais ──
  const causes = new Map<string, number>();
  for (const r of [...reparations, ...epuisements]) {
    for (const m of ((r as any).data?.motifs_initiaux || (r as any).data?.motifs || [])) {
      const t = String(m).slice(0, 70);
      causes.set(t, (causes.get(t) || 0) + 1);
    }
  }

  // ── L'évolution : première moitié de la fenêtre contre seconde ──
  //
  // C'est la seule mesure qui dit si on progresse. Une moyenne isolée ne dit
  // rien : 1,8 essai est excellent si on venait de 3, mauvais si on venait de 1,2.
  const milieu = Date.now() - (jours / 2) * 86400000;
  const moyenneSur = (avant: boolean) => {
    const lot = reparations.filter(r => (new Date((r as any).created_at).getTime() < milieu) === avant);
    if (lot.length === 0) return null;
    return Math.round((lot.reduce((s, r) => s + Number((r as any).data?.essais || 1), 0) / lot.length) * 100) / 100;
  };
  const avant = moyenneSur(true);
  const apres = moyenneSur(false);

  // ── La recommandation, écrite en clair ──
  let recommandation: string;
  if (echouentALaLimite > total * 0.15) {
    recommandation = `MONTER le plafond : ${echouentALaLimite} post(s) échouent en butant sur la limite, soit plus de 15 % du total. On les abandonne au moment où ils progressaient encore.`;
  } else if (sauvesAu4ou5 === 0 && reparations.length >= 10) {
    recommandation = "BAISSER le plafond à 3 : aucun post n'a jamais été sauvé au 4e ou 5e essai sur la période. Ces deux essais sont une dépense pure.";
  } else if (moyenne !== null && moyenne <= 1.3) {
    recommandation = `Le système réussit presque toujours du premier coup (${moyenne} essai en moyenne). Le plafond ne mord pas : on peut le laisser, il ne coûte rien.`;
  } else {
    recommandation = `Plafond correct pour l'instant (${moyenne} essai en moyenne, ${sauvesAu4ou5} sauvetage(s) tardif(s)). À revoir si la moyenne dépasse 2.`;
  }

  const tendance = avant !== null && apres !== null
    ? (apres < avant
        ? `On s'améliore : ${avant} → ${apres} essais en moyenne sur la période.`
        : apres > avant
          ? `ATTENTION, on se dégrade : ${avant} → ${apres} essais. Une correction récente a empiré les choses.`
          : `Stable à ${apres} essais — les dernières corrections n'ont rien changé.`)
    : "Pas encore assez d'historique pour dire si on progresse.";

  return NextResponse.json({
    ok: true,
    fenetre_jours: jours,
    tendance,
    recommandation,
    resume: {
      posts_traites: total,
      du_premier_coup: duPremierCoup,
      ont_demande_reparation: reparations.length,
      epuises_sans_succes: epuisements.length,
      essais_moyens: moyenne,
      sauves_au_4e_ou_5e: sauvesAu4ou5,
    },
    repartition_par_essais: [...parEssais.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, c]) => ({ essais: n === 6 ? 'épuisé' : n, posts: c })),
    causes_les_plus_couteuses: [...causes.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([motif, n]) => ({ motif, occurrences: n })),
  });
}
