/**
 * Shared intelligence pool for all agents.
 *
 * ARCHITECTURE:
 * - Every agent reads the SAME shared context before acting
 * - Every agent writes results back to agent_logs (shared data pool)
 * - CEO + Marketing emit DIRECTIVES via agent_orders that other agents obey
 * - Each agent learns from ALL agents' performance data (cross-pollination)
 *
 * Data flow:
 *   agent_logs (results) → shared-context → AI prompt → agent action → agent_logs
 *   agent_orders (directives) → shared-context → AI prompt → agent obeys directive
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
  contentPerformance: {
    postsThisWeek: number;
    publishedThisWeek: number;
    draftsReady: number;
    platformBreakdown: Record<string, number>;
    lastPublishedDate: string;
    instagramPublished: number;
  };
  dmPerformance: {
    dmsSent7d: number;
    dmsQueued: number;
    responseRate: string;
    bestChannel: string;
  };
  conversionFunnel: {
    visiteursToLeads: string;
    leadsToContacted: string;
    contactedToReplied: string;
    repliedToClient: string;
  };
  activeDirectives: Array<{ from: string; type: string; message: string; priority: string; created_at: string }>;
  recentAgentWork: string;
  learnings: string[];
  allAgentLearnings: string[];
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

  // ── CONTENT PERFORMANCE ──
  const { data: contentPosts } = await supabase
    .from('content_calendar')
    .select('platform, status, scheduled_date, published_at')
    .gte('scheduled_date', sevenDaysAgo.split('T')[0])
    .order('scheduled_date', { ascending: false });

  const platformBreakdown: Record<string, number> = {};
  let publishedThisWeek = 0;
  let instagramPublished = 0;
  let lastPublishedDate = '';
  for (const p of contentPosts || []) {
    platformBreakdown[p.platform] = (platformBreakdown[p.platform] || 0) + 1;
    if (p.status === 'published') {
      publishedThisWeek++;
      if (p.platform === 'instagram') instagramPublished++;
      if (!lastPublishedDate && p.published_at) lastPublishedDate = p.published_at;
    }
  }
  const { count: draftsReady } = await supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'draft');

  // ── DM PERFORMANCE ──
  const { data: dmEvents } = await supabase
    .from('crm_activities')
    .select('type, data')
    .in('type', ['dm_instagram', 'tiktok_comment', 'dm_replied'])
    .gte('created_at', sevenDaysAgo);

  const dmsSent7d = dmEvents?.filter((e: any) => e.type === 'dm_instagram' || e.type === 'tiktok_comment')?.length || 0;
  const dmsReplied7d = dmEvents?.filter((e: any) => e.type === 'dm_replied')?.length || 0;
  const { count: dmsQueued } = await supabase.from('dm_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending');

  const igDMs = dmEvents?.filter((e: any) => e.type === 'dm_instagram')?.length || 0;
  const ttDMs = dmEvents?.filter((e: any) => e.type === 'tiktok_comment')?.length || 0;
  const bestDMChannel = igDMs >= ttDMs ? 'instagram' : 'tiktok';

  // ── ACTIVE DIRECTIVES from CEO/Marketing ──
  const { data: directives } = await supabase
    .from('agent_orders')
    .select('from_agent, order_type, payload, priority, created_at')
    .in('to_agent', [agentName, 'all'])
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(5);

  const activeDirectives = (directives || []).map((d: any) => ({
    from: d.from_agent,
    type: d.order_type,
    message: d.payload?.directive || d.payload?.message || JSON.stringify(d.payload),
    priority: d.priority,
    created_at: d.created_at,
  }));

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

  // Load ALL agents' learnings (cross-pollination)
  const { data: allMemories } = await supabase
    .from('agent_logs')
    .select('agent, data')
    .eq('action', 'memory')
    .neq('agent', agentName)
    .order('created_at', { ascending: false })
    .limit(15);

  const allAgentLearnings = (allMemories || [])
    .map((m: any) => `[${m.agent}] ${m.data?.learning}`)
    .filter((l: string) => l && !l.endsWith('undefined'));

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
    contentPerformance: {
      postsThisWeek: contentPosts?.length || 0,
      publishedThisWeek,
      draftsReady: draftsReady || 0,
      platformBreakdown,
      lastPublishedDate,
      instagramPublished,
    },
    dmPerformance: {
      dmsSent7d,
      dmsQueued: dmsQueued || 0,
      responseRate: dmsSent7d > 0 ? `${(dmsReplied7d / dmsSent7d * 100).toFixed(1)}%` : 'N/A',
      bestChannel: bestDMChannel,
    },
    conversionFunnel,
    activeDirectives,
    recentAgentWork,
    learnings,
    allAgentLearnings,
    topProspects: (topProspectsData || []).map((p: any) => ({
      company: p.company || 'Inconnu',
      score: p.score || 0,
      temperature: p.temperature || 'cold',
      status: p.status || 'new',
    })),
  };
}

/**
 * Write a directive from one agent to another via agent_orders.
 * Used by CEO and Marketing to steer other agents.
 */
export async function writeDirective(
  supabase: SupabaseClient,
  fromAgent: string,
  toAgent: string,
  orderType: string,
  directive: string,
  priority: 'haute' | 'moyenne' | 'basse' = 'moyenne',
) {
  // Complete any previous directives of the same type to avoid stacking
  await supabase.from('agent_orders')
    .update({ status: 'completed' })
    .eq('from_agent', fromAgent)
    .eq('to_agent', toAgent)
    .eq('order_type', orderType)
    .eq('status', 'pending');

  await supabase.from('agent_orders').insert({
    from_agent: fromAgent,
    to_agent: toAgent,
    order_type: orderType,
    priority,
    payload: { directive, issued_at: new Date().toISOString() },
    status: 'pending',
    created_at: new Date().toISOString(),
  });
}

/**
 * Mark a directive as completed after an agent has acted on it.
 */
export async function completeDirective(supabase: SupabaseClient, agentName: string, orderType: string) {
  await supabase.from('agent_orders')
    .update({ status: 'completed', result: { completed_at: new Date().toISOString() } })
    .eq('to_agent', agentName)
    .eq('order_type', orderType)
    .eq('status', 'pending');
}

/**
 * Format shared context as a string for injection into AI prompts.
 * This is the SHARED DATA POOL — every agent sees the same intelligence.
 */
export function formatContextForPrompt(ctx: AgentContext): string {
  const s = ctx.crmStats;
  const e = ctx.emailPerformance;
  const c = ctx.contentPerformance;
  const d = ctx.dmPerformance;
  const f = ctx.conversionFunnel;

  let text = `━━━ POOL DE DONNÉES PARTAGÉ KEIROAI ━━━

CRM (${new Date().toLocaleDateString('fr-FR')}):
- ${s.total} prospects total | ${s.withEmail} avec email | ${s.withInstagram} Instagram | ${s.withTiktok} TikTok
- Pipeline: ${s.cold} cold → ${s.warm} warm → ${s.hot} hot | ${s.contacted} contactés | ${s.replied} répondu | ${s.clients} clients | ${s.dead} dead
- Nouveaux: ${s.newLast24h} (24h) | ${s.newLast7d} (7j)

PERFORMANCE EMAIL (7j):
- Envoyés: ${e.sent24h} | Ouverts: ${e.opened24h} (${e.openRate}) | Clics: ${e.clicked24h} (${e.clickRate}) | Réponses: ${e.replied24h} (${e.replyRate})
- Meilleure catégorie: ${e.bestCategory}

PERFORMANCE CONTENU (7j):
- ${c.postsThisWeek} posts planifiés | ${c.publishedThisWeek} publiés | ${c.draftsReady} brouillons prêts
- Instagram: ${c.instagramPublished} publiés | Dernière publication: ${c.lastPublishedDate || 'jamais'}
- Plateformes: ${Object.entries(c.platformBreakdown).map(([k, v]) => `${k}: ${v}`).join(' | ') || 'aucune'}

PERFORMANCE DM (7j):
- ${d.dmsSent7d} DMs envoyés | ${d.dmsQueued} en file d'attente | Taux réponse: ${d.responseRate}
- Meilleur canal: ${d.bestChannel}

FUNNEL DE CONVERSION:
- Visiteurs → Leads: ${f.visiteursToLeads} | Leads → Contactés: ${f.leadsToContacted}
- Contactés → Répondu: ${f.contactedToReplied} | Répondu → Client: ${f.repliedToClient}`;

  if (ctx.activeDirectives.length > 0) {
    text += `\n\n⚡ DIRECTIVES ACTIVES (tu DOIS les suivre) :`;
    for (const dir of ctx.activeDirectives) {
      text += `\n- [${dir.from.toUpperCase()} → toi | Priorité ${dir.priority}] ${dir.message}`;
    }
  }

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

  if (ctx.allAgentLearnings.length > 0) {
    text += `\n\nAPPRENTISSAGES DES AUTRES AGENTS (cross-learning):\n${ctx.allAgentLearnings.map(l => `- ${l}`).join('\n')}`;
  }

  return text;
}
