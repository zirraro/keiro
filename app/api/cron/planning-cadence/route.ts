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

  for (const [cle, liste] of Object.entries(groupes)) {
    const [userId, reseau] = cle.split('|');
    const parJour = cadenceDe(userId === 'sans' ? null : userId, reseau);
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
      data: { examines: posts.length, ecartes, replanifies, en_reserve: enReserve, horizon_jours: HORIZON_JOURS },
      created_at: maintenant,
    });
  } catch { /* la trace ne bloque pas */ }

  return NextResponse.json({ ok: true, examines: posts.length, ecartes, replanifies, en_reserve: enReserve });
}
