/**
 * La porte unique par laquelle passe toute publication, quel que soit le
 * chemin qui l'y amène.
 *
 * ── Ce qu'on a trouvé (2026-08-11) ──
 *
 * Le fondateur demande le contrôle qualité sur LinkedIn « sachant que les
 * stratégies sont différentes par réseau ». En allant le poser, on découvre
 * bien pire que l'absence de LinkedIn.
 *
 * Il existe DEUX chemins de publication dans le produit :
 *
 *   · le chemin MANUEL (`action: 'publish'`), quand quelqu'un clique ;
 *   · le chemin AUTOMATIQUE (`action: 'execute_publication'`), déclenché par
 *     le planificateur — c'est par lui que part la quasi-totalité du contenu.
 *
 * Les trois contrôles ÉDITORIAUX — client inventé, doublon, cohérence entre
 * l'image et la légende — n'étaient posés que sur le chemin manuel. Le chemin
 * automatique ne faisait que le contrôle TECHNIQUE de l'image (netteté,
 * artefacts). Autrement dit : la règle « on ne publie jamais deux fois le même
 * contenu » et le garde-fou contre les clientes inventées ne s'appliquaient
 * pas là où presque tout passe.
 *
 * C'est exactement la leçon déjà écrite dans `construire-carrousel.ts` en
 * août : tant que deux endroits publient, la prochaine règle de qualité en
 * oubliera un. D'où ce module. Les deux chemins l'appellent, et une règle
 * ajoutée ici s'applique partout par construction — y compris à LinkedIn, qui
 * n'emprunte que le chemin automatique et n'avait donc jamais vu le moindre
 * contrôle éditorial.
 *
 * ── L'ordre des contrôles est un choix de coût ──
 *
 * Du moins cher au plus cher : d'abord ce qui ne coûte rien (analyse de texte),
 * puis ce qui coûte une requête (recherche de doublon), et seulement en dernier
 * ce qui coûte un appel de modèle de vision. Un post écarté pour doublon n'a
 * pas à être payé en analyse d'image.
 *
 * ── Une panne ne bloque pas, un verdict bloque ──
 *
 * Un contrôle qui ne peut pas s'exécuter (module absent, API muette) laisse
 * passer : on ne suspend pas la livraison d'un client sur une défaillance de
 * notre côté. Seule exception, déjà arbitrée : quand les DEUX fournisseurs de
 * vision sont à terre, on retient — sinon le garde-fou se désactive tout seul,
 * en silence, et pour plusieurs jours.
 */

export type CodeRefus =
  | 'claim_invente'
  | 'doublon'
  | 'qc_indisponible'
  | 'coherence';

export interface VerdictPortail {
  publiable: boolean;
  /** Le code du refus, pour les statistiques. */
  code?: CodeRefus;
  /** Le diagnostic écrit en base, lisible par le client. */
  diagnostic?: string;
  /** De quoi reconstituer la réponse détaillée du chemin manuel. */
  details?: Record<string, any>;
}

export interface PostAControler {
  id: string;
  user_id?: string | null;
  hook?: string | null;
  caption?: string | null;
  hashtags?: string[] | null;
  visual_url?: string | null;
  video_url?: string | null;
  platform: string;
  format?: string | null;
}

const PUBLIABLE: VerdictPortail = { publiable: true };

export async function controlerAvantPublication(
  supabase: any,
  post: PostAControler,
): Promise<VerdictPortail> {
  // ── 1. Un client nommé qui n'existe pas ──
  //
  // Déterministe, donc il tourne même quand le crédit d'IA est épuisé, et il
  // couvre les REELS et VIDÉOS que le contrôle de cohérence ne peut pas juger
  // faute d'image à analyser. C'est par là qu'était partie « Marie, gérante de
  // sa boutique de créateurs », une cliente qui n'existe pas.
  try {
    const { detectInventedClaim } = await import('./caption-claim-guard');
    const claim = detectInventedClaim([post.caption, post.hook].filter(Boolean).join(' — '));
    if (claim.blocked) {
      return {
        publiable: false,
        code: 'claim_invente',
        diagnostic: `qc_claim_bloque: ${claim.reason} — « ${claim.excerpt} »`.slice(0, 500),
        details: { reason: claim.reason, excerpt: claim.excerpt },
      };
    }
  } catch { /* un garde-fou en panne ne bloque pas la publication */ }

  // ── 2. Déjà publié ──
  //
  // Le même TikTok parti trois fois : 250 vues, 250 vues, puis ZÉRO — la
  // plateforme reconnaît le contenu et cesse de le pousser. Retenir un doublon
  // protège la portée du compte, ce n'est pas un échec de livraison.
  try {
    const { dejaPublie, diagnostiquerDoublon } = await import('./doublon-guard');
    const verdict = await dejaPublie(supabase, {
      id: post.id,
      hook: post.hook,
      caption: post.caption,
      video_url: post.video_url,
      visual_url: post.visual_url,
      platform: post.platform,
      user_id: post.user_id,
    } as any);
    if (verdict.doublon) {
      return {
        publiable: false,
        code: 'doublon',
        diagnostic: diagnostiquerDoublon(verdict).slice(0, 500),
        details: { reason: verdict.motif, publie_le: verdict.publieLe, post_origine: verdict.postOrigine },
      };
    }
  } catch { /* un garde-fou en panne ne bloque pas la publication */ }

  // ── 3. L'image raconte-t-elle la même chose que la légende ? ──
  //
  // Seul contrôle qui coûte un appel de vision, donc placé en dernier, et
  // seulement quand il y a une image fixe à regarder. Les vidéos ont leur
  // propre contrôle, sur trois images extraites du montage.
  if (post.visual_url && !post.video_url && process.env.SKIP_COHERENCE_QC !== '1') {
    try {
      const { assessPostCoherence } = await import('./post-coherence-qc');
      const coh = await assessPostCoherence({
        visualUrl: post.visual_url,
        caption: post.caption || '',
        hashtags: post.hashtags as any,
        platform: post.platform,
        format: post.format || undefined,
      });

      if (coh && (coh as any).unavailableReason) {
        return {
          publiable: false,
          code: 'qc_indisponible',
          diagnostic: 'qc_indisponible: contrôle qualité hors service (Anthropic ET Gemini en échec)',
          details: { reason: 'qc_unavailable_billing' },
        };
      }
      if (coh && 'pass' in coh && !coh.pass) {
        return {
          publiable: false,
          code: 'coherence',
          diagnostic: `qc_coherence_bloque: ${coh.reasons[0] || 'incohérent'}`.slice(0, 500),
          details: { score: coh.score, reasons: coh.reasons, hookScore: coh.hookScore, flags: coh.flags },
        };
      }
    } catch { /* contrôle indisponible : la publication continue */ }
  }

  return PUBLIABLE;
}
