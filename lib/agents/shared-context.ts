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
    newLast24h: number;
    newLast7d: number;
  };
  emailPerformance: {
    sent24h: number;
    opened24h: number;
    clicked24h: number;
    replied24h: number;
    openRate: string;
    clickRate: string;
    replyRate: string;
    bestCategory: string;
  };
  conversionFunnel: {
    visiteursToLeads: string;
    leadsToContacted: string;
    contactedToReplied: string;
    repliedToClient: string;
  };
  recentAgentWork: string;
  learnings: string[];
  topProspects: Array<{ company: string; score: number; temperature: string; status: string }>;
}

/**
 * Load shared CRM context that any agent can use.
 * Gives each agent visibility into the full pipeline state + performance metrics.
 */
export async function loadSharedContext(
  supabase: SupabaseClient,
  agentName: string,
): Promise<AgentContext> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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
    { count: newLast24h },
    { count: newLast7d },
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
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo),
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
  ]);

  // Email performance (last 24h from crm_activities)
  const { data: emailEvents } = await supabase
    .from('crm_activities')
    .select('type, data')
    .eq('type', 'email')
    .gte('created_at', twentyFourHoursAgo);

  const { data: emailOpenEvents } = await supabase
    .from('crm_activities')
    .select('type, data')
    .in('type', ['email_opened', 'email_clicked', 'email_replied'])
    .gte('created_at', sevenDaysAgo);

  const sent24h = emailEvents?.length || 0;
  const opened24h = emailOpenEvents?.filter((e: any) => e.type === 'email_opened')?.length || 0;
  const clicked24h = emailOpenEvents?.filter((e: any) => e.type === 'email_clicked')?.length || 0;
  const replied24h = emailOpenEvents?.filter((e: any) => e.type === 'email_replied')?.length || 0;

  // Best category from recent email logs
  let bestCategory = 'N/A';
  const { data: recentEmailLogs } = await supabase
    .from('agent_logs')
    .select('data')
    .eq('agent', 'email')
    .in('action', ['daily_cold', 'daily_warm'])
    .order('created_at', { ascending: false })
    .limit(3);
  if (recentEmailLogs) {
    const categoryCounts: Record<string, number> = {};
    for (const log of recentEmailLogs) {
      const bbt = log.data?.by_business_type || {};
      for (const [cat, data] of Object.entries(bbt) as [string, any][]) {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + (data.sent || 0);
      }
    }
    const sorted = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) bestCategory = sorted[0][0];
  }

  // Top hot/warm prospects for priority visibility
  const { data: topProspectsData } = await supabase
    .from('crm_prospects')
    .select('company, score, temperature, status')
    .in('temperature', ['hot', 'warm'])
    .not('status', 'in', '("perdu","client","sprint")')
    .order('score', { ascending: false })
    .limit(5);

  // Conversion funnel rates
  const totalNum = total || 1;
  const conversionFunnel = {
    visiteursToLeads: `${((withEmail || 0) / totalNum * 100).toFixed(1)}%`,
    leadsToContacted: `${((contacted || 0) / Math.max(withEmail || 1, 1) * 100).toFixed(1)}%`,
    contactedToReplied: `${((replied || 0) / Math.max(contacted || 1, 1) * 100).toFixed(1)}%`,
    repliedToClient: `${((clients || 0) / Math.max(replied || 1, 1) * 100).toFixed(1)}%`,
  };

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
      .filter((r: any) => r.agent !== agentName)
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
      newLast24h: newLast24h || 0,
      newLast7d: newLast7d || 0,
    },
    emailPerformance: {
      sent24h,
      opened24h,
      clicked24h,
      replied24h,
      openRate: sent24h > 0 ? `${(opened24h / sent24h * 100).toFixed(1)}%` : 'N/A',
      clickRate: sent24h > 0 ? `${(clicked24h / sent24h * 100).toFixed(1)}%` : 'N/A',
      replyRate: sent24h > 0 ? `${(replied24h / sent24h * 100).toFixed(1)}%` : 'N/A',
      bestCategory,
    },
    conversionFunnel,
    recentAgentWork,
    learnings,
    topProspects: (topProspectsData || []).map((p: any) => ({
      company: p.company || 'Inconnu',
      score: p.score || 0,
      temperature: p.temperature || 'cold',
      status: p.status || 'new',
    })),
  };
}

/**
 * Format shared context as a string for injection into AI prompts.
 */
export function formatContextForPrompt(ctx: AgentContext): string {
  const s = ctx.crmStats;
  const e = ctx.emailPerformance;
  const f = ctx.conversionFunnel;

  let text = `CRM KEIROAI (base de données partagée):
- ${s.total} prospects total | ${s.withEmail} avec email | ${s.withInstagram} Instagram | ${s.withTiktok} TikTok | ${s.withWebsite} site web
- Pipeline: ${s.cold} cold → ${s.warm} warm → ${s.hot} hot | ${s.contacted} contactés | ${s.replied} répondu | ${s.clients} clients | ${s.dead} dead
- Nouveaux: ${s.newLast24h} (24h) | ${s.newLast7d} (7j)

PERFORMANCE EMAIL (7 derniers jours):
- Envoyés: ${e.sent24h} | Ouverts: ${e.opened24h} (${e.openRate}) | Clics: ${e.clicked24h} (${e.clickRate}) | Réponses: ${e.replied24h} (${e.replyRate})
- Meilleure catégorie: ${e.bestCategory}

FUNNEL DE CONVERSION:
- Visiteurs → Leads: ${f.visiteursToLeads} | Leads → Contactés: ${f.leadsToContacted} | Contactés → Répondu: ${f.contactedToReplied} | Répondu → Client: ${f.repliedToClient}`;

  if (ctx.topProspects.length > 0) {
    text += `\n\nTOP PROSPECTS CHAUDS:`;
    for (const p of ctx.topProspects) {
      text += `\n- ${p.company} (score: ${p.score}, ${p.temperature}, ${p.status})`;
    }
  }

  if (ctx.recentAgentWork) {
    text += `\n\nTRAVAIL DES AUTRES AGENTS (dernières 24h):\n${ctx.recentAgentWork}`;
  }

  if (ctx.learnings.length > 0) {
    text += `\n\nTES APPRENTISSAGES:\n${ctx.learnings.map(l => `- ${l}`).join('\n')}`;
  }

  return text;
}
