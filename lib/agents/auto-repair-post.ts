/**
 * Réparation autonome d'un post recalé, AVANT publication.
 *
 * Demande du fondateur (2026-08-05) : « on n'envoie pas de mail au client
 * "ce visuel n'a pas passé le contrôle qualité" — on vérifie nous-mêmes le
 * contrôle qualité et on régénère au besoin, nous-mêmes, selon nos standards. »
 *
 * ── Pourquoi c'est la bonne règle ──
 *
 * Un email « votre post n'a pas passé notre contrôle » transfère au client un
 * problème qui est le nôtre. Il n'a pas acheté un poste de relecteur : il a
 * acheté un compte qui publie du bon contenu. Chaque notification de ce type
 * lui coûte une décision, et lui apprend surtout que notre production n'est pas
 * fiable.
 *
 * La bonne réponse à un contrôle qui échoue est donc de corriger. Le texte est
 * réécrit à partir de ce que MONTRE le visuel, puis recontrôlé — une réécriture
 * non revérifiée ne vaut pas mieux que le texte qu'elle remplace.
 *
 * ── Ce qu'on fait quand la réparation échoue ──
 *
 * On ne publie pas, et on n'écrit pas non plus au client. Le post est mis de
 * côté et le créneau se remplit autrement (recyclage bibliothèque, backlog).
 * Publier quand même contredirait l'exigence de qualité ; écrire au client
 * contredirait la consigne. Le silence vers le client n'est pas de l'opacité :
 * l'incident part vers la supervision admin, où il doit être traité.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type MotifRecalage = 'coherence' | 'kit_marque' | 'date_perimee';

export interface ResultatReparation {
  repare: boolean;
  motif: MotifRecalage;
  /** Ce qui a été changé, pour la trace. */
  detail: string;
  caption?: string;
  hashtags?: string[];
}

/** Au-delà, on s'acharne : le problème vient du visuel, pas du texte. */
const TENTATIVES_MAX = 2;

/**
 * Tente de rendre un post publiable.
 *
 * `coherence` et `kit_marque` portent sur le texte : réécrire depuis l'image
 * les résout. `date_perimee` est différent — le post parle d'un événement
 * passé, et aucune réécriture ne le rend pertinent. On le retire du jour même
 * plutôt que de le maquiller.
 */
export async function reparerPost(
  supabase: SupabaseClient,
  post: { id: string; caption?: string | null; hook?: string | null; visual_url?: string | null; platform?: string | null; format?: string | null },
  motif: MotifRecalage,
  detailControle?: string,
): Promise<ResultatReparation> {
  if (motif === 'date_perimee') {
    return { repare: false, motif, detail: 'contenu daté : une réécriture ne le rendrait pas pertinent' };
  }
  if (!post.visual_url) {
    return { repare: false, motif, detail: 'pas de visuel : impossible de réécrire depuis l\'image' };
  }

  const { repairPostText } = await import('@/lib/visuals/post-repair');

  for (let essai = 1; essai <= TENTATIVES_MAX; essai++) {
    const repare = await repairPostText({
      visualUrl: post.visual_url,
      platform: post.platform || undefined,
      format: post.format || undefined,
      imageDescription: detailControle,
      originalCaption: post.caption || post.hook || undefined,
    });

    // Réécriture impossible (contrôle vision indisponible, image illisible) :
    // réessayer à l'identique ne changerait rien.
    if (!repare) {
      return { repare: false, motif, detail: 'réécriture indisponible (contrôle vision hors service ou image illisible)' };
    }

    // Un verdict absent n'est pas un verdict positif : on ne publie que ce
    // qu'on a effectivement revérifié.
    if (repare.verdict?.pass) {
      await supabase.from('content_calendar').update({
        caption: repare.caption,
        hashtags: repare.hashtags,
        qa_notes: `réparé automatiquement (${motif}, essai ${essai}) — texte réécrit depuis le visuel`,
      }).eq('id', post.id);

      return {
        repare: true, motif,
        detail: `texte réécrit depuis le visuel et revalidé à l'essai ${essai}`,
        caption: repare.caption, hashtags: repare.hashtags,
      };
    }
  }

  return { repare: false, motif, detail: `${TENTATIVES_MAX} réécritures recalées : le problème vient probablement du visuel` };
}

/**
 * Met le post de côté sans écrire au client, et laisse une trace exploitable.
 *
 * Le statut `needs_review` le sort du flux de publication tout en le gardant
 * visible dans le planning : le client qui va voir son planning le trouve et
 * peut en décider, mais on ne l'a pas dérangé pour ça.
 */
export async function ecarterSansNotifier(
  supabase: SupabaseClient,
  postId: string,
  userId: string | null,
  motif: MotifRecalage,
  detail: string,
): Promise<void> {
  await supabase.from('content_calendar')
    .update({ status: 'needs_review', qa_notes: `écarté sans notification (${motif}) : ${detail}` })
    .eq('id', postId);

  await supabase.from('agent_logs').insert({
    agent: 'content',
    action: 'post_ecarte_qc',
    status: 'error',
    user_id: userId,
    data: { post_id: postId, motif, detail, notification_client: false },
    created_at: new Date().toISOString(),
  });
}
