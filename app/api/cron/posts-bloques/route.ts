import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Débloque les posts que le contrôle qualité a retenus et que personne n'a
 * jamais remplacés.
 *
 * ── Ce qu'on a trouvé (2026-08-07) ──
 *
 * Le fondateur signale des publications annoncées et jamais parties. En base :
 * trente posts en `draft` ou `pending_approval` dont le créneau est passé,
 * chez deux clients, certains créés en AVRIL. Tous retenus par le contrôle
 * qualité — notes trop basses après réécriture, images hors-sujet, une preuve
 * inventée dans une légende.
 *
 * Le contrôle a bien fait son travail : ce contenu ne devait pas partir. Mais
 * rien ne prenait le relais. Les posts restaient là, le client ne recevait
 * rien, et personne ne le savait — la définition même de la panne silencieuse.
 *
 * ── Pourquoi on écarte au lieu de republier ──
 *
 * Un post dont le créneau est passé ne se rattrape pas : l'occasion n'existe
 * plus, et le publier avec trois semaines de retard est pire que de ne rien
 * publier. On l'écarte donc proprement, avec sa raison, et c'est la génération
 * courante qui remplit les créneaux à venir.
 *
 * On ne touche JAMAIS aux posts dont le créneau est encore devant : ceux-là
 * peuvent encore être réparés ou validés.
 */

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Au-delà de ce délai, le créneau est considéré comme définitivement perdu.
 *
 * Ramené de 2 jours à 1 le 2026-08-09. Le fondateur : « les points reviennent
 * tous les jours, pourquoi ? Règle-les définitivement, je ne dois plus les voir
 * revenir. »
 *
 * Avec deux jours de grâce, un post retenu le lundi était signalé lundi, mardi
 * ET mercredi matin avant d'être écarté — trois alertes pour un seul incident.
 * Le rapport devenait du bruit, et le bruit finit par masquer les vrais cas.
 *
 * Un jour suffit : le créneau d'hier est passé, et le rattrapage de la journée
 * a déjà eu lieu. Ce qui n'est pas parti hier ne partira pas.
 */
const JOURS_DE_GRACE = 1;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
  }

  const supabase = supa();
  const limite = new Date(Date.now() - JOURS_DE_GRACE * 86400000).toISOString().slice(0, 10);

  const { data: bloques, error } = await supabase
    .from('content_calendar')
    .select('id, user_id, platform, status, scheduled_date, publish_diagnostic')
    .in('status', ['draft', 'pending_approval'])
    .lt('scheduled_date', limite)
    .is('published_at', null)
    .limit(500);

  if (error) {
    console.error('[PostsBloques]', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const parClient = new Map<string, { total: number; plateformes: Set<string>; raisons: Set<string> }>();
  let ecartes = 0;

  for (const p of bloques || []) {
    // Un post sans propriétaire n'est pas une livraison client : on le laisse
    // à l'écart plutôt que de gonfler des compteurs qui ne veulent rien dire.
    if (!p.user_id) continue;

    const diag = String(p.publish_diagnostic || '');
    const { error: errMaj } = await supabase
      .from('content_calendar')
      // 'skipped' est la seule valeur non publiée acceptée par la contrainte
      // CHECK sur cette colonne — un statut inventé ferait rejeter la mise à
      // jour en silence, ce qui nous est déjà arrivé.
      .update({
        status: 'skipped',
        publish_diagnostic: `creneau_perdu_apres_qc — ${diag || 'retenu par le contrôle qualité'}`.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', p.id);

    if (errMaj) {
      console.warn('[PostsBloques] mise à jour refusée pour', p.id, errMaj.message);
      continue;
    }

    ecartes++;
    const g = parClient.get(p.user_id) || { total: 0, plateformes: new Set<string>(), raisons: new Set<string>() };
    g.total++;
    g.plateformes.add(p.platform || 'instagram');
    g.raisons.add(diag.split(':')[0].split('(')[0].trim().slice(0, 40) || 'qualité insuffisante');
    parClient.set(p.user_id, g);
  }

  // La trace est ce qui permet de voir si le problème se reproduit. Sans elle,
  // on nettoie et on oublie — et le trou se recreuse sans bruit.
  for (const [userId, g] of parClient) {
    try {
      await supabase.from('agent_logs').insert({
        agent: 'content',
        action: 'posts_bloques_ecartes',
        user_id: userId,
        status: 'warning',
        data: {
          total: g.total,
          plateformes: [...g.plateformes],
          raisons: [...g.raisons],
        },
        created_at: new Date().toISOString(),
      });
    } catch { /* la trace ne doit pas faire échouer le nettoyage */ }
  }

  console.log(`[PostsBloques] ${ecartes} post(s) écarté(s) chez ${parClient.size} client(s)`);

  return NextResponse.json({
    ok: true,
    ecartes,
    clients: parClient.size,
    detail: [...parClient.entries()].map(([userId, g]) => ({
      userId,
      total: g.total,
      plateformes: [...g.plateformes],
      raisons: [...g.raisons],
    })),
  });
}
