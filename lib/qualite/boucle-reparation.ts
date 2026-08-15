import { controlerAvantPublication } from '@/lib/visuals/portail-publication';
import { reparerLegende, briefVisuelDepuisLegende } from '@/lib/qualite/reparation';

/**
 * La boucle qui fait converger un post vers le niveau attendu.
 *
 * ── Pourquoi elle est ici et non dans la route ──
 *
 * Fondateur, 2026-08-14 : « 3 sur 4 passent du premier coup, c'est top. Mais ça
 * veut dire qu'on a réessayé pour un post — est-ce que ça s'est bien passé, au
 * 2e essai si c'est un reel, jusqu'au 3e si c'est une image ou un carrousel ? Il
 * faut bien savoir ça, combien d'essais, car de toute façon on doit délivrer
 * quelque chose, jamais rester sur un échec. »
 *
 * Sa question a mis en évidence une lacune du banc d'essai : il ne mesurait que
 * le PREMIER essai, parce que la boucle de réparation vivait dans le chemin de
 * publication. Le banc pouvait donc dire « 3 sur 4 passent », sans jamais dire
 * ce qu'il advenait du quatrième — c'est-à-dire précisément ce qu'on veut
 * savoir.
 *
 * La boucle est donc sortie de la route pour vivre ici, utilisable par les deux.
 * Sinon elles divergeraient — c'est l'erreur que j'ai déjà commise trois fois
 * cette semaine avec les prompts, le juge et la musique : deux endroits qui font
 * la même chose finissent par la faire différemment.
 *
 * ── La règle de convergence ──
 *
 * On répare le défaut CONSTATÉ, pas un défaut supposé :
 *   · l'image ne colle pas au texte → on refait l'image À PARTIR du texte ;
 *   · le texte ne colle pas à l'image → on réécrit le texte.
 *
 * Refaire l'image depuis le texte converge presque toujours, parce que le texte
 * porte l'intention et que l'image doit s'y plier. C'est le sens de marche
 * naturel, et c'est celui qu'on privilégie.
 *
 * Trois essais pour une image ou un carrousel, deux pour un reel : une vidéo se
 * compte en minutes de calcul là où une image se compte en secondes. Le plafond
 * n'est pas esthétique, c'est la marge.
 *
 * Et on rend TOUJOURS la meilleure version obtenue, même à 6. Ne rien livrer
 * coûte un créneau, une génération et un client qui ne reçoit rien.
 */

export interface ResultatBoucle {
  /** Note finale retenue. */
  note: number;
  /** Publiable en l'état ? */
  publiable: boolean;
  /** À quel essai le post est devenu publiable. 1 = du premier coup. */
  essaiGagnant: number | null;
  /** Nombre total d'essais consommés (hors contrôle initial). */
  essais: number;
  /** Ce qui a été fait, dans l'ordre — pour comprendre après coup. */
  journal: string[];
  /** La version retenue. */
  hook: string | null;
  caption: string | null;
  visualUrl: string | null;
}

export async function reparerJusquAuNiveau(
  supabase: any,
  post: {
    id: string; user_id?: string | null; hook?: string | null; caption?: string | null;
    hashtags?: string[] | null; visual_url?: string | null; video_url?: string | null;
    platform: string; format?: string | null; business_type?: string | null;
  },
  opts: {
    /** Le niveau visé. En dessous, on tente d'améliorer ; on publie quand même. */
    vise?: number;
    /** Régénère une image. Fourni par l'appelant, qui seul sait comment. */
    genererVisuel?: (brief: string, format: string, texteDuPost: string) => Promise<string | null>;
  } = {},
): Promise<ResultatBoucle> {
  const VISE = opts.vise ?? 8;
  const estVideo = !!post.video_url || ['reel', 'video'].includes(String(post.format || ''));

  // ── Deux plafonds, parce qu on ne recommence pas pour la même raison ──
  //
  // Fondateur, 2026-08-14 : « si une note est inférieure à 6, on autorise à
  // réessayer, mais on track le nombre pour essayer de les réduire au minimum,
  // et on met un garde-fou à 5. On prend le meilleur des 5 essais, images et
  // reels confondus. »
  //
  // La distinction est juste. Recommencer pour passer de 6 à 8, c est du confort :
  // le post est déjà livrable, chaque essai supplémentaire est une dépense
  // volontaire, et le plafond serré s applique — trois pour une image, deux pour
  // un reel, parce qu une vidéo coûte des minutes de calcul.
  //
  // Recommencer parce qu on est SOUS 6, c est autre chose : sans réparation on
  // livre du mauvais ou rien. Là on s autorise jusqu à cinq, quel que soit le
  // format — le coût d un essai de plus est dérisoire face à un client qui
  // reçoit un post raté, ou pas de post du tout.
  //
  // Cinq et pas davantage : au-delà, l échec ne vient plus du hasard mais du
  // brief, et s acharner ne fait que payer la même erreur cinq fois. Le
  // garde-fou existe pour arrêter l acharnement, pas pour empêcher de réussir.
  const PLAFOND_CONFORT = estVideo ? 2 : 3;
  const PLAFOND_SAUVETAGE = 5;

  const journal: string[] = [];
  let hook = post.hook ?? null;
  let caption = post.caption ?? null;
  let visualUrl = post.visual_url ?? null;

  const juger = () => controlerAvantPublication(supabase, {
    id: post.id, user_id: post.user_id, hook, caption,
    hashtags: post.hashtags as any, visual_url: visualUrl, video_url: post.video_url,
    platform: post.platform, format: post.format,
  });

  let verdict: any = await juger();
  let note = Number((verdict.details as any)?.score ?? 0);
  let essaiGagnant: number | null = verdict.publiable ? 1 : null;
  journal.push(`essai 1 — ${note || '?'}/10 ${verdict.publiable ? 'publiable' : 'refusé'}`);

  for (let essai = 2; essai <= PLAFOND_SAUVETAGE; essai++) {
    if (verdict.publiable && note >= VISE) break;
    // Le post est déjà livrable : on ne dépasse pas le plafond de confort.
    if (verdict.publiable && essai > PLAFOND_CONFORT) break;

    // ── Ne pas réécrire à l aveugle un post qui va bien ──
    //
    // Mesuré au banc le 2026-08-14 : deux posts publiables à 7/10 ont consommé
    // deux réparations chacun, qui les ont fait descendre à 6 puis 5. Les deux
    // fois, la version d origine a été gardée — donc quatre réparations payées
    // pour aucun gain.
    //
    // La cause est logique : quand le contrôle ne NOMME aucun défaut, le
    // réparateur n a rien à corriger. Il réécrit au jugé et abîme ce qui
    // marchait. On ne peut pas réparer une chose qu on ne sait pas nommer.
    //
    // On ne tente donc une amélioration de confort que s il existe un motif
    // précis sur lequel travailler. Un post publiable sans reproche part tel
    // quel : viser 8 ne justifie pas de dépenser sans direction.
    const motifsExploitables = (((verdict.details as any)?.reasons) || []).filter(Boolean);
    if (verdict.publiable && motifsExploitables.length === 0) {
      journal.push(`essai ${essai} — non tenté : publiable à ${note}/10 et aucun défaut nommé, rien à corriger`);
      break;
    }

    const d = (verdict.details || {}) as any;
    const imageEnCause = d.imageUsable === false
      || (d.reasons || []).some((r: string) => /image/i.test(String(r)));

    let progres = false;

    // ── L'image d'abord, quand c'est elle qui pèche ──
    if (imageEnCause && !post.video_url && opts.genererVisuel) {
      const brief = await briefVisuelDepuisLegende({
        legende: caption || hook || '',
        motifs: (d.reasons || []).slice(0, 3).join(' · '),
        metier: post.business_type || null,
      });
      if (brief) {
        const nouvelle = await opts.genererVisuel(
          brief, post.format || 'post', [hook, caption].filter(Boolean).join(' — '),
        );
        if (nouvelle) {
          const avant = visualUrl;
          visualUrl = nouvelle;
          const v2 = await juger();
          const n2 = Number((v2.details as any)?.score ?? 0);
          if (n2 > note) {
            verdict = v2; note = n2; progres = true;
            if (!essaiGagnant && v2.publiable) essaiGagnant = essai;
            journal.push(`essai ${essai} — image refaite depuis le texte : ${n2}/10`);
          } else {
            visualUrl = avant;   // on ne dégrade jamais
            journal.push(`essai ${essai} — image refaite sans gain (${n2 || '?'}/10), version précédente gardée`);
          }
        }
      }
    }

    // ── Sinon le texte, réécrit à partir de ce que l'image montre ──
    if (!progres) {
      const mieux = await reparerLegende({
        // On dit au réparateur DANS QUEL SENS il travaille : retoucher un post qui
        // va bien, ou refaire un post refusé. Sans cette distinction il repart de
        // zéro à chaque fois et détruit ce qui marchait — mesuré, 7 → 6 → 5.
        dejaPubliable: !!verdict.publiable,
        noteActuelle: note,
        descriptionImage: String(d.imageDescription || ''),
        motifs: [
          verdict.publiable
            ? `Publiable à ${note}/10, mais on vise ${VISE}.`
            : `Refusé à ${note}/10.`,
          ...(d.reasons || []).slice(0, 2),
        ].join(' · '),
        plateforme: post.platform,
        ancienneLegende: caption || '',
      });
      if (mieux?.caption) {
        const avantH = hook, avantC = caption;
        hook = mieux.hook || hook; caption = mieux.caption;
        const v2 = await juger();
        const n2 = Number((v2.details as any)?.score ?? 0);
        if (n2 > note) {
          verdict = v2; note = n2;
          if (!essaiGagnant && v2.publiable) essaiGagnant = essai;
          journal.push(`essai ${essai} — texte réécrit sur l'image : ${n2}/10`);
        } else {
          hook = avantH; caption = avantC;
          journal.push(`essai ${essai} — texte réécrit sans gain (${n2 || '?'}/10), version précédente gardée`);
        }
      } else {
        journal.push(`essai ${essai} — aucune réparation possible`);
        break;
      }
    }
  }

  if (!verdict.publiable) {
    journal.push(`épuisé après ${PLAFOND_SAUVETAGE} essais — on livre la meilleure version (${note}/10) plutôt que rien`);

    // ── Cinq essais ratés : ce n est plus un aléa ──
    //
    // Fondateur, 2026-08-14 : « au-delà de 5, l administrateur reçoit une alerte,
    // ça veut dire qu il y a un problème plus grave à aller creuser. Mais
    // normalement, surtout avec le temps, on devrait réussir en 1 ou 2 essais
    // maximum. »
    //
    // Il a raison de poser le seuil ici. Un échec isolé, c est le hasard d une
    // génération ; cinq d affilée sur le même post, c est que quelque chose en
    // amont est cassé — un brief impossible, un métier mal détecté, un juge qui
    // exige l inatteignable. Aucune boucle de réparation ne corrige ça, et
    // continuer à réessayer ne ferait que payer la même erreur.
    //
    // L alerte remonte en  : c est le canal que lit le digest
    // administrateur, donc le fondateur la verra le lendemain matin sans avoir à
    // la chercher.
    try {
      await supabase.from('agent_logs').insert({
        // `warning` et non `error` : cinq réparations sans succès, c'est le
        // contrôle qui tient sa ligne, pas l'agent qui tombe. En `error`, ces
        // lignes faisaient chuter le taux de succès de l'agent content et
        // déclenchaient une analyse de panne sur un code imaginaire.
        agent: 'content', action: 'reparation_epuisee', status: 'warning',
        user_id: post.user_id || undefined,
        error_message: `${PLAFOND_SAUVETAGE} réparations sans succès sur ${post.platform}/${post.format} — note finale ${note}/10`,
        data: {
          post_id: post.id, reseau: post.platform, format: post.format,
          note_finale: note, journal,
          motifs: ((verdict.details as any)?.reasons || []).slice(0, 3),
          a_creuser: "Cinq essais sans succès : chercher en amont — brief impossible, métier mal détecté, ou exigence du contrôle inatteignable pour ce format.",
        },
        created_at: new Date().toISOString(),
      });
    } catch { /* l alerte ne bloque jamais la livraison */ }
  }

  // ── Consigner ce qui a coûté des essais, pour en consommer moins demain ──
  //
  // Fondateur, 2026-08-14 : « on track le nombre pour essayer de les réduire au
  // minimum, et on essaie de comprendre ce qui s est mal déroulé pour éviter que
  // ça se reproduise. »
  //
  // Sans cette trace, chaque réparation est un incident isolé : on paie, ça
  // passe, on oublie. Avec elle, on peut lire la semaine et voir que six
  // réparations sur dix venaient du même défaut de brief — et corriger la CAUSE
  // plutôt que de financer la conséquence.
  //
  // C est la seule façon de faire baisser le nombre d essais : le plafond limite
  // la dépense, il ne l évite pas.
  if (journal.length > 1) {
    try {
      await supabase.from('agent_logs').insert({
        agent: 'content', action: 'reparation_effectuee', status: 'ok',
        user_id: post.user_id || undefined,
        data: {
          post_id: post.id, reseau: post.platform, format: post.format,
          essais: journal.length, essai_gagnant: essaiGagnant,
          note_finale: note, publiable: !!verdict.publiable,
          // Le motif du PREMIER refus : c est lui qui a déclenché la dépense,
          // pas les suivants.
          cause_initiale: (journal[0] || '').replace(/^essai 1 — /, ''),
          motifs_initiaux: ((verdict.details as any)?.reasons || []).slice(0, 3),
          journal,
        },
        created_at: new Date().toISOString(),
      });
    } catch { /* la trace ne bloque jamais la livraison */ }
  }

  return {
    note, publiable: !!verdict.publiable, essaiGagnant,
    essais: journal.length, journal, hook, caption, visualUrl,
  };
}
