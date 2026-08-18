import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * La production sert-elle bien le dernier commit ?
 *
 * ── Pourquoi ce contrôle existe ──
 *
 * Fondateur, 18 août : « les déploiements sont censés fonctionner avec toutes
 * les mises à jour qu'on a faites. Là je sais que le réseau sur lequel on est
 * connecté en SSH ne fonctionnera pas, on passe par jeton GitHub — mais faut
 * pas, comme on switche de réseau, qu'on rate des mises à jour. »
 *
 * Il a raison, et le 17 août l'a prouvé : trois déploiements de suite ont
 * dépassé la limite de temps du job. GitHub les marque « cancelled », ce qui
 * n'est ni un succès ni un échec — donc aucune alerte, aucun mail, rien. Quatre
 * correctifs sont restés hors ligne une demi-journée pendant que je croyais les
 * avoir livrés. La production répondait normalement : elle servait simplement
 * du code vieux d'un jour.
 *
 * Un déploiement raté ne se signale pas tout seul. Ce contrôle le fait :
 * il compare le commit SERVI au dernier commit de la branche, et alerte quand
 * l'écart dure. Aucun jeton n'est nécessaire — l'API publique de GitHub suffit,
 * donc le contrôle marche depuis n'importe quel réseau, y compris ceux d'où
 * SSH est refusé.
 *
 * ── Pourquoi un délai de grâce ──
 *
 * Un déploiement prend cinq minutes. Alerter à la seconde où un commit part
 * ferait du bruit à chaque poussée, et le fondateur a une règle claire : une
 * alerte qui répète une décision déjà prise est du bruit. On attend donc
 * quarante minutes — largement au-delà d'un déploiement normal, largement en
 * deçà d'une demi-journée perdue.
 */

const DEPOT = process.env.GITHUB_REPO || 'zirraro/keiro';
const GRACE_MINUTES = 40;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // ── Le commit attendu, lu chez GitHub ──
  let attendu = '';
  let dateCommit = '';
  let messageCommit = '';
  try {
    const r = await fetch(`https://api.github.com/repos/${DEPOT}/commits/main`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'keiroai-deploy-check' },
      cache: 'no-store',
    });
    if (!r.ok) {
      // On ne sait pas : ce n'est pas un incident de déploiement, on se tait.
      return NextResponse.json({ ok: true, indetermine: `github HTTP ${r.status}` });
    }
    const j: any = await r.json();
    attendu = String(j.sha || '').slice(0, 7);
    dateCommit = j.commit?.committer?.date || j.commit?.author?.date || '';
    messageCommit = String(j.commit?.message || '').split('\n')[0].slice(0, 140);
  } catch (e: any) {
    return NextResponse.json({ ok: true, indetermine: e?.message });
  }

  // ── Le commit réellement servi ──
  let servi = '';
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
    const r = await fetch(`${base}/api/version`, { cache: 'no-store' });
    const j: any = await r.json();
    servi = String(j.shortSha || j.sha || '').slice(0, 7);
  } catch (e: any) {
    return NextResponse.json({ ok: true, indetermine: `version illisible : ${e?.message}` });
  }

  if (!attendu || !servi) return NextResponse.json({ ok: true, indetermine: 'sha manquant' });
  if (attendu === servi) {
    return NextResponse.json({ ok: true, a_jour: true, sha: servi });
  }

  const ageMinutes = dateCommit ? Math.round((Date.now() - new Date(dateCommit).getTime()) / 60000) : 0;
  if (ageMinutes < GRACE_MINUTES) {
    return NextResponse.json({ ok: true, a_jour: false, en_cours: true, attendu, servi, age_minutes: ageMinutes });
  }

  // ── L'écart dure : c'est un déploiement perdu ──
  const supabase = sb();
  const detail = `La production sert ${servi} alors que la branche est à ${attendu} depuis ${ageMinutes} min — « ${messageCommit} »`;
  console.error(`[Déploiement] ${detail}`);

  try {
    await supabase.from('agent_logs').insert({
      agent: 'ops', action: 'deploiement_manquant', status: 'error',
      error_message: detail.slice(0, 500),
      data: { attendu, servi, age_minutes: ageMinutes, message: messageCommit, depot: DEPOT },
      created_at: new Date().toISOString(),
    });
  } catch { /* la trace ne bloque pas l'alerte */ }

  // Une seule alerte par commit manquant : on ne réveille pas le fondateur
  // toutes les heures pour le même écart. La ligne de journal, elle, reste.
  try {
    const { data: dejaAlerte } = await supabase
      .from('agent_logs')
      .select('id')
      .eq('action', 'deploiement_manquant_alerte')
      .contains('data', { attendu })
      .limit(1);
    if (!dejaAlerte?.length) {
      const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
      await sendEmailWithFallback({
        to: 'contact@keiroai.com',
        subject: `⚠️ Déploiement perdu — la production sert ${servi}, la branche est à ${attendu}`,
        html: `<p>${detail}</p>
<p>Un job GitHub qui dépasse sa limite de temps est marqué « cancelled » : ni succès ni échec, donc aucune alerte. C'est arrivé trois fois de suite le 17 août.</p>
<p>À faire : relancer le déploiement depuis GitHub Actions. Aucun accès SSH n'est nécessaire.</p>`,
      });
      await supabase.from('agent_logs').insert({
        agent: 'ops', action: 'deploiement_manquant_alerte', status: 'warning',
        data: { attendu, servi }, created_at: new Date().toISOString(),
      });
    }
  } catch (e: any) {
    console.warn('[Déploiement] alerte non envoyée :', e?.message);
  }

  return NextResponse.json({ ok: true, a_jour: false, attendu, servi, age_minutes: ageMinutes, alerte: true });
}
