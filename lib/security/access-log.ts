import { createClient } from '@supabase/supabase-js';

/**
 * Journal d'accès aux DONNÉES GOOGLE de l'utilisateur (prérequis CASA ASVS V7 +
 * Google Limited Use). On trace QUI/QUAND/QUEL scope/QUELLE action — JAMAIS le
 * contenu des messages. Fire-and-forget : n'impacte jamais l'opération.
 *
 * Actions typiques : 'send_email' (gmail.send), 'read_inbox' (gmail.readonly,
 * Option B), 'create_draft' (gmail.compose, Option B), 'read_reviews'
 * (business.manage).
 */
/**
 * `agent_logs.agent` porte une contrainte CHECK avec une liste blanche.
 *
 * 2026-07-30 — BUG DE CONFORMITÉ : on écrivait `agent: 'system'`, qui n'est PAS
 * dans la liste. Chaque insertion était donc rejetée (code 23514) et, comme
 * l'appel est fire-and-forget avec l'erreur avalée, le journal d'accès Google
 * n'a JAMAIS rien enregistré — alors que la privacy policy et le dossier CASA
 * affirment que chaque accès est tracé. Trouvé en vérifiant la préparation
 * d'Option B, avant dépôt.
 *
 * On route donc vers l'agent RESPONSABLE de l'accès, tous autorisés par la
 * contrainte : Gmail → `email`, Business Profile → `gmaps`, reste → `ops`.
 */
function agentForScope(scope: string): string {
  const s = (scope || '').toLowerCase();
  if (s.includes('gmail')) return 'email';
  if (s.includes('business')) return 'gmaps';
  return 'ops';
}

export function logGoogleDataAccess(
  userId: string | null | undefined,
  access: string,
  scope: string,
  meta?: Record<string, string | number | boolean>,
): void {
  if (!userId) return;
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    // Volontairement sans await côté appelant : best-effort, non bloquant.
    sb.from('agent_logs').insert({
      agent: agentForScope(scope),
      action: 'google_data_access',
      user_id: userId,
      data: { access, scope, ts: new Date().toISOString(), ...(meta || {}) },
      created_at: new Date().toISOString(),
    }).then(
      () => {},
      // On ne casse jamais l'opération, mais on ne l'avale plus en silence :
      // c'est ce silence qui a masqué l'absence totale de journal pendant des
      // semaines. Une trace console suffit pour que ça remonte dans les logs.
      (err: any) => console.warn('[access-log] journal Google NON écrit:', err?.message || err),
    );
  } catch { /* never throw */ }
}
