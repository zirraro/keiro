import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { BAREME, CLASSES } from '@/lib/prospects/scoring-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * LA BOUCLE D'APPRENTISSAGE — quel signal prédit réellement une signature.
 *
 * C'est la partie que le fondateur a désignée comme la plus importante, et il a
 * raison : le barème est une hypothèse écrite un mardi soir. Sans mesure, on le
 * garderait des années par habitude, en croyant qu'il trie alors qu'il ne fait
 * que classer.
 *
 * ── Ce qu'on mesure ──
 *
 * Deux choses distinctes, qu'il ne faut pas confondre :
 *
 *   Le taux de signature PAR CLASSE dit si le tri fonctionne globalement. Si A
 *   et C signent pareil, le barème entier ne sert à rien.
 *
 *   Le taux PAR SIGNAL dit quelle règle porte le résultat. C'est le seul moyen
 *   de jeter celles qui ne prédisent rien — et il y en aura, c'est normal.
 *
 * ── L'écueil de l'échantillon ──
 *
 * Sur vingt visites, un signal présent trois fois dont une signature affiche
 * 33 % et ne veut rien dire. On affiche donc systématiquement l'effectif, et on
 * refuse de conclure en dessous d'un seuil. Sans ça, on jetterait de bons
 * signaux et on garderait des accidents.
 */

const SEUIL_CONCLUSION = 10;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Une visite comptabilisée : celles où le résultat est connu. */
const RESULTATS_CONNUS = ['signe', 'refus', 'absent'];

function taux(succes: number, total: number): number | null {
  if (!total) return null;
  return Math.round((succes / total) * 1000) / 10;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const parCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  const { user } = parCron ? { user: null } : await getAuthUser();
  if (!parCron && !user) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });

  const supabase = sb();
  const cible = req.nextUrl.searchParams.get('user_id') || user?.id;

  let q = supabase
    .from('crm_prospects')
    .select('classe_terrain, score_terrain, score_details, statut_prospection, resultat_visite, date_visite')
    .not('statut_prospection', 'is', null)
    .in('statut_prospection', RESULTATS_CONNUS)
    .limit(2000);
  if (cible) q = q.eq('created_by', cible);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const visites = data || [];
  const signe = (p: any) => p.statut_prospection === 'signe';

  // ── Par classe ──
  const parClasse: Record<string, { visites: number; signatures: number; taux: number | null }> = {};
  for (const c of ['A', 'B', 'C']) {
    const lot = visites.filter((p: any) => p.classe_terrain === c);
    parClasse[c] = { visites: lot.length, signatures: lot.filter(signe).length, taux: taux(lot.filter(signe).length, lot.length) };
  }

  // ── Par signal ──
  //
  // On compare le taux de signature quand le signal EST présent à celui quand
  // il ne l'est pas. Un signal qui n'apporte rien affiche le même taux dans les
  // deux cas — et c'est cet écart, pas le taux brut, qui dit s'il prédit.
  const parSignal = BAREME.map(regle => {
    const avec = visites.filter((p: any) => (p.score_details?.regles || []).some((r: any) => r.cle === regle.cle));
    const sans = visites.filter((p: any) => !(p.score_details?.regles || []).some((r: any) => r.cle === regle.cle));
    const tAvec = taux(avec.filter(signe).length, avec.length);
    const tSans = taux(sans.filter(signe).length, sans.length);
    const ecart = tAvec !== null && tSans !== null ? Math.round((tAvec - tSans) * 10) / 10 : null;

    return {
      signal: regle.cle,
      points_actuels: regle.points,
      hypothese: regle.hypothese,
      observations: avec.length,
      taux_avec: tAvec,
      taux_sans: tSans,
      ecart,
      // Le verdict n'est pas une décision : c'est une lecture, à confronter au
      // terrain avant de toucher au barème.
      lecture: avec.length < SEUIL_CONCLUSION
        ? `pas assez d'observations (${avec.length}/${SEUIL_CONCLUSION}) — ne rien conclure`
        : ecart === null ? 'incalculable'
        : ecart > 8 ? 'prédit nettement — mériterait plus de points'
        : ecart > 2 ? 'prédit un peu — points cohérents'
        : ecart < -8 ? 'prédit L\'INVERSE — le signe des points est probablement faux'
        : 'ne prédit rien de mesurable — candidat au retrait',
    };
  }).sort((a, b) => (b.ecart ?? -999) - (a.ecart ?? -999));

  const total = visites.length;
  const signatures = visites.filter(signe).length;

  return NextResponse.json({
    ok: true,
    seuil_conclusion: SEUIL_CONCLUSION,
    seuils_classes: CLASSES,
    visites_avec_resultat: total,
    signatures,
    taux_global: taux(signatures, total),
    par_classe: parClasse,
    par_signal: parSignal,
    // Le tri marche-t-il ? La seule question qui compte au niveau global.
    verdict_tri: total < SEUIL_CONCLUSION * 2
      ? `échantillon trop faible (${total} visites) — continuer à remplir les résultats avant d'interpréter`
      : (parClasse.A.taux ?? 0) > (parClasse.C.taux ?? 0) + 5
        ? 'le tri fonctionne : les A signent nettement plus que les C'
        : 'le tri ne se distingue pas du hasard — le barème est à revoir en profondeur',
  });
}
