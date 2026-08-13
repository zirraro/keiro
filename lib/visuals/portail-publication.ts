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

  // ── 3. Le visuel raconte-t-il la même chose que la légende ? ──
  //
  // Seul contrôle qui coûte un appel de vision, donc placé en dernier.
  //
  // ── Le trou trouvé le 2026-08-11 ──
  //
  // Le fondateur voit partir un reel « Vitrine Restaurant » illustré par des
  // FLEURS. Vérification faite : ce contrôle ne s'exécutait que si
  // `visual_url && !video_url` — autrement dit, les REELS ET LES VIDÉOS en
  // étaient exclus. Leur contrôle dédié examine trois images du montage, mais
  // il juge la continuité, la netteté et les artefacts : à aucun moment il ne
  // compare ce qu'on VOIT à ce qu'on LIT. La note laissée sur ce post le dit
  // mot pour mot — « continuité imparfaite, vapeur discontinue » — sans un mot
  // sur le sujet.
  //
  // Or c'est précisément le format le plus exposé : un reel s'ouvre en plein
  // écran. On juge donc aussi les vidéos, sur leur image de couverture — celle
  // que le lecteur voit en premier, et qui est déjà produite, donc gratuite à
  // récupérer.
  if (post.visual_url && process.env.SKIP_COHERENCE_QC !== '1') {
    try {
      const { assessPostCoherence } = await import('./post-coherence-qc');
      // Qui parle, et à qui. Une lecture de plus, mais elle évite des refus
      // injustes qui coûtent chacun une génération et un créneau.
      let dossierMetier: string | null = null;
      let dossierCible: string | null = null;
      if (post.user_id) {
        try {
          const { data: d } = await supabase
            .from('business_dossiers')
            .select('business_type, company_description, target_audience')
            .eq('user_id', post.user_id).maybeSingle();
          if (d) {
            dossierMetier = [d.business_type, d.company_description].filter(Boolean).join(' — ').slice(0, 200) || null;
            dossierCible = d.target_audience || null;
          }
        } catch { /* le contrôle fonctionne sans, simplement moins bien informé */ }
      }
      const coh = await assessPostCoherence({
        visualUrl: post.visual_url,
        caption: post.caption || '',
        hashtags: post.hashtags as any,
        platform: post.platform,
        // Le juge doit savoir qu'il regarde une couverture de vidéo et non une
        // image fixe : ce qu'il voit est le premier plan du montage, pas
        // l'intégralité du propos. Sans cette précision il sanctionnerait des
        // cadrages parfaitement normaux pour une ouverture de reel.
        format: post.video_url ? `${post.format || 'reel'} (image de couverture)` : (post.format || undefined),
        // Le métier et la clientèle, lus au moment du contrôle : sans eux le juge
        // évalue la pertinence dans le vide et refuse des images justes — « une
        // plante en plein soleil » est excellente pour un fleuriste, hors-sujet
        // pour un garagiste. C'est le métier qui tranche.
        metier: dossierMetier,
        cible: dossierCible,
      });

      if (coh && (coh as any).unavailableReason) {
        return {
          publiable: false,
          code: 'qc_indisponible',
          diagnostic: 'qc_indisponible: contrôle qualité hors service (Anthropic ET Gemini en échec)',
          details: { reason: 'qc_unavailable_billing' },
        };
      }
      // ── Consigner ce qui a coûté des points, même quand ça passe ──
      //
      // Fondateur, 2026-08-13 : « on démarre avec du très bon et on va vers
      // l'excellent. » On ne progresse pas en ne regardant que les refus : un
      // post accepté à 6 dit exactement ce qui manque pour atteindre 8. Sans
      // cette trace, la même faiblesse se répète indéfiniment parce qu'elle ne
      // franchit jamais le seuil du refus.
      // ── Garder TOUTES les notes, pas seulement les faibles ──
      //
      // Fondateur, 2026-08-13 : « il faut une route qui track les résultats de ce
      // qu'on a considéré comme un 6, 7, 8, 9 ou 10, et les likes/vues que
      // l'algorithme a poussés — l'attention que ça a générée. On améliore
      // constamment avec le feedback pour aller dans le sens de l'attention. »
      //
      // Sans la note des posts qui passent bien, la corrélation est impossible :
      // on ne pourrait comparer que des refus entre eux. Et c'est la question qui
      // compte vraiment — si nos 9 ne font pas mieux que nos 6, notre barème ne
      // mesure rien et il faut le refaire.
      //
      // Une ligne par verdict, pour tout le monde. Le journal est déjà écrit à
      // cet instant, l'écriture supplémentaire est négligeable, et sans elle on
      // ne saura jamais si le contrôle sert à quelque chose.
      if (coh && 'pass' in coh) {
        supabase.from('agent_logs').insert({
          agent: 'content', action: 'qc_verdict', status: 'ok',
          user_id: post.user_id || undefined,
          data: {
            post_id: post.id, reseau: post.platform, note: coh.score,
            format: post.format, publiable: coh.pass,
            motifs: (coh.reasons || []).slice(0, 3),
            flags: Object.entries(coh.flags || {}).filter(([, v]) => v).map(([k]) => k),
          },
          created_at: new Date().toISOString(),
        }).then(() => {}, () => {});
      }

      if (coh && 'pass' in coh && !coh.pass) {
        // ── Un refus muet n'est pas un refus utilisable ──
        //
        // 2026-08-13 : une publication retenue avec « score 6, reasons: [] ».
        // Le juge avait refusé sans dire pourquoi. Trois conséquences : le
        // client lit « retenu par le contrôle » sans savoir quoi corriger, la
        // réparation automatique n'a rien sur quoi travailler, et le générateur
        // n'apprend rien de ce refus puisque l'apprentissage se nourrit des
        // motifs. Un jugement sans motif coûte le même prix qu'un jugement
        // motivé et ne sert à rien.
        //
        // On ne peut pas inventer le motif à sa place, mais on peut refuser de
        // le laisser passer silencieusement : la note devient le motif, et
        // l'anomalie est tracée pour qu'on la voie plutôt que de la subir.
        const motifs = Array.isArray(coh.reasons) ? coh.reasons.filter(Boolean) : [];
        if (motifs.length === 0) {
          motifs.push(`Le contrôle a refusé sans motif explicite (note ${coh.score}/10 — sous le seuil). Défaut de jugement signalé.`);
          console.warn(`[Portail] refus SANS MOTIF sur ${post.id} (note ${coh.score}) — le juge doit toujours dire pourquoi`);
        }
        return {
          publiable: false,
          code: 'coherence',
          diagnostic: `qc_coherence_bloque: ${motifs[0]}`.slice(0, 500),
          // `imageUsable` et la description de l'image sont remontées pour que
          // l'appelant puisse RÉPARER au lieu de jeter : « une bonne image avec
          // une mauvaise légende n'est pas un post à jeter, c'est une légende à
          // réécrire ». Sans ces deux champs, la seule issue était le rebut.
          details: {
            score: coh.score, reasons: motifs, hookScore: coh.hookScore, flags: coh.flags,
            imageUsable: coh.imageUsable, imageDescription: coh.imageDescription,
          },
        };
      }
    } catch { /* contrôle indisponible : la publication continue */ }
  }

  return PUBLIABLE;
}
