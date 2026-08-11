/**
 * La mémoire de ce qui est bon et de ce qui ne l'est pas, partagée par tous
 * les agents et tous les clients.
 *
 * ── L'idée du fondateur, mot pour mot ──
 *
 * « Si on a une objection client, qu'on la prenne comme un contrôle qualité du
 * niveau d'après, et donc retenir tout ce qui a été bon et tout ce qui a été
 * mauvais ; ainsi, à force de clients, on partage la connaissance — voilà ce
 * qui est bon ou pas — et on sort de plus en plus ce qui est attendu,
 * pertinent et de qualité. »
 *
 * C'est un cliquet : chaque défaut ne se paie qu'une fois. Le premier client
 * qui subit une réponse trop longue, un ton mal ajusté, une promesse mal
 * formulée, le paie pour lui — et personne après lui.
 *
 * ── Deux sources, deux poids ──
 *
 * Les VERDICTS du contrôle automatique disent ce qu'une machine sait voir :
 * les redites, les longueurs, les formules creuses. Nombreux, réguliers,
 * utiles en tendance.
 *
 * Les OBJECTIONS du client disent ce que la machine n'a pas su voir. Rares,
 * et bien plus précieuses : une objection nomme un défaut qu'aucun barème
 * n'avait anticipé. Elles passent donc en tête, et sans seuil de récurrence —
 * une seule suffit à devenir une règle.
 *
 * ── Pourquoi c'est presque gratuit ──
 *
 * Aucun appel de modèle : la mémoire est une agrégation, pas une inférence.
 * Une lecture toutes les trente minutes par couple agent × tâche, en cache.
 * Elle ne peut que faire baisser le nombre de réécritures, qui, elles, coûtent.
 */

interface EntreeCache { bloc: string; expire: number }
const cache = new Map<string, EntreeCache>();
const DUREE_CACHE_MS = 30 * 60 * 1000;

/** Sous ce nombre, un défaut est un accident, pas une tendance. */
const SEUIL_RECURRENCE = 3;

/** Au-delà, la consigne devient un catalogue que le modèle survole. */
const MAX_REGLES = 6;

/** Enregistre le verdict d'un contrôle. Ne lève jamais. */
export async function noterVerdict(supabase: any, v: {
  agent: string; tache: string; userId?: string | null;
  note: number; defauts: string[]; reecrit: boolean; noteApres?: number;
  bloque: boolean; extrait?: string;
}): Promise<void> {
  try {
    await supabase.from('qualite_verdicts').insert({
      agent: v.agent, tache: v.tache, user_id: v.userId || null,
      note: Math.round(v.note), defauts: v.defauts?.slice(0, 6) || [],
      reecrit: v.reecrit, note_apres: v.noteApres ?? null,
      bloque: v.bloque, extrait: (v.extrait || '').slice(0, 300),
    });
  } catch { /* une trace manquante ne doit jamais bloquer une livraison */ }
}

/**
 * Enregistre une objection client et la règle qu'on en tire.
 *
 * `regle` est ce qui sera réellement injecté dans les prompts. Si elle n'est
 * pas fournie, on reprend l'objection telle quelle : les mots du client valent
 * souvent mieux qu'une reformulation.
 */
export async function noterObjection(supabase: any, o: {
  agent: string; tache?: string; userId?: string | null;
  objection: string; regle?: string; partagee?: boolean;
}): Promise<{ ok: boolean; motif?: string }> {
  try {
    const { error } = await supabase.from('qualite_objections').insert({
      agent: o.agent, tache: o.tache || null, user_id: o.userId || null,
      objection: o.objection.slice(0, 1000),
      regle: (o.regle || o.objection).slice(0, 400),
      partagee: o.partagee !== false,
    });
    if (error) return { ok: false, motif: error.message };
    // Une objection change la donne tout de suite : on vide le cache pour que
    // la prochaine génération en tienne compte, sans attendre trente minutes.
    cache.clear();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, motif: e?.message };
  }
}

/**
 * Les consignes tirées de l'expérience, prêtes à coller dans un prompt.
 *
 * Chaîne vide quand il n'y a rien à dire — le cas d'un agent dont les sorties
 * passent. On n'invente jamais de règle : on ne rappelle que ce qui a été
 * réellement reproché.
 */
export async function consignesQualite(
  supabase: any,
  agent: string,
  tache?: string,
  userId?: string | null,
): Promise<string> {
  const cle = `${agent}|${tache || '*'}|${userId || 'tous'}`;
  const enCache = cache.get(cle);
  if (enCache && enCache.expire > Date.now()) return enCache.bloc;

  const lignes: string[] = [];
  try {
    const depuis = new Date(Date.now() - 90 * 86400000).toISOString();

    // ── Les objections client d'abord : elles pèsent le plus lourd ──
    let reqObj = supabase.from('qualite_objections')
      .select('regle, objection, tache, user_id, partagee')
      .eq('agent', agent).gte('created_at', depuis)
      .order('created_at', { ascending: false }).limit(40);
    const { data: objections } = await reqObj;

    const retenues = (objections || []).filter((o: any) =>
      // Partagée par tous, OU propre à ce client précis.
      (o.partagee !== false || (userId && o.user_id === userId))
      && (!tache || !o.tache || o.tache === tache));

    for (const o of retenues.slice(0, 4)) {
      lignes.push(`· ${String(o.regle || o.objection).slice(0, 220)}`);
    }

    // ── Puis les défauts que le contrôle a sanctionnés en série ──
    let reqV = supabase.from('qualite_verdicts')
      .select('defauts, note').eq('agent', agent).lt('note', 7)
      .gte('created_at', depuis).limit(300);
    if (tache) reqV = reqV.eq('tache', tache);
    const { data: verdicts } = await reqV;

    const comptes = new Map<string, number>();
    for (const v of verdicts || []) {
      for (const d of (v.defauts || [])) {
        const cle2 = String(d).slice(0, 160).toLowerCase();
        comptes.set(cle2, (comptes.get(cle2) || 0) + 1);
      }
    }
    const recurrents = [...comptes.entries()]
      .filter(([, n]) => n >= SEUIL_RECURRENCE)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_REGLES - lignes.length);

    for (const [d, n] of recurrents) lignes.push(`· (${n} fois) ${d}`);
  } catch { /* mémoire indisponible : on génère sans, plutôt que pas du tout */ }

  const bloc = lignes.length
    ? [
      '━━━ CE QUI A DÉJÀ ÉTÉ REPROCHÉ — NE PAS LE REFAIRE ━━━',
      'Tiré de vrais retours clients et de contrôles qualité passés, tous comptes confondus.',
      "C'est la façon la plus probable de rater cette tâche :",
      ...lignes,
    ].join('\n')
    : '';

  cache.set(cle, { bloc, expire: Date.now() + DUREE_CACHE_MS });
  return bloc;
}
