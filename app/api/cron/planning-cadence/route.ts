import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Tient le planning à la cadence réellement configurée.
 *
 * ── Ce qu'on a trouvé (2026-08-10) ──
 *
 * Le fondateur demande de réadapter la stratégie. Mesure faite :
 *
 *   cadence configurée : 3 publications Instagram et 1 TikTok par jour
 *   réellement publié  : 1,8 Instagram et 1,4 TikTok par jour
 *   PROGRAMMÉ          : 13 Instagram par jour, jusqu'à 10 TikTok
 *
 * Le calendrier portait quatre fois la cadence prévue — mille publications
 * pour soixante-quinze jours de capacité.
 *
 * Le plafond appliqué au moment de publier empêchait le sur-postage, donc rien
 * ne se voyait sur les comptes. Mais trois choses en découlaient :
 *
 *   · le planning que consulte le client ne voulait rien dire — il y lisait
 *     treize publications un jour où il en partira trois ;
 *   · on payait des générations destinées à être jetées : un post dont le
 *     créneau passe est écarté, et il y en avait quatre sur cinq ;
 *   · surtout, ce stock de contenus voisins sur les mêmes sujets était le
 *     terreau des doublons. Le TikTok republié trois fois venait de là.
 *
 * ── Ce que fait ce passage ──
 *
 * Rien de destructif. Un post en trop repasse en brouillon avec son motif : il
 * reste disponible, et la génération courante peut le reprendre. On ne jette
 * que ce qui ne peut plus servir — un contenu accroché à un événement passé.
 *
 * Tourne une fois par jour. Le calendrier ne peut plus dériver silencieusement.
 */

/** Au-delà, un contenu vieillit mal : sujets d'actualité, offres, saisons. */
const HORIZON_JOURS = 75;

/** Cadence de repli si le client n'a rien configuré. */
const CADENCE_DEFAUT: Record<string, number> = { instagram: 3, tiktok: 1, linkedin: 1 };

/**
 * Contenus accrochés à une date. Publier « Le Tour de France commence » en
 * septembre n'est pas un retard, c'est une erreur — et le lecteur le voit.
 *
 * Bornes de mot obligatoires. Sans elles, « JO » se trouve dans « jour » et le
 * balayage a écarté 124 publications au lieu de 67 lors du premier essai —
 * troisième fois dans la même journée que la recherche par sous-chaîne se
 * retourne contre nous.
 */
const EVENEMENTS: Array<[RegExp, string]> = [
  [/tour de france/i, '07-27'],
  [/\bJO\b|jeux olympiques|olympiques/, '08-11'],
  [/euro 20\d\d|coupe du monde/i, '07-15'],
  [/festival de cannes/i, '05-25'],
  [/f[eê]te des p[eè]res/i, '06-21'],
  [/f[eê]te des m[eè]res/i, '05-31'],
  [/\bsoldes\b/i, '08-05'],
];


/**
 * ── La répartition entre réseaux, pilotée par ce qu'Ami mesure ──
 *
 * 2026-08-10, le fondateur : « avec évidemment notre stratégie adaptive pilotée
 * par AMI ».
 *
 * La cadence était figée : 3 Instagram et 1 TikTok par jour, réglés une fois.
 * Or ce qu'Ami relève depuis un mois dit exactement l'inverse :
 *
 *     TikTok    204 vues par publication (n=33)
 *     Instagram  10 vues par publication (n=16)
 *
 * Vingt fois moins de portée, trois fois plus de volume. On dépensait l'essentiel
 * de la production là où presque personne ne regarde.
 *
 * Ce module garde le VOLUME TOTAL que le client a choisi — c'est sa décision, et
 * elle engage son budget — mais répartit ce volume entre les réseaux selon la
 * portée réellement mesurée.
 *
 * Deux garde-fous. Un plancher d'une publication par jour sur chaque réseau
 * actif : un compte qu'on abandonne se referme, et une mauvaise semaine ne doit
 * pas tuer un canal. Un plafond de trois : au-delà, publier davantage sur un même
 * réseau ne multiplie pas la portée, ça sature l'audience.
 *
 * Sans mesure — compte neuf, réseau fraîchement connecté — on ne touche à rien :
 * la répartition du client fait foi tant qu'on n'a pas de quoi la contredire.
 */
const PLANCHER_PAR_RESEAU = 1;
const PLAFOND_PAR_RESEAU = 3;
const ECHANTILLON_MINIMUM = 8;   // en dessous, le chiffre ne veut rien dire

async function repartitionSelonPortee(
  supabase: any,
  userId: string,
  cadenceChoisie: Record<string, number>,
): Promise<{ cadence: Record<string, number>; motif: string }> {
  const actifs = Object.entries(cadenceChoisie).filter(([, n]) => n > 0);
  if (actifs.length < 2) return { cadence: cadenceChoisie, motif: 'un seul réseau actif' };

  const total = actifs.reduce((s, [, n]) => s + n, 0);
  const depuis = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data: publies } = await supabase
    .from('content_calendar')
    .select('platform, engagement_data')
    .eq('user_id', userId)
    .eq('status', 'published')
    .gte('published_at', depuis)
    .limit(400);

  const portee: Record<string, { n: number; total: number }> = {};
  for (const p of publies || []) {
    const v = (p.engagement_data as any)?.views ?? (p.engagement_data as any)?.view_count;
    if (v == null) continue;
    (portee[p.platform] ||= { n: 0, total: 0 });
    portee[p.platform].n++;
    portee[p.platform].total += Number(v) || 0;
  }

  const moyennes = actifs.map(([reseau]) => {
    const m = portee[reseau];
    return { reseau, moyenne: m && m.n >= ECHANTILLON_MINIMUM ? m.total / m.n : null, n: m?.n || 0 };
  });

  // Tant qu'un réseau n'a pas assez d'observations, on ne redistribue pas :
  // comparer 204 vues sur 33 posts à 10 vues sur 2 posts n'aurait aucun sens.
  if (moyennes.some((m) => m.moyenne === null)) {
    return { cadence: cadenceChoisie, motif: 'mesure insuffisante sur au moins un réseau' };
  }

  const sommePortee = moyennes.reduce((s, m) => s + (m.moyenne || 0), 0);
  if (sommePortee <= 0) return { cadence: cadenceChoisie, motif: 'aucune portée mesurée' };

  const nouvelle: Record<string, number> = {};
  let distribue = 0;
  for (const m of moyennes) {
    const part = Math.round((total * (m.moyenne || 0)) / sommePortee);
    nouvelle[m.reseau] = Math.max(PLANCHER_PAR_RESEAU, Math.min(PLAFOND_PAR_RESEAU, part));
    distribue += nouvelle[m.reseau];
  }

  // Les arrondis, planchers et plafonds font dériver du total voulu : on rend
  // ou on reprend au réseau qui porte le mieux, puis au moins bon.
  const ordre = [...moyennes].sort((a, b) => (b.moyenne || 0) - (a.moyenne || 0));
  let ecart = total - distribue;
  while (ecart !== 0) {
    let bouge = false;
    for (const m of ecart > 0 ? ordre : [...ordre].reverse()) {
      const n = nouvelle[m.reseau];
      if (ecart > 0 && n < PLAFOND_PAR_RESEAU) { nouvelle[m.reseau]++; ecart--; bouge = true; }
      else if (ecart < 0 && n > PLANCHER_PAR_RESEAU) { nouvelle[m.reseau]--; ecart++; bouge = true; }
      if (ecart === 0) break;
    }
    if (!bouge) break;   // plus rien à ajuster sans franchir une borne
  }

  const detail = moyennes.map((m) => `${m.reseau} ${Math.round(m.moyenne || 0)} vues (n=${m.n}) → ${nouvelle[m.reseau]}/j`).join(' · ');
  return { cadence: nouvelle, motif: `réparti sur la portée mesurée — ${detail}` };
}

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** L'occasion est-elle derrière nous à la date où ce post doit sortir ? */
function occasionPassee(accroche: string, dateProgrammee: string): string | null {
  const annee = dateProgrammee.slice(0, 4);
  for (const [motif, finMoisJour] of EVENEMENTS) {
    if (!motif.test(accroche || '')) continue;
    const fin = `${annee}-${finMoisJour}`;
    if (dateProgrammee > fin) return fin;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const maintenant = new Date().toISOString();

  const { data: posts } = await supabase
    .from('content_calendar')
    .select('id, user_id, platform, scheduled_date, hook, qa_quality_score')
    .in('status', ['approved', 'scheduled', 'pending'])
    .gte('scheduled_date', aujourdhui)
    .order('scheduled_date', { ascending: true })
    .limit(1500);

  if (!posts || posts.length === 0) {
    return NextResponse.json({ ok: true, message: 'Rien de programmé' });
  }

  // Cadence par client, telle qu'il l'a réglée.
  const { data: configs } = await supabase
    .from('org_agent_configs')
    .select('user_id, config')
    .eq('agent_id', 'content');
  const cadenceDe = (userId: string | null, reseau: string): number => {
    const c = (configs || []).find((x: any) => x.user_id === userId)?.config || {};
    const cle = reseau === 'instagram' ? 'posts_per_day_ig' : reseau === 'tiktok' ? 'posts_per_day_tt' : 'posts_per_day_li';
    const n = Number(c[cle]);
    return Number.isFinite(n) && n >= 0 ? n : (CADENCE_DEFAUT[reseau] ?? 1);
  };

  let ecartes = 0, replanifies = 0, enReserve = 0;

  // ── 1. Ce qui ne peut plus servir ──
  const restants: any[] = [];
  for (const p of posts) {
    const fin = occasionPassee(p.hook || '', p.scheduled_date);
    if (fin) {
      await supabase.from('content_calendar').update({
        status: 'draft',
        publish_diagnostic: `ecarte_evenement_passe: l'occasion (${fin}) est derrière nous — publier maintenant serait faux`,
        updated_at: maintenant,
      }).eq('id', p.id);
      ecartes++;
    } else restants.push(p);
  }

  // ── 2. Le reste, remis à la cadence, les meilleurs d'abord ──
  const groupes: Record<string, any[]> = {};
  for (const p of restants) {
    const cle = `${p.user_id || 'sans'}|${p.platform}`;
    (groupes[cle] ||= []).push(p);
  }

  // La répartition d'Ami, calculée une fois par client puis appliquée à chacun
  // de ses réseaux — inutile de refaire la mesure trois fois.
  const repartitions: Record<string, Record<string, number>> = {};
  const motifs: Record<string, string> = {};
  for (const cle of Object.keys(groupes)) {
    const userId = cle.split('|')[0];
    if (userId === 'sans' || repartitions[userId]) continue;
    const choisie: Record<string, number> = {};
    for (const r of ['instagram', 'tiktok', 'linkedin']) {
      const n = cadenceDe(userId, r);
      if (n > 0) choisie[r] = n;
    }
    const { cadence, motif } = await repartitionSelonPortee(supabase, userId, choisie);
    repartitions[userId] = cadence;
    motifs[userId] = motif;
  }

  for (const [cle, liste] of Object.entries(groupes)) {
    const [userId, reseau] = cle.split('|');
    const parJour = repartitions[userId]?.[reseau] ?? cadenceDe(userId === 'sans' ? null : userId, reseau);
    if (parJour === 0) continue;   // réseau volontairement coupé : on n'y touche pas

    // La qualité passe devant l'ordre initial : à capacité contrainte, c'est le
    // meilleur contenu qui doit occuper les créneaux.
    liste.sort((a, b) =>
      (b.qa_quality_score ?? 5) - (a.qa_quality_score ?? 5)
      || String(a.scheduled_date).localeCompare(String(b.scheduled_date)));

    const capacite = parJour * HORIZON_JOURS;
    for (let i = 0; i < liste.length; i++) {
      const p = liste[i];
      if (i < capacite) {
        const jour = new Date(Date.now() + Math.floor(i / parJour) * 86400000).toISOString().slice(0, 10);
        if (jour !== p.scheduled_date) {
          await supabase.from('content_calendar').update({ scheduled_date: jour, updated_at: maintenant }).eq('id', p.id);
          replanifies++;
        }
      } else {
        // En réserve, pas supprimé : la génération courante peut le reprendre,
        // et le client le retrouve dans ses brouillons.
        await supabase.from('content_calendar').update({
          status: 'draft',
          publish_diagnostic: 'en_reserve: au-delà de la cadence configurée, gardé pour plus tard',
          updated_at: maintenant,
        }).eq('id', p.id);
        enReserve++;
      }
    }
  }

  try {
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'planning_cadence', status: 'ok',
      data: { examines: posts.length, ecartes, replanifies, en_reserve: enReserve, horizon_jours: HORIZON_JOURS, repartition: repartitions, motifs },
      created_at: maintenant,
    });
  } catch { /* la trace ne bloque pas */ }

  return NextResponse.json({ ok: true, examines: posts.length, ecartes, replanifies, en_reserve: enReserve, repartition: repartitions, motifs });
}
