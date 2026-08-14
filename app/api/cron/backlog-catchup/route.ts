import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PLAN_DAILY_PUBLISH, resolveEffectivePlan } from '@/lib/credits/plan-budget-guard';
import { collecterResultats } from '@/lib/agents/ami-results';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * RATTRAPAGE DU RETARD — reprogrammer, jamais déverser.
 *
 * Incident constaté le 2026-08-05 : 60 posts d'un même client restaient
 * programmés dans le passé, le plus ancien datant du 22 avril. Aucune erreur,
 * aucun essai — le publieur ne traite qu'UN post par créneau (pour étaler les
 * publications sur la journée), et la génération produisait plus vite que la
 * publication. Le retard grossissait donc mécaniquement, sans jamais déclencher
 * d'alerte puisque rien n'échouait.
 *
 * ── Ce que ce cron fait ──
 *
 * Il ne publie rien. Il REPROGRAMME les posts en retard sur des dates et des
 * heures à venir, ce qui les remet dans le circuit normal de publication.
 *
 * Deux règles imposées par le fondateur :
 *
 *   « on ne publie pas tout d'un coup, jamais — on peut augmenter le volume
 *     ×3 max le temps de publier le retard, mais jamais plus »
 *
 *   « et toujours à des horaires analysés, différents, optimisés »
 *
 * Le plafond ×3 est appliqué par plateforme et par jour à partir de la cadence
 * du plan. Rattraper d'un coup ferait exactement le contraire du service rendu :
 * une salve de dix posts en une heure fait chuter la portée du compte et
 * ressemble à du spam pour l'algorithme comme pour l'abonné.
 *
 * Les heures ne sont pas prises dans une liste fixe : on les tire du relevé de
 * performance PAR HEURE du client lui-même — les tranches où SES posts ont le
 * mieux marché — et on les fait tourner pour ne pas publier tous les jours à
 * la même minute, ce qui est un signal de compte automatisé.
 */

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Le plafond de rattrapage : jamais plus du triple de la cadence normale. */
const FACTEUR_RATTRAPAGE = 3;

/**
 * Horizon de reprogrammation.
 *
 * Premier passage réel : un client avait 413 posts en retard, que le plafond
 * ×3 étalait jusqu'en janvier 2027. Ce n'est plus un rattrapage, c'est un
 * enterrement — un post écrit en avril et publié six mois plus tard est
 * périmé, et il occupe un créneau qu'un contenu frais aurait mieux rempli.
 *
 * Au-delà de cette limite, on arrête de programmer : le reste est renvoyé en
 * bibliothèque, où il reste disponible pour le recyclage sans encombrer le
 * calendrier ni faire croire à une livraison à venir.
 */
const HORIZON_JOURS = 45;

/** Créneaux de repli quand le client n'a pas encore d'historique exploitable. */
const HEURES_DEFAUT = ['09:15', '12:30', '18:45'];

/**
 * Les meilleures heures de CE client, tirées de ses propres résultats.
 *
 * On exige au moins 3 posts mesurés dans une tranche pour la retenir : en
 * dessous, on classerait des tranches sur un seul post, et « la meilleure
 * heure » ne serait qu'un accident.
 */
async function meilleuresHeures(supabase: any, userId: string): Promise<string[]> {
  try {
    const res = await collecterResultats(supabase, userId, 60);
    const contenu = res.canaux.find(c => c.canal === 'contenu');
    const parHeure: Record<string, { moyenne: number | null; n: number }> = contenu?.detail?.par_heure || {};

    const classees = Object.entries(parHeure)
      .filter(([, v]) => v.n >= 3 && v.moyenne !== null)
      .sort((a, b) => (b[1].moyenne || 0) - (a[1].moyenne || 0))
      .slice(0, 4)
      .map(([tranche]) => tranche);

    if (!classees.length) return HEURES_DEFAUT;

    // « 18h-20h » → une minute tirée dans la tranche, différente à chaque
    // position : publier à 18:00 pile tous les jours signale l'automate.
    return classees.map((tranche, i) => {
      const debut = parseInt(tranche.slice(0, 2), 10);
      const minute = [7, 23, 41, 52][i % 4];
      const heure = debut + (i % 2);
      return `${String(heure).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    });
  } catch {
    return HEURES_DEFAUT;
  }
}

async function rattraperClient(supabase: any, client: any) {
  const userId = client.id;
  const aujourdhui = new Date().toISOString().slice(0, 10);

  // Les posts prêts à partir mais coincés dans le passé. On ne touche ni aux
  // brouillons (pas encore validés par le contrôle qualité) ni aux posts que
  // le client doit approuver : les remettre en file serait décider à sa place.
  const { data: enRetard } = await supabase
    .from('content_calendar')
    .select('id, platform, scheduled_date, format')
    .eq('user_id', userId)
    .in('status', ['approved', 'publish_failed'])
    .lt('scheduled_date', aujourdhui)
    .order('scheduled_date', { ascending: true })
    .limit(500);

  if (!enRetard?.length) return { userId, statut: 'a_jour', reprogrammes: 0 };

  const plan = await resolveEffectivePlan(supabase, userId, 'content');
  const cadence = PLAN_DAILY_PUBLISH[plan] || PLAN_DAILY_PUBLISH.free;
  const heures = await meilleuresHeures(supabase, userId);

  // ── Un plafond ABSOLU, en plus du triple de la cadence ──
  //
  // Fondateur, 2026-08-12, à propos de la reprise après une clé révoquée : « on
  // doit publier ce qui était prévu, mais pas plus de 3 posts par jour si
  // accumulés, et à des heures différentes, jamais en même temps. »
  //
  // Le triple de la cadence ne suffit pas à le garantir : un client à trois
  // publications par jour se retrouverait à NEUF pendant le rattrapage. Or ce
  // qui fait chuter la portée d'un compte, ce n'est pas le retard, c'est la
  // salve — et un compte qui vient de se reconnecter est justement celui qu'il
  // faut ménager.
  //
  // On retient donc la plus stricte des deux bornes.
  const PLAFOND_ABSOLU_JOUR = 3;
  const plafondJour = (plateforme: string) => {
    const base = plateforme === 'instagram' ? cadence.ig : plateforme === 'tiktok' ? cadence.tt : cadence.li;
    return Math.min(base * FACTEUR_RATTRAPAGE, PLAFOND_ABSOLU_JOUR);
  };

  // Ce qui est DÉJÀ programmé sur les jours à venir compte dans le plafond :
  // sinon le rattrapage viendrait s'empiler sur le calendrier normal et on
  // dépasserait le triple sans s'en apercevoir.
  const { data: aVenir } = await supabase
    .from('content_calendar')
    .select('platform, scheduled_date')
    .eq('user_id', userId)
    .in('status', ['approved', 'draft', 'pending_approval'])
    .gte('scheduled_date', aujourdhui)
    .limit(1000);

  const occupation = new Map<string, number>();
  for (const p of aVenir || []) {
    const cle = `${p.scheduled_date}|${p.platform}`;
    occupation.set(cle, (occupation.get(cle) || 0) + 1);
  }

  const reprogrammes: Array<{ id: string; vers: string; heure: string }> = [];
  const renvoyesEnBibliotheque: string[] = [];
  let curseurJour = 0;
  let position = 0;

  for (const post of enRetard) {
    const plafond = plafondJour(post.platform);
    if (plafond <= 0) continue;

    // On avance de jour en jour jusqu'à trouver de la place sous le plafond,
    // sans jamais dépasser l'horizon.
    let place: string | null = null;
    for (let j = curseurJour; j < HORIZON_JOURS; j++) {
      const jour = new Date(Date.now() + j * 86400000).toISOString().slice(0, 10);
      const cle = `${jour}|${post.platform}`;
      if ((occupation.get(cle) || 0) < plafond) {
        occupation.set(cle, (occupation.get(cle) || 0) + 1);
        place = jour;
        curseurJour = j;
        break;
      }
    }
    if (!place) { renvoyesEnBibliotheque.push(post.id); continue; }

    const heure = heures[position % heures.length];
    position++;

    const { error } = await supabase.from('content_calendar').update({
      scheduled_date: place,
      scheduled_time: `${heure}:00`,
      status: 'approved',
      publish_diagnostic: `rattrapage backlog — reprogrammé depuis ${post.scheduled_date}`,
      updated_at: new Date().toISOString(),
    }).eq('id', post.id);

    if (!error) reprogrammes.push({ id: post.id, vers: place, heure });
  }

  // Le surplus sort du calendrier sans être perdu : il redevient du stock
  // recyclable. Le laisser en « approved » sur une date passée le ferait
  // ressortir en retard à chaque passage, indéfiniment.
  if (renvoyesEnBibliotheque.length) {
    await supabase.from('content_calendar')
      .update({
        status: 'skipped',
        publish_diagnostic: `retard au-delà de ${HORIZON_JOURS} j — renvoyé en bibliothèque, disponible au recyclage`,
        updated_at: new Date().toISOString(),
      })
      .in('id', renvoyesEnBibliotheque);
  }

  if (reprogrammes.length || renvoyesEnBibliotheque.length) {
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'backlog_catchup', status: 'ok', user_id: userId,
      data: {
        en_retard: enRetard.length,
        reprogrammes: reprogrammes.length,
        renvoyes_en_bibliotheque: renvoyesEnBibliotheque.length,
        horizon_jours: HORIZON_JOURS,
        plan, facteur: FACTEUR_RATTRAPAGE,
        plafonds: { instagram: plafondJour('instagram'), tiktok: plafondJour('tiktok'), linkedin: plafondJour('linkedin') },
        heures_retenues: heures,
        premier: reprogrammes[0], dernier: reprogrammes[reprogrammes.length - 1],
      },
      created_at: new Date().toISOString(),
    });
  }

  return {
    userId, statut: 'rattrape',
    en_retard: enRetard.length,
    reprogrammes: reprogrammes.length,
    renvoyes_en_bibliotheque: renvoyesEnBibliotheque.length,
    heures,
    etale_jusqu_au: reprogrammes[reprogrammes.length - 1]?.vers ?? null,
  };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const cible = req.nextUrl.searchParams.get('user_id');

  // ══════════════════════════════════════════════════════════════════════════
  // Les réservations abandonnées, rendues avant tout le reste
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ── Ce qu'on a trouvé le 14 août ──
  //
  // 44 posts en statut « publishing », dont un depuis le 18 juin. Deux mois.
  //
  // Le statut « publishing » est une RÉSERVATION : on le pose avant de parler
  // au réseau social, pour que deux exécutions ne publient pas le même post en
  // même temps. Il doit être rendu quoi qu'il arrive. Or plusieurs sorties
  // anticipées — plafond journalier atteint, espacement insuffisant — ne le
  // rendaient pas. Le post restait réservé pour toujours.
  //
  // Et il ne repart jamais tout seul : le cron ne reprend que les posts
  // programmés ou approuvés. Un post confisqué est un post perdu, sans erreur,
  // sans alerte, sans que le client sache qu'il ne recevra rien.
  //
  // ── Pourquoi un balai en plus du correctif ──
  //
  // Les sorties fautives sont corrigées à la source. Mais une réservation peut
  // aussi se perdre autrement : un processus tué en plein vol, un
  // redéploiement au mauvais moment, un délai réseau. Le correctif traite les
  // causes connues ; le balai traite celles qu'on ne connaît pas encore.
  //
  // Deux heures de seuil : très au-delà de la plus lente de nos publications
  // (un reel TikTok prend quelques minutes), assez court pour rattraper la
  // journée même.
  let reservationsRendues = 0;
  try {
    const limite = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const { data: bloques } = await supabase
      .from('content_calendar')
      .select('id')
      .eq('status', 'publishing')
      .lt('updated_at', limite)
      .limit(500);
    if (bloques && bloques.length > 0) {
      const { error } = await supabase
        .from('content_calendar')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .in('id', bloques.map((b: any) => b.id))
        .eq('status', 'publishing'); // on ne touche qu'à ce qui est ENCORE réservé
      if (error) console.error('[catchup] libération des réservations impossible :', error.message);
      else {
        reservationsRendues = bloques.length;
        console.warn(`[catchup] ${reservationsRendues} réservation(s) abandonnée(s) rendues — ces posts repartiront au prochain créneau`);
      }
    }
  } catch (e: any) {
    console.error('[catchup] balai des réservations en échec :', e?.message);
  }

  let requete = supabase
    .from('profiles')
    .select('id, subscription_plan, is_admin')
    .not('subscription_plan', 'is', null)
    .neq('subscription_plan', 'free')
    .limit(500);
  if (cible) requete = requete.eq('id', cible);

  const { data: clients, error } = await requete;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const resultats: any[] = [];
  for (const client of clients || []) {
    try {
      resultats.push(await rattraperClient(supabase, client));
    } catch (e: any) {
      resultats.push({ userId: client.id, statut: 'erreur', erreur: String(e?.message || e).slice(0, 200) });
    }
  }

  return NextResponse.json({
    ok: true,
    facteur_max: FACTEUR_RATTRAPAGE,
    clients: resultats.length,
    reprogrammes_total: resultats.reduce((s, r) => s + (r.reprogrammes || 0), 0),
    resultats,
  });
}
