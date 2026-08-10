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
 * ── Chaque réseau a sa propre cadence, jugée sur ses propres résultats ──
 *
 * 2026-08-10, correction du fondateur : « ATTENTION, on sépare quand même les
 * réseaux sociaux en termes de cadence, mais on analyse les résultats
 * intrinsèques de chacun et on adapte la stratégie PAR RÉSEAU. »
 *
 * La version précédente mutualisait un volume total et le répartissait selon la
 * portée comparée — TikTok fait vingt fois mieux qu'Instagram, donc TikTok
 * prend le volume d'Instagram. C'était une erreur de raisonnement : les deux
 * réseaux n'ont ni la même audience, ni le même coût de production, ni le même
 * stock de contenu prêt. Comparer leurs portées pour arbitrer entre eux revient
 * à fermer un canal parce qu'un autre marche mieux.
 *
 * Chaque réseau est donc jugé SEUL, sur son évolution à lui :
 *
 *   · TikTok — 2 par jour. Le fondateur : « je veux bien publier plus sur
 *     TikTok, mais le coût de génération je veux pouvoir le monitorer, donc
 *     2 fois par jour, ça coûte suffisamment cher. » Le plafond est ici une
 *     décision de budget, pas de performance : chaque TikTok est une vidéo, et
 *     une vidéo se paie.
 *
 *   · Instagram — 3 par jour. « On a déjà un reliquat qui a passé le contrôle
 *     qualité, donc on peut monter à 3 par jour. » Le contenu est déjà produit
 *     et validé : le publier ne coûte plus rien.
 *
 * Ce que l'adaptation regarde, réseau par réseau : la portée de ce réseau
 * PROGRESSE-T-ELLE ? Une baisse franche fait ralentir — inutile d'insister
 * quand l'algorithme ne pousse plus. Une hausse franche autorise un cran de
 * plus, dans la limite du plafond que le client a fixé pour son budget.
 */
const CADENCE_PAR_RESEAU: Record<string, number> = {
  tiktok: 2,       // décision de coût : une vidéo par publication
  instagram: 3,    // stock déjà produit et validé
  linkedin: 1,
};

/** En dessous, une variation ne veut rien dire. */
const ECHANTILLON_MINIMUM = 6;

async function cadenceDuReseau(
  supabase: any,
  userId: string,
  reseau: string,
  plafondClient: number,
): Promise<{ parJour: number; motif: string }> {
  const base = Math.min(plafondClient, CADENCE_PAR_RESEAU[reseau] ?? 1);
  if (base === 0) return { parJour: 0, motif: 'réseau coupé par le client' };

  const { data: publies } = await supabase
    .from('content_calendar')
    .select('engagement_data, published_at, tiktok_permalink')
    .eq('user_id', userId)
    .eq('platform', reseau)
    .eq('status', 'published')
    .gte('published_at', new Date(Date.now() - 60 * 86400000).toISOString())
    .order('published_at', { ascending: false })
    .limit(200);

  // Dédoublonnage par vidéo réelle : jusqu'au 10 août, deux lignes du
  // calendrier pouvaient porter la même vidéo TikTok et donc les mêmes vues.
  // Compter ces lignes deux fois gonflerait la portée et ferait accélérer une
  // cadence sur un chiffre faux.
  const vues = new Map<string, { v: number; t: number }>();
  for (const p of publies || []) {
    const v = (p.engagement_data as any)?.views ?? (p.engagement_data as any)?.view_count;
    if (v == null) continue;
    const cle = (p.tiktok_permalink || '').match(/video\/(\d+)/)?.[1] || String(p.published_at);
    const t = new Date(p.published_at).getTime();
    const dejaLa = vues.get(cle);
    if (!dejaLa || Number(v) > dejaLa.v) vues.set(cle, { v: Number(v) || 0, t });
  }

  const serie = [...vues.values()].sort((a, b) => b.t - a.t);
  if (serie.length < ECHANTILLON_MINIMUM * 2) {
    return { parJour: base, motif: `pas assez de recul (${serie.length} publications mesurées)` };
  }

  const moitie = Math.floor(serie.length / 2);
  const moyenne = (arr: typeof serie) => arr.reduce((s, x) => s + x.v, 0) / Math.max(1, arr.length);
  const recent = moyenne(serie.slice(0, moitie));
  const ancien = moyenne(serie.slice(moitie));
  if (ancien <= 0) return { parJour: base, motif: 'aucune portée antérieure comparable' };

  const evolution = (recent - ancien) / ancien;

  // Un cran, jamais deux : une cadence qui saute d'un extrême à l'autre casse
  // la régularité, et c'est la régularité qui construit une audience.
  if (evolution < -0.4) {
    return { parJour: Math.max(1, base - 1), motif: `portée en baisse de ${Math.round(evolution * -100)} % — on ralentit d'un cran` };
  }
  if (evolution > 0.4 && base < plafondClient) {
    return { parJour: base + 1, motif: `portée en hausse de ${Math.round(evolution * 100)} % — un cran de plus` };
  }
  return { parJour: base, motif: `portée stable (${Math.round(recent)} vues de moyenne) — cadence maintenue` };
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

  // Une cadence par COUPLE client × réseau : chacun jugé sur ses propres
  // résultats, jamais l'un contre l'autre.
  const repartitions: Record<string, number> = {};
  const motifs: Record<string, string> = {};
  for (const cle of Object.keys(groupes)) {
    const [userId, reseau] = cle.split('|');
    if (userId === 'sans') continue;
    const { parJour, motif } = await cadenceDuReseau(supabase, userId, reseau, cadenceDe(userId, reseau));
    repartitions[cle] = parJour;
    motifs[cle] = motif;
  }

  for (const [cle, liste] of Object.entries(groupes)) {
    const [userId, reseau] = cle.split('|');
    const parJour = repartitions[cle] ?? cadenceDe(userId === 'sans' ? null : userId, reseau);
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
