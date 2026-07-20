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
      agent: 'system',
      action: 'google_data_access',
      user_id: userId,
      data: { access, scope, ts: new Date().toISOString(), ...(meta || {}) },
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});
  } catch { /* never throw */ }
}
