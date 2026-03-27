/**
 * Cross-agent email deduplication.
 *
 * Before ANY agent sends an email to a recipient, call `canSendEmail()`
 * to verify no other agent has already emailed them in the last N days.
 *
 * Sources checked:
 * - `crm_activities` (type='email') — cold/warm email agent sends to prospects
 * - `agent_logs` — retention & onboarding agents (action contains '_sent' or 'step_')
 *
 * The lookup is by **email address** so it works across agents that use
 * different ID spaces (prospect UUID vs user UUID).
 */

const MIN_DAYS_BETWEEN_ANY_EMAIL = 2; // Reduit de 3 a 2 pour permettre plus de volume tout en evitant le spam

/**
 * Check whether we are allowed to send an email to `recipientEmail`.
 * Returns { allowed: true } or { allowed: false, reason, lastSentAt, agent }.
 */
export async function canSendEmail(
  supabase: any,
  recipientEmail: string,
  opts?: {
    /** Override the minimum gap (days). Default = 3 */
    minDays?: number;
    /** Skip the check entirely (e.g. force mode). Default = false */
    force?: boolean;
    /** Prospect ID if known — speeds up crm_activities lookup */
    prospectId?: string;
    /** User ID if known — speeds up agent_logs lookup */
    userId?: string;
  },
): Promise<{ allowed: boolean; reason?: string; lastSentAt?: string; agent?: string }> {
  // NEVER bypass the same-day check — even in force mode, max 1 email/day/prospect
  const todayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Quick same-day check by email address (non-bypassable anti-spam)
  if (opts?.prospectId) {
    const { data: todayEmails } = await supabase
      .from('crm_activities')
      .select('id')
      .eq('prospect_id', opts.prospectId)
      .eq('type', 'email')
      .gte('created_at', todayCutoff)
      .limit(1);
    if (todayEmails && todayEmails.length > 0) {
      return { allowed: false, reason: 'Already emailed today (anti-spam)', agent: 'email' };
    }
  }

  if (opts?.force) return { allowed: true };

  const minDays = opts?.minDays ?? MIN_DAYS_BETWEEN_ANY_EMAIL;
  const cutoff = new Date(Date.now() - minDays * 24 * 60 * 60 * 1000).toISOString();

  // ── 1. Check crm_activities (email agent sends) ──
  // If we have a prospectId, check directly. Otherwise look up by email.
  let prospectIds: string[] = [];

  if (opts?.prospectId) {
    prospectIds = [opts.prospectId];
  } else {
    // Find all prospect IDs matching this email
    const { data: prospects } = await supabase
      .from('crm_prospects')
      .select('id')
      .eq('email', recipientEmail)
      .limit(5);
    if (prospects && prospects.length > 0) {
      prospectIds = prospects.map((p: any) => p.id);
    }
  }

  if (prospectIds.length > 0) {
    const { data: recentCrmEmails } = await supabase
      .from('crm_activities')
      .select('created_at, type, description')
      .in('prospect_id', prospectIds)
      .eq('type', 'email')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentCrmEmails && recentCrmEmails.length > 0) {
      return {
        allowed: false,
        reason: `Email agent sent to this address ${_daysAgo(recentCrmEmails[0].created_at)} days ago`,
        lastSentAt: recentCrmEmails[0].created_at,
        agent: 'email',
      };
    }
  }

  // ── 2. Check agent_logs for retention/onboarding sends ──
  // Find the user ID for this email if we don't have it
  let userIds: string[] = [];

  if (opts?.userId) {
    userIds = [opts.userId];
  } else {
    // Look up user by email in profiles (fallback: auth, but profiles is faster)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', recipientEmail)
      .limit(5);
    if (profiles && profiles.length > 0) {
      userIds = profiles.map((p: any) => p.id);
    }
  }

  if (userIds.length > 0) {
    // Retention agent logs: action like 'celebration_sent', 'nudge_sent', 'reactivation_sent', 'red_alert'
    // Onboarding agent logs: action like 'step_h0', 'step_h2', 'step_d1_morning', etc.
    // We match any agent_logs entry for these agents with target_id = user_id
    const { data: recentAgentEmails } = await supabase
      .from('agent_logs')
      .select('agent, action, created_at')
      .in('agent', ['retention', 'onboarding'])
      .in('target_id', userIds)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentAgentEmails && recentAgentEmails.length > 0) {
      const entry = recentAgentEmails[0];
      // Filter: only count actions that actually send emails TO THE USER
      // (not daily_check, queue_processed, red_alert, founder_alert — those go to the founder)
      const isSendAction =
        entry.action.includes('_sent') ||
        entry.action.startsWith('step_');

      if (isSendAction) {
        return {
          allowed: false,
          reason: `${entry.agent} agent sent "${entry.action}" ${_daysAgo(entry.created_at)} days ago`,
          lastSentAt: entry.created_at,
          agent: entry.agent,
        };
      }
    }
  }

  return { allowed: true };
}

/** Helper: days ago (rounded to 1 decimal) */
function _daysAgo(isoDate: string): string {
  const days = (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
  return days.toFixed(1);
}
