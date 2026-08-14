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
  const MAX = estVideo ? 2 : 3;

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

  for (let essai = 2; essai <= MAX; essai++) {
    if (verdict.publiable && note >= VISE) break;

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
    journal.push(`épuisé après ${MAX} essais — on livre la meilleure version (${note}/10) plutôt que rien`);
  }

  return {
    note, publiable: !!verdict.publiable, essaiGagnant,
    essais: journal.length, journal, hook, caption, visualUrl,
  };
}
