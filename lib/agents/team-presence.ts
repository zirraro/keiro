/**
 * TEAM PRESENCE — état de présence VÉRIDIQUE de chaque agent (design doc §13.1,
 * roster v2 : Noah→Ami). « Le client regarde son équipe, pas un logiciel. »
 *
 * Garde-fou absolu (founder) : la présence reflète les agent_logs RÉELS + les
 * pauses réelles. JAMAIS de fausse activité — un agent en pause s'affiche en
 * pause. La sympathie se construit sur le vrai.
 *
 * Data-only (aucun rendu) : l'UI (avatars + micro-copy 1re personne) consomme ça.
 */
import { SupabaseClient } from '@supabase/supabase-js';

export type PresenceState = 'working' | 'done_today' | 'paused' | 'idle';

export interface AgentPresence {
  agentId: string;
  state: PresenceState;
  lastAction: string | null;
  lastAt: string | null;
  /** Libellé court d'état, voix de l'agent (1re personne). */
  label: { fr: string; en: string };
}

const WORKING_WINDOW_MS = 2 * 3600 * 1000;  // activité < 2h = « travaille »
const TODAY_WINDOW_MS = 20 * 3600 * 1000;    // activité < 20h = « a bossé aujourd'hui »

function stateLabel(state: PresenceState): { fr: string; en: string } {
  switch (state) {
    case 'working':    return { fr: 'travaille…', en: 'working…' };
    case 'done_today': return { fr: 'a fini sa journée ✓', en: 'done for today ✓' };
    case 'paused':     return { fr: 'en pause', en: 'paused' };
    default:           return { fr: 'en veille', en: 'idle' };
  }
}

/**
 * Présence par agent pour un client. Best-effort, ne throw jamais.
 * @param agentIds liste des agent_id à évaluer (ceux visibles pour ce client).
 */
export async function getTeamPresence(
  supabase: SupabaseClient,
  userId: string,
  agentIds: string[],
  nowMs: number = Date.now()
): Promise<Record<string, AgentPresence>> {
  const out: Record<string, AgentPresence> = {};
  try {
    // 1. Pauses réelles (auto_paused_until, tiktok_health_paused, add-on inactif).
    const pausedAgents = new Set<string>();
    try {
      const { data: cfgs } = await supabase
        .from('org_agent_configs')
        .select('agent_id, config')
        .eq('user_id', userId);
      for (const row of cfgs || []) {
        const c: any = row.config || {};
        const pausedUntil = c.auto_paused_until ? new Date(c.auto_paused_until).getTime() : 0;
        const isPaused =
          (pausedUntil && pausedUntil > nowMs) ||
          c.tiktok_health_paused === true ||
          c.active === false ||
          (c.addon_active === false && (row.agent_id === 'whatsapp' || row.agent_id === 'comptable'));
        if (isPaused) pausedAgents.add(row.agent_id);
      }
    } catch { /* best-effort */ }

    // 2. Dernière activité par agent (fenêtre 48h, une requête).
    const since = new Date(nowMs - 48 * 3600 * 1000).toISOString();
    const lastByAgent: Record<string, { action: string; at: string }> = {};
    try {
      const { data: logs } = await supabase
        .from('agent_logs')
        .select('agent, action, created_at')
        .eq('user_id', userId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(400);
      for (const l of logs || []) {
        if (l.agent && !lastByAgent[l.agent]) lastByAgent[l.agent] = { action: l.action, at: l.created_at };
      }
    } catch { /* best-effort */ }

    // 3. Dérivation de l'état — véridique.
    for (const agentId of agentIds) {
      const last = lastByAgent[agentId] || null;
      let state: PresenceState;
      if (pausedAgents.has(agentId)) {
        state = 'paused';
      } else if (last) {
        const age = nowMs - new Date(last.at).getTime();
        state = age < WORKING_WINDOW_MS ? 'working' : age < TODAY_WINDOW_MS ? 'done_today' : 'idle';
      } else {
        state = 'idle';
      }
      out[agentId] = {
        agentId,
        state,
        lastAction: last?.action ?? null,
        lastAt: last?.at ?? null,
        label: stateLabel(state),
      };
    }
  } catch {
    // fallback total : tout en veille (jamais de fausse activité)
    for (const agentId of agentIds) {
      out[agentId] = { agentId, state: 'idle', lastAction: null, lastAt: null, label: stateLabel('idle') };
    }
  }
  return out;
}
