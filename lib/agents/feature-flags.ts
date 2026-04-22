/**
 * Global feature flags for agent availability.
 *
 * Source of truth for which agents are currently shippable. Any agent
 * listed in DISABLED_AGENTS is forbidden from running regardless of what
 * the DB schedule says. This is cleaner than deleting their configs —
 * when we're ready to ship them, we just remove them from this set.
 *
 * The reasoning: "désactivés le temps de bien peaufiner les autres"
 *   - ads (Felix)               → Meta/Google ad APIs need polish + budget tests
 *   - rh (Sara)                 → legal edge cases need more QA
 *   - comptable (Louis)         → finance calcs need CA real data
 *   - whatsapp (Stella)         → BSP contract / number porting pending
 *   - tiktok_comments (Axel)    → awaiting wider TikTok permissions
 *   - tiktok_dm / dm_tiktok     → same
 *   - linkedin / emma           → LinkedIn API scope pending
 *
 * Max (chatbot) is ENABLED but gated by plan — see isChatbotAvailable().
 */

export const DISABLED_AGENTS = new Set([
  'ads',
  'rh',
  'comptable',
  'whatsapp',
  'tiktok_comments',
  'tiktok_dm',
  'dm_tiktok',
  'linkedin',
  'emma',
  'felix',
  'sara',
  'stella',
  'louis',
  'axel',
]);

/**
 * Returns true when the agent is allowed to run today. Callers use this
 * to short-circuit both the scheduler and per-client agent triggers.
 */
export function isAgentEnabled(agentId: string): boolean {
  return !DISABLED_AGENTS.has((agentId || '').toLowerCase());
}

/**
 * Max (website chatbot) is a Business+ feature because it lives on the
 * client's PUBLIC website — not on keiroai.com. Lower tiers don't get
 * access because the support load doesn't fit the price point.
 */
const CHATBOT_ENABLED_PLANS = new Set(['business', 'fondateurs', 'elite', 'agence', 'admin']);

export function isChatbotAvailable(plan: string | null | undefined): boolean {
  return CHATBOT_ENABLED_PLANS.has((plan || '').toLowerCase());
}
