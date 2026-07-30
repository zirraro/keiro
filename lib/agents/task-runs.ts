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

/** Clôture une tâche : c'est CE log qui autorise à confirmer au client. */
export async function finishTaskRun(
  supabase: any,
  runId: string | null,
  opts: { userId: string | null; agent: string; action: string; ok: boolean; summary?: string },
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

/** Bloc de prompt : ce que l'agent doit dire sur l'avancement des tâches. */
export function taskRunsPromptBlock(runs: TaskRun[]): string {
  if (runs.length === 0) return '';
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
1. Le client demande « où ça en est ? » → tu réponds avec l'état et le POURCENTAGE ci-dessus, jamais « je suis en train de m'en occuper » sans chiffre.
2. Une tâche TERMINÉE se confirme explicitement, avec ce qui a été fait (combien de posts, de mails, de prospects). Pas de « c'est fait » vague.
3. Une tâche BLOQUÉE ou ÉCHOUÉE : tu le dis franchement et tu proposes de la relancer. Tu ne fais jamais semblant qu'elle avance encore.
4. Tu n'annonces jamais 100% tant que la fin n'est pas confirmée dans cette liste.\n`;
}
