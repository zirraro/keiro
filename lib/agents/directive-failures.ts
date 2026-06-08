/**
 * Log when an agent fails to honor a client directive. Aggregated daily
 * into a single admin email so the founder sees ONE digest per day
 * across all clients × all agents, not a flood.
 *
 * Founder ask 2026-06-08 (par jour) : "si pbm mail anevoyé a admin mais
 * on regroupe tout les client leur pbm d'action demandé specifique par
 * agent dans 1 seul mail a admin".
 */

export interface DirectiveFailureInput {
  user_id: string | null;
  agent_id: string;
  directive_type?: string | null;
  directive_value?: any;
  raw_text?: string | null;
  reason: string;
  severity?: 'low' | 'medium' | 'high';
}

export async function logDirectiveFailure(
  supabase: any,
  input: DirectiveFailureInput,
): Promise<void> {
  try {
    await supabase.from('directive_failures').insert({
      user_id: input.user_id,
      agent_id: input.agent_id,
      directive_type: input.directive_type ?? null,
      directive_value: input.directive_value ?? null,
      raw_text: input.raw_text ?? null,
      reason: input.reason.substring(0, 600),
      severity: input.severity ?? 'medium',
    });
  } catch (e: any) {
    // Best-effort — don't block the agent run
    console.warn('[DirectiveFailure] log error:', e?.message);
  }
}

/**
 * Build the soft "we'll handle this within 24h" line that goes in the
 * client's chat reply when the verification step couldn't satisfy
 * their order automatically. Founder rule 2026-06-08:
 *   - Client message appears ONLY on verification failure
 *   - No spam if the order was applied OK
 */
export function clientChatPromiseLine(): string {
  return `\n\n_⏳ Cette demande spécifique va être prise en compte sous 24h. Notre équipe est notifiée et adaptera le pipeline pour toi._`;
}
