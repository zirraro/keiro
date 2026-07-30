/**
 * Suivi des tâches lancées depuis le chat (règle fondateur 2026-07-29).
 *
 * Trois exigences :
 *   1. quand le client demande une action, il doit avoir une CONFIRMATION que
 *      c'est terminé ;
 *   2. s'il redemande « où ça en est ? », il doit obtenir un POURCENTAGE ;
 *   3. une tâche ne doit JAMAIS rester bloquée indéfiniment sans que personne
 *      s'en aperçoive.
 *
 * Implémenté sur `agent_logs` (pas de migration) : une ligne à l'ouverture
 * (`chat_action_started`), une à la clôture (`chat_action_finished`), et un
 * balayage qui déclare perdues les tâches ouvertes depuis trop longtemps.
 */

/** Au-delà de ce délai, une tâche ouverte est considérée comme perdue. */
export const RUN_STUCK_AFTER_MIN = 15;

/** Durées typiques observées, pour estimer un % d'avancement crédible. */
const EXPECTED_DURATION_SEC: Record<string, number> = {
  content: 180,        // génération + visuels
  mailbox: 120,        // triage de boîte
  email: 90,
  commercial: 240,     // prospection + enrichissement
  dm_instagram: 120,
  gmaps: 90,
  seo: 240,            // rédaction d'article
  rh: 60,
  comptable: 90,
  whatsapp: 45,
  marketing: 60,
  ceo: 60,
  default: 120,
};

export interface TaskRun {
  id: string;
  agent: string;
  action: string;
  startedAt: string;
  finishedAt?: string | null;
  ok?: boolean | null;
  summary?: string | null;
  /** 0-100. 100 dès que la tâche est terminée. */
  progress: number;
  state: 'en_cours' | 'terminee' | 'echouee' | 'perdue';
}

function progressFromElapsed(agent: string, startedAt: string): number {
  const expected = EXPECTED_DURATION_SEC[agent] || EXPECTED_DURATION_SEC.default;
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
  // On plafonne à 95 % tant que ce n'est pas confirmé terminé : annoncer 100 %
  // sur une estimation serait mentir au client.
  return Math.max(5, Math.min(95, Math.round((elapsed / expected) * 100)));
}

/** Ouvre une tâche et renvoie son identifiant (à passer à finishTaskRun). */
export async function startTaskRun(
  supabase: any,
  opts: { userId: string | null; orgId?: string | null; agent: string; action: string; label?: string },
): Promise<string | null> {
  try {
    const { data } = await supabase.from('agent_logs').insert({
      agent: opts.agent,
      action: 'chat_action_started',
      status: 'success',
      user_id: opts.userId,
      ...(opts.orgId ? { org_id: opts.orgId } : {}),
      data: { target_action: opts.action, label: opts.label || null, started_at: new Date().toISOString() },
    }).select('id').single();
    return data?.id || null;
  } catch {
    return null;
  }
}

/**
 * Clôture une tâche : c'est CE log qui autorise à confirmer au client.
 *
 * Envoie AUSSI une notification (règle fondateur 2026-07-29 : « les agents
 * doivent dire quand c'est fini via notif — c'est à ça que doivent servir les
 * notifs, pas à spammer pour rien »). Une tâche lancée depuis le chat est par
 * définition attendue par le client : c'est la notification la plus utile qui
 * existe. On ne notifie QUE ces fins de tâche demandées, jamais les runs
 * automatiques de fond.
 */
export async function finishTaskRun(
  supabase: any,
  runId: string | null,
  opts: { userId: string | null; agent: string; action: string; ok: boolean; summary?: string; notify?: boolean },
): Promise<void> {
  try {
    await supabase.from('agent_logs').insert({
      agent: opts.agent,
      action: 'chat_action_finished',
      status: opts.ok ? 'success' : 'error',
      user_id: opts.userId,
      error_message: opts.ok ? null : (opts.summary || 'échec').slice(0, 300),
      data: { run_id: runId, target_action: opts.action, ok: opts.ok, summary: (opts.summary || '').slice(0, 500), finished_at: new Date().toISOString() },
    });
  } catch { /* le suivi ne doit jamais casser l'action */ }

  if (opts.notify === false || !opts.userId) return;
  try {
    const { notifyClient } = await import('@/lib/agents/notify-client');
    const résultat = (opts.summary || '').trim();
    await notifyClient(supabase, {
      userId: opts.userId,
      agent: opts.agent,
      // 'action' quand ça a échoué (le client doit décider de relancer),
      // 'info' quand c'est fait (pas d'action attendue de sa part).
      type: opts.ok ? 'info' : 'action',
      title: opts.ok
        ? { fr: 'c\'est terminé', en: 'done' }
        : { fr: 'ça n\'a pas abouti', en: 'it did not go through' },
      message: opts.ok
        ? { fr: `Ce que tu m'as demandé est terminé${résultat ? ` : ${résultat}` : ''}.`, en: `What you asked for is done${résultat ? `: ${résultat}` : ''}.` }
        : { fr: `Je n'ai pas pu terminer${résultat ? ` : ${résultat}` : ''}. Dis-moi si je relance.`, en: `I couldn't finish${résultat ? `: ${résultat}` : ''}. Tell me if I should retry.` },
      data: { run_id: runId, target_action: opts.action, ok: opts.ok, source: 'chat_task' },
    });
  } catch { /* la notif ne doit jamais casser l'action */ }
}

/**
 * Tâches récentes de ce client, avec leur avancement — ce que le chat répond
 * quand on lui demande « où ça en est ? ».
 */
export async function getRecentTaskRuns(
  supabase: any,
  userId: string | null,
  opts: { hours?: number; agent?: string } = {},
): Promise<TaskRun[]> {
  if (!userId) return [];
  const since = new Date(Date.now() - (opts.hours || 6) * 3600_000).toISOString();
  try {
    let q = supabase
      .from('agent_logs')
      .select('id, agent, action, status, data, created_at, error_message')
      .eq('user_id', userId)
      .in('action', ['chat_action_started', 'chat_action_finished'])
      .gte('created_at', since)
      .order('created_at', { ascending: true });
    if (opts.agent) q = q.eq('agent', opts.agent);
    const { data: rows } = await q;

    const runs = new Map<string, TaskRun>();
    for (const r of rows || []) {
      if (r.action === 'chat_action_started') {
        runs.set(r.id, {
          id: r.id,
          agent: r.agent,
          action: (r.data as any)?.target_action || r.agent,
          startedAt: r.created_at,
          progress: progressFromElapsed(r.agent, r.created_at),
          state: 'en_cours',
        });
      } else {
        const runId = (r.data as any)?.run_id;
        const run = runId ? runs.get(runId) : [...runs.values()].reverse().find(x => x.agent === r.agent && x.state === 'en_cours');
        if (run) {
          run.finishedAt = r.created_at;
          run.ok = (r.data as any)?.ok !== false && r.status !== 'error';
          run.summary = (r.data as any)?.summary || r.error_message || null;
          run.progress = 100;
          run.state = run.ok ? 'terminee' : 'echouee';
        }
      }
    }

    // Rien n'est laissé « en cours » pour l'éternité : au-delà du seuil, la
    // tâche est déclarée perdue — c'est ce qui évite le blocage silencieux.
    const stuckBefore = Date.now() - RUN_STUCK_AFTER_MIN * 60_000;
    for (const run of runs.values()) {
      if (run.state === 'en_cours' && new Date(run.startedAt).getTime() < stuckBefore) {
        run.state = 'perdue';
        run.progress = 100;
      }
    }

    return [...runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  } catch {
    return [];
  }
}

/**
 * Règle anti-mensonge, injectée MÊME quand il n'y a aucune tâche en cours.
 *
 * 2026-07-30 — Un client a demandé à Hugo de nettoyer sa boîte. Hugo a répondu
 * qu'il avait supprimé des mails et créé des dossiers dans Gmail. Vérification :
 * aucune trace de triage, aucun accès Gmail — il n'avait rien fait. Cause : la
 * réponse du chat est rédigée AVANT que l'action ne soit lancée (exécution en
 * arrière-plan), donc le modèle raconte au passé une action qui n'a pas encore
 * démarré. C'est la faute la plus grave possible : le client perd confiance et
 * ne peut plus rien vérifier.
 */
const NEVER_CLAIM_BLOCK = `
━━━ INTERDICTION DE RACONTER UNE ACTION NON FAITE (règle absolue) ━━━
Quand le client te demande quelque chose à l'instant, l'action est LANCÉE EN
ARRIÈRE-PLAN : au moment où tu écris, elle n'est PAS terminée.
- INTERDIT : « j'ai supprimé tes pubs », « j'ai créé les dossiers », « c'est
  nettoyé », « j'ai publié », « j'ai envoyé » — pour une action demandée dans ce
  message. Tu ne peux pas le savoir, et si tu l'inventes, le client va vérifier
  et ne trouvera rien.
- INTERDIT d'inventer des chiffres (« 12 mails supprimés ») : les chiffres ne
  viennent QUE de la liste des tâches terminées de ton contexte.
- OBLIGATOIRE : parle au présent de ce que tu lances — « je m'y mets, je trie ta
  boîte maintenant » — et précise que tu préviens dès que c'est terminé (une
  notification part automatiquement à la fin, avec le détail).
- Tu ne peux affirmer un résultat QUE s'il figure dans « TÂCHES RÉCENTES » de
  ton contexte avec l'état TERMINÉE. Rien dans la liste = rien de terminé.
`;

/** Bloc de prompt : ce que l'agent doit dire sur l'avancement des tâches. */
export function taskRunsPromptBlock(runs: TaskRun[]): string {
  if (runs.length === 0) return NEVER_CLAIM_BLOCK;

  // Une seule ligne par type d'action : la plus récente. Sinon l'agent voyait
  // deux entrées « content » (une terminée, une en cours) et sortait « c'est en
  // cours » ET « c'est fini » dans le même message — exactement ce que le
  // fondateur a signalé le 29/07.
  const latestByAction = new Map<string, TaskRun>();
  for (const r of runs) if (!latestByAction.has(r.action)) latestByAction.set(r.action, r);
  runs = [...latestByAction.values()];

  const lines = runs.slice(0, 6).map(r => {
    const when = new Date(r.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (r.state === 'terminee') return `  • ${r.action} (lancée à ${when}) : TERMINÉE ✅${r.summary ? ` — ${r.summary.slice(0, 120)}` : ''}`;
    if (r.state === 'echouee') return `  • ${r.action} (lancée à ${when}) : ÉCHOUÉE ❌${r.summary ? ` — ${r.summary.slice(0, 120)}` : ''}`;
    if (r.state === 'perdue') return `  • ${r.action} (lancée à ${when}) : BLOQUÉE depuis plus de ${RUN_STUCK_AFTER_MIN} min — considère-la comme échouée, propose de la relancer`;
    return `  • ${r.action} (lancée à ${when}) : EN COURS, ~${r.progress}% d'avancement`;
  });

  return `\n━━━ TÂCHES RÉCENTES DE CE CLIENT ━━━
${lines.join('\n')}

RÈGLES :
1. UN SEUL ÉTAT PAR RÉPONSE. Cette liste donne l'état LE PLUS RÉCENT de chaque action. Il est INTERDIT de dire « c'est en cours » et « c'est terminé » dans le même message : tu regardes la ligne, et tu annonces CET état, point.
2. Si c'est TERMINÉ → tu donnes DIRECTEMENT LES RÉSULTATS, dès la première phrase, avec les chiffres ci-dessus. Pas de « je viens de finir, laisse-moi te dire… » : les résultats d'abord.
3. Si c'est EN COURS → tu donnes le POURCENTAGE ci-dessus. Jamais « je m'en occupe » sans chiffre, jamais « ça va prendre quelques minutes » sans avancement.
4. Si c'est BLOQUÉ ou ÉCHOUÉ → tu le dis franchement en une phrase et tu proposes de relancer. Tu ne fais jamais semblant que ça avance encore.
5. Tu n'annonces jamais 100% ni « terminé » tant que la ligne ne le dit pas.
6. Le client est aussi notifié automatiquement à la fin de chaque tâche : ne lui promets donc jamais « je te tiens au courant » comme si c'était incertain — il SERA prévenu.
${NEVER_CLAIM_BLOCK}`;
}
