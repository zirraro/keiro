/**
 * Le générateur apprend de ses propres refus.
 *
 * ── Pourquoi ──
 *
 * Fondateur, 2026-08-11 : « il faut sortir le plus vite possible, de préférence
 * dès la 1re génération, une top image ou un top reel », « le prompt doit
 * s'adapter, et même quand il s'adapte il doit être de top qualité », et « en
 * même temps monitore les coûts qu'on doit pouvoir maîtriser ».
 *
 * Les trois demandes se rejoignent en un seul point. Le pipeline régénère
 * jusqu'à deux fois quand la note est sous le plancher, puis se rabat sur un
 * visuel de la bibliothèque, puis met en attente. Chaque reprise est payée, et
 * elle retarde la publication. Le vrai levier n'est donc pas de contrôler plus
 * fort, c'est de rater moins souvent du premier coup.
 *
 * Or on refusait en boucle les mêmes choses sans jamais le dire au générateur.
 * Le contrôle écrit pourtant chaque refus dans le journal, avec son motif,
 * depuis des mois : la matière était là, personne ne la relisait. Un précédent
 * exact : le contrôle rejetait le texte incrusté depuis des mois alors que le
 * générateur n'avait jamais reçu la consigne de ne pas en produire — cinquante
 * images refusées et repayées pour une consigne jamais donnée.
 *
 * Ce module ferme la boucle : ce qui a été refusé récemment sur CE compte et CE
 * réseau devient une consigne explicite à la génération suivante.
 *
 * ── Pourquoi c'est presque gratuit ──
 *
 * Une requête de lecture toutes les trente minutes par couple compte × réseau,
 * mise en cache en mémoire. Aucun appel de modèle : l'apprentissage est une
 * agrégation, pas une inférence. Et il ne peut que faire baisser le nombre de
 * générations payées.
 *
 * ── Pourquoi ça ne dégrade pas la qualité ──
 *
 * On n'ajoute jamais de consigne positive inventée — seulement l'interdiction
 * de ce qu'un juge a réellement sanctionné, formulée en une ligne. Le socle de
 * qualité (réalisme photographique, exigence du réseau) reste intact au-dessus.
 * On ne remplace pas l'exigence, on lui ajoute la mémoire des erreurs.
 */

/** Ce que chaque défaut constaté doit devenir comme consigne, en anglais. */
const CONSIGNE_PAR_DEFAUT: Record<string, string> = {
  looks_generated: 'Several recent images were rejected for LOOKING AI-GENERATED. Push realism harder than usual: visible skin pores and asymmetry, real grain in the shadows, one identifiable light source, imperfect framing.',
  blurry_subject: 'Recent images were rejected for a SOFT HERO SUBJECT. The main subject must be tack sharp — background blur is fine, the subject never is.',
  out_of_focus: 'Recent images were rejected for MISSED FOCUS. Put the focal plane exactly on the subject.',
  '2d_paste': 'Recent images were rejected because the subject looked PASTED on the background. Ground it: contact shadow, shared perspective, same light.',
  lighting_mismatch: 'Recent images were rejected for INCOMPATIBLE LIGHT between subject and background. One single light source for the whole frame.',
  invented_props: 'Recent images were rejected for OBJECTS THAT DO NOT BELONG in this kind of place. Keep only what the business would really have.',
  wrong_subject: 'Recent images were rejected for SHOWING THE WRONG SUBJECT. Read the brief literally and photograph exactly that.',
  low_detail: 'Recent images were rejected as TOO EMPTY. Build depth — foreground, midground, background — and details the eye can explore.',
  uncanny_composition: 'Recent images were rejected for an UNNATURAL COMPOSITION. Frame it as a photographer working fast would.',
  venue_changed: "Recent images were rejected for CHANGING THE CLIENT'S REAL VENUE. Preserve the place exactly: same view, same materials, same layout.",
  proportions_unrealistic: 'Recent images were rejected for WRONG SCALE of the hero subject. Respect the camera distance described in the brief.',
  off_network_register: 'Recent images were rejected as WRONG FOR THIS NETWORK. Re-read the network section above and match its register exactly.',
};

interface EntreeCache { bloc: string; expire: number }
const cache = new Map<string, EntreeCache>();
const DUREE_CACHE_MS = 30 * 60 * 1000;

/** Sous ce nombre d'occurrences, c'est un accident, pas une tendance. */
const SEUIL_RECURRENCE = 2;

/** Au-delà, la consigne devient un catalogue que le modèle survole. */
const MAX_CONSIGNES = 3;

/**
 * Le bloc de consignes tirées des refus récents, prêt à coller dans le prompt
 * de génération. Chaîne vide quand il n'y a rien à signaler — le cas normal
 * d'un compte dont les images passent.
 *
 * Ne lève jamais : un apprentissage indisponible ne doit pas empêcher une
 * génération.
 */
export async function consignesTireesDesRefus(
  supabase: any,
  opts: { userId?: string | null; plateforme?: string | null; jours?: number },
): Promise<string> {
  const cle = `${opts.userId || 'tous'}|${opts.plateforme || 'tous'}`;
  const enCache = cache.get(cle);
  if (enCache && enCache.expire > Date.now()) return enCache.bloc;

  let bloc = '';
  try {
    const depuis = new Date(Date.now() - (opts.jours ?? 14) * 86400000).toISOString();
    let requete = supabase
      .from('agent_logs')
      .select('action, data')
      .in('action', ['qa_visual_block', 'qc_portail_retenu'])
      .gte('created_at', depuis)
      .limit(200);
    if (opts.userId) requete = requete.eq('user_id', opts.userId);

    const { data } = await requete;

    const comptes = new Map<string, number>();
    for (const l of data || []) {
      const d = (l as any).data || {};
      // Un refus sur un autre réseau ne dit rien de celui-ci : les attentes
      // diffèrent, et mélanger les deux ferait corriger un défaut inexistant.
      if (opts.plateforme && d.reseau && d.reseau !== opts.plateforme) continue;
      for (const f of (d.flags || [])) comptes.set(String(f), (comptes.get(String(f)) || 0) + 1);
      if (d.code === 'coherence') comptes.set('wrong_subject', (comptes.get('wrong_subject') || 0) + 1);
    }

    const retenus = [...comptes.entries()]
      .filter(([f, n]) => n >= SEUIL_RECURRENCE && CONSIGNE_PAR_DEFAUT[f])
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_CONSIGNES);

    if (retenus.length) {
      bloc = [
        '━━━ LEARNED FROM RECENT REJECTIONS ON THIS ACCOUNT ━━━',
        'A quality reviewer rejected images for these exact reasons in the last two weeks.',
        'They are the most likely way this generation fails. Do not repeat them:',
        ...retenus.map(([f, n]) => `- (${n}×) ${CONSIGNE_PAR_DEFAUT[f]}`),
      ].join('\n');
    }
  } catch { /* un apprentissage indisponible n'empêche pas de générer */ }

  cache.set(cle, { bloc, expire: Date.now() + DUREE_CACHE_MS });
  return bloc;
}
