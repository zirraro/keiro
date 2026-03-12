/**
 * Shared CRM context loader for all agents.
 * Each agent is independent but uses the work of others to contextualise.
 * All agents read from crm_prospects + agent_logs as their shared knowledge base.
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface AgentContext {
  crmStats: {
    total: number;
    withEmail: number;
    withInstagram: number;
    withTiktok: number;
    withWebsite: number;
    hot: number;
    warm: number;
    cold: number;
    dead: number;
    contacted: number;
    replied: number;
    clients: number;
  };
  recentAgentWork: string;
  learnings: string[];
}

/**
 * Load shared CRM context that any agent can use.
 * Gives each agent visibility into the full pipeline state.
 */
export async function loadSharedContext(
  supabase: SupabaseClient,
  agentName: string,
): Promise<AgentContext> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // CRM stats (fast parallel queries)
  const [
    { count: total },
    { count: withEmail },
    { count: withInstagram },
    { count: withTiktok },
    { count: withWebsite },
    { count: hot },
    { count: warm },
    { count: cold },
    { count: dead },
    { count: contacted },
    { count: replied },
    { count: clients },
  ] = await Promise.all([
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('email', 'is', null),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('instagram', 'is', null),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('tiktok_handle', 'is', null),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('website', 'is', null),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'hot'),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'warm'),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'cold'),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'dead'),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'contacte'),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'repondu'),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).in('status', ['client', 'sprint']),
  ]);

  // Recent work from all agents (last 24h reports)
  const { data: recentReports } = await supabase
    .from('agent_logs')
    .select('agent, action, data, created_at')
    .eq('action', 'report_to_ceo')
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(15);

  let recentAgentWork = '';
  if (recentReports && recentReports.length > 0) {
    recentAgentWork = recentReports
      .filter((r: any) => r.agent !== agentName) // Don't show agent its own reports
      .map((r: any) => `[${r.agent}] ${r.data?.message || r.action}`)
      .join('\n');
  }

  // Load this agent's own learnings
  const { data: memories } = await supabase
    .from('agent_logs')
    .select('data')
    .eq('agent', agentName)
    .eq('action', 'memory')
    .order('created_at', { ascending: false })
    .limit(10);

  const learnings = (memories || [])
    .map((m: any) => m.data?.learning)
    .filter(Boolean);

  return {
    crmStats: {
      total: total || 0,
      withEmail: withEmail || 0,
      withInstagram: withInstagram || 0,
      withTiktok: withTiktok || 0,
      withWebsite: withWebsite || 0,
      hot: hot || 0,
      warm: warm || 0,
      cold: cold || 0,
      dead: dead || 0,
      contacted: contacted || 0,
      replied: replied || 0,
      clients: clients || 0,
    },
    recentAgentWork,
    learnings,
  };
}

/**
 * Format shared context as a string for injection into AI prompts.
 */
export function formatContextForPrompt(ctx: AgentContext): string {
  const s = ctx.crmStats;
  let text = `CRM KEIROAI (base de données partagée):
- ${s.total} prospects total | ${s.withEmail} avec email | ${s.withInstagram} Instagram | ${s.withTiktok} TikTok | ${s.withWebsite} site web
- Pipeline: ${s.cold} cold → ${s.warm} warm → ${s.hot} hot | ${s.contacted} contactés | ${s.replied} répondu | ${s.clients} clients | ${s.dead} dead`;

  if (ctx.recentAgentWork) {
    text += `\n\nTRAVAIL DES AUTRES AGENTS (dernières 24h):\n${ctx.recentAgentWork}`;
  }

  if (ctx.learnings.length > 0) {
    text += `\n\nTES APPRENTISSAGES:\n${ctx.learnings.map(l => `- ${l}`).join('\n')}`;
  }

  return text;
}
