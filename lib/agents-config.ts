/**
 * Single source of truth for the client-facing agent roster per plan.
 *
 * Founder decision (brief v2, 2026-06-11):
 *   - Créateur = 5 agents : Léna, Jade, Léo, Ami, Clara
 *   - Pro      = 7 agents : Créateur + Théo + Hugo (quotas ×2)
 *   - Business = même équipe (7), volume supérieur
 *
 * Every landing/pricing section must read these numbers from here — no more
 * hard-coded "15+", "+9 autres", "10 agents" scattered across page.tsx.
 */

export interface AgentDef {
  id: string;
  name: string;
  emoji: string;
  role_fr: string;
  role_en: string;
}

// The 5 agents included in every paid plan (Créateur baseline).
export const CREATEUR_AGENTS: AgentDef[] = [
  { id: 'content',     name: 'Léna',  emoji: '🎬', role_fr: 'Contenu & publication', role_en: 'Content & publishing' },
  { id: 'dm_instagram', name: 'Jade',  emoji: '💬', role_fr: 'DMs & commentaires',    role_en: 'DMs & comments' },
  { id: 'gmaps',       name: 'Léo',   emoji: '🎯', role_fr: 'Prospection locale',    role_en: 'Local prospecting' },
  { id: 'marketing',   name: 'Ami',   emoji: '📊', role_fr: 'Stratégie & analytics', role_en: 'Strategy & analytics' },
  { id: 'onboarding',  name: 'Clara', emoji: '🚀', role_fr: 'Activation & support',  role_en: 'Activation & support' },
];

// Extra agents unlocked at Pro and above.
export const PRO_EXTRA_AGENTS: AgentDef[] = [
  { id: 'reviews', name: 'Théo', emoji: '⭐', role_fr: 'Avis Google',       role_en: 'Google reviews' },
  { id: 'email',   name: 'Hugo', emoji: '✉️', role_fr: 'Emails & prospection', role_en: 'Email outreach' },
];

export const PRO_AGENTS: AgentDef[] = [...CREATEUR_AGENTS, ...PRO_EXTRA_AGENTS];

/** Number of agents advertised per plan. */
export const PLAN_AGENT_COUNT: Record<string, number> = {
  free: 0,
  createur: CREATEUR_AGENTS.length, // 5
  pro: PRO_AGENTS.length,           // 7
  business: PRO_AGENTS.length,      // 7 (same team, higher volume)
  fondateurs: PRO_AGENTS.length,
  elite: PRO_AGENTS.length,
  agence: PRO_AGENTS.length,
};

export function agentCountForPlan(plan: string): number {
  return PLAN_AGENT_COUNT[(plan || '').toLowerCase()] ?? CREATEUR_AGENTS.length;
}
