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
import { getActiveLearnings, getAllAgentLearnings, getTeamLearnings, getAllHistoricalLearnings, getAgentFeedbacks, formatLearningsForPrompt, type AgentLearning, type AgentFeedback } from './learning';
import { getAgentAvatar, formatAvatarForPrompt, type AgentAvatarConfig } from './avatar';
import { getOrgContext, formatOrgContextForPrompt } from '../tenant';

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
    failedThisWeek: number;
    failureReasons: string[];
    platformBreakdown: Record<string, number>;
    lastPublishedDate: string;
    instagramPublished: number;
  };
  dmPerformance: {
    igDMsPrepared: number;
    ttDMsPrepared: number;
    igDMsSent: number;
    ttDMsSent: number;
    totalSent: number;
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
  structuredLearnings: AgentLearning[];
  structuredOtherLearnings: AgentLearning[];
  teamLearnings: AgentLearning[];
  historicalLearnings: AgentLearning[];
  agentFeedbacks: AgentFeedback[];
  topProspects: Array<{ company: string; score: number; temperature: string; status: string }>;
}

/**
 * Apply optional org_id filter to a Supabase query builder.
 * When orgId is provided, adds .eq('org_id', orgId).
 * When not provided, returns the query unchanged (backwards compatible).
 */
function withOrgFilter<T>(query: T, orgId?: string): T {
  if (orgId) {
    return (query as any).eq('org_id', orgId) as T;
  }
  return query;
}

/**
 * Load shared CRM context that any agent can use.
 * Gives each agent visibility into the full pipeline state + performance metrics.
 *
 * @param orgId - Optional organization ID for multi-tenant filtering.
 *                When provided, all queries are scoped to that org.
 *                When omitted, behavior is unchanged (single-tenant mode).
 */
export async function loadSharedContext(
  supabase: SupabaseClient,
  agentName: string,
  orgId?: string,
): Promise<AgentContext> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // CRM stats (fast parallel queries) — scoped to org when orgId provided
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
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('email', 'is', null), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('instagram', 'is', null), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('tiktok_handle', 'is', null), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('website', 'is', null), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'hot'), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'warm'), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'cold'), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'dead'), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'contacte'), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'repondu'), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).in('status', ['client', 'sprint']), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo), orgId),
    withOrgFilter(supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo), orgId),
  ]);

  // Email performance (last 24h from crm_activities)
  const { data: emailEvents } = await withOrgFilter(supabase
    .from('crm_activities')
    .select('type, data')
    .eq('type', 'email')
    .gte('created_at', twentyFourHoursAgo), orgId);

  const { data: emailOpenEvents } = await withOrgFilter(supabase
    .from('crm_activities')
    .select('type, data')
    .in('type', ['email_opened', 'email_clicked', 'email_replied'])
    .gte('created_at', sevenDaysAgo), orgId);

  const sent24h = emailEvents?.length || 0;
  const opened24h = emailOpenEvents?.filter((e: any) => e.type === 'email_opened')?.length || 0;
  const clicked24h = emailOpenEvents?.filter((e: any) => e.type === 'email_clicked')?.length || 0;
  const replied24h = emailOpenEvents?.filter((e: any) => e.type === 'email_replied')?.length || 0;

  // Best category from recent email logs
  let bestCategory = 'N/A';
  const { data: recentEmailLogs } = await withOrgFilter(supabase
    .from('agent_logs')
    .select('data')
    .eq('agent', 'email')
    .in('action', ['daily_cold', 'daily_warm'])
    .order('created_at', { ascending: false })
    .limit(3), orgId);
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
  const { data: topProspectsData } = await withOrgFilter(supabase
    .from('crm_prospects')
    .select('company, score, temperature, status')
    .in('temperature', ['hot', 'warm'])
    .not('status', 'in', '("perdu","client","sprint")')
    .order('score', { ascending: false })
    .limit(5), orgId);

  // ── CONTENT PERFORMANCE ──
  const { data: contentPosts } = await withOrgFilter(supabase
    .from('content_calendar')
    .select('platform, status, scheduled_date, published_at, publish_error, publish_diagnostic')
    .gte('scheduled_date', sevenDaysAgo.split('T')[0])
    .order('scheduled_date', { ascending: false }), orgId);

  const platformBreakdown: Record<string, number> = {};
  let publishedThisWeek = 0;
  let instagramPublished = 0;
  let lastPublishedDate = '';
  let failedThisWeek = 0;
  const failureReasons: string[] = [];
  for (const p of contentPosts || []) {
    platformBreakdown[p.platform] = (platformBreakdown[p.platform] || 0) + 1;
    if (p.status === 'published') {
      publishedThisWeek++;
      if (p.platform === 'instagram') instagramPublished++;
      if (!lastPublishedDate && p.published_at) lastPublishedDate = p.published_at;
    }
    if (p.status === 'publish_failed') {
      failedThisWeek++;
      const diag = p.publish_diagnostic as any;
      if (diag?.reason) failureReasons.push(`${p.platform}: ${diag.reason} — ${diag.detail || p.publish_error || ''}`);
      else if (p.publish_error) failureReasons.push(`${p.platform}: ${p.publish_error}`);
    }
  }
  const { count: draftsReady } = await withOrgFilter(supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'draft'), orgId);

  // ── DM PERFORMANCE (from dm_queue table) ──
  // Prepared = status 'pending' (agent wrote the DM, founder hasn't sent yet)
  // Sent = status 'sent' (founder manually sent the DM)
  const [
    { count: igPrepared },
    { count: ttPrepared },
    { count: igSent },
    { count: ttSent },
    { count: dmsQueued },
  ] = await Promise.all([
    withOrgFilter(supabase.from('dm_queue').select('id', { count: 'exact', head: true }).eq('channel', 'instagram').eq('status', 'pending').gte('created_at', sevenDaysAgo), orgId),
    withOrgFilter(supabase.from('dm_queue').select('id', { count: 'exact', head: true }).eq('channel', 'tiktok').eq('status', 'pending').gte('created_at', sevenDaysAgo), orgId),
    withOrgFilter(supabase.from('dm_queue').select('id', { count: 'exact', head: true }).eq('channel', 'instagram').eq('status', 'sent').gte('created_at', sevenDaysAgo), orgId),
    withOrgFilter(supabase.from('dm_queue').select('id', { count: 'exact', head: true }).eq('channel', 'tiktok').eq('status', 'sent').gte('created_at', sevenDaysAgo), orgId),
    withOrgFilter(supabase.from('dm_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'), orgId),
  ]);

  const igDMsPrepared = igPrepared || 0;
  const ttDMsPrepared = ttPrepared || 0;
  const igDMsSent = igSent || 0;
  const ttDMsSent = ttSent || 0;
  const totalSent = igDMsSent + ttDMsSent;

  // Replies from crm_activities
  const { data: dmReplyEvents } = await withOrgFilter(supabase
    .from('crm_activities')
    .select('type')
    .eq('type', 'dm_replied')
    .gte('created_at', sevenDaysAgo), orgId);
  const dmsReplied7d = dmReplyEvents?.length || 0;

  const bestDMChannel = (igDMsPrepared + igDMsSent) >= (ttDMsPrepared + ttDMsSent) ? 'instagram' : 'tiktok';

  // ── ACTIVE DIRECTIVES from CEO/Marketing ──
  const { data: directives } = await withOrgFilter(supabase
    .from('agent_orders')
    .select('from_agent, order_type, payload, priority, created_at')
    .in('to_agent', [agentName, 'all'])
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(5), orgId);

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
  const { data: recentReports } = await withOrgFilter(supabase
    .from('agent_logs')
    .select('agent, action, data, created_at')
    .eq('action', 'report_to_ceo')
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(15), orgId);

  let recentAgentWork = '';
  if (recentReports && recentReports.length > 0) {
    recentAgentWork = recentReports
      .filter((r: any) => r.agent !== agentName)
      .map((r: any) => `[${r.agent}] ${r.data?.message || r.action}`)
      .join('\n');
  }

  // Load this agent's own learnings
  const { data: memories } = await withOrgFilter(supabase
    .from('agent_logs')
    .select('data')
    .eq('agent', agentName)
    .eq('action', 'memory')
    .order('created_at', { ascending: false })
    .limit(10), orgId);

  const learnings = (memories || [])
    .map((m: any) => m.data?.learning)
    .filter(Boolean);

  // Load ALL agents' learnings (cross-pollination)
  const { data: allMemories } = await withOrgFilter(supabase
    .from('agent_logs')
    .select('agent, data')
    .eq('action', 'memory')
    .neq('agent', agentName)
    .order('created_at', { ascending: false })
    .limit(15), orgId);

  const allAgentLearnings = (allMemories || [])
    .map((m: any) => `[${m.agent}] ${m.data?.learning}`)
    .filter((l: string) => l && !l.endsWith('undefined'));

  // Structured learnings (hybrid 3-tier: signal/pattern/insight) + feedbacks + historical memory
  const [structuredLearnings, structuredOtherLearnings, structuredTeamLearnings, agentFeedbacks, historicalLearnings] = await Promise.all([
    getActiveLearnings(supabase, agentName, undefined, orgId),
    getAllAgentLearnings(supabase, agentName, orgId),
    getTeamLearnings(supabase, agentName, orgId),
    getAgentFeedbacks(supabase, agentName, undefined, orgId),
    // Load ALL historical learnings at Rule+ (score >= 65) regardless of expiry
    // This ensures optimization/adaptation knowledge is NEVER lost
    getAllHistoricalLearnings(supabase, { minConfidence: 65, limit: 100, orgId: orgId || null }),
  ]);

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
      clickRate: opened24h > 0 ? `${(clicked24h / opened24h * 100).toFixed(1)}%` : 'N/A',
      replyRate: sent24h > 0 ? `${(replied24h / sent24h * 100).toFixed(1)}%` : 'N/A',
      bestCategory,
    },
    contentPerformance: {
      postsThisWeek: contentPosts?.length || 0,
      publishedThisWeek,
      draftsReady: draftsReady || 0,
      failedThisWeek,
      failureReasons,
      platformBreakdown,
      lastPublishedDate,
      instagramPublished,
    },
    dmPerformance: {
      igDMsPrepared,
      ttDMsPrepared,
      igDMsSent,
      ttDMsSent,
      totalSent,
      dmsQueued: dmsQueued || 0,
      responseRate: totalSent > 0 ? `${(dmsReplied7d / totalSent * 100).toFixed(1)}%` : 'N/A',
      bestChannel: bestDMChannel,
    },
    conversionFunnel,
    activeDirectives,
    recentAgentWork,
    learnings,
    allAgentLearnings,
    structuredLearnings,
    structuredOtherLearnings,
    teamLearnings: structuredTeamLearnings,
    historicalLearnings,
    agentFeedbacks,
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
  orgId?: string,
) {
  // Complete any previous directives of the same type to avoid stacking
  let completeQuery = supabase.from('agent_orders')
    .update({ status: 'completed' })
    .eq('from_agent', fromAgent)
    .eq('to_agent', toAgent)
    .eq('order_type', orderType)
    .eq('status', 'pending');
  if (orgId) completeQuery = completeQuery.eq('org_id', orgId);
  await completeQuery;

  await supabase.from('agent_orders').insert({
    from_agent: fromAgent,
    to_agent: toAgent,
    order_type: orderType,
    priority,
    payload: { directive, issued_at: new Date().toISOString() },
    status: 'pending',
    created_at: new Date().toISOString(),
    ...(orgId ? { org_id: orgId } : {}),
  });
}

/**
 * Mark a directive as completed after an agent has acted on it.
 */
export async function completeDirective(supabase: SupabaseClient, agentName: string, orderType: string, orgId?: string) {
  let query = supabase.from('agent_orders')
    .update({ status: 'completed', result: { completed_at: new Date().toISOString() } })
    .eq('to_agent', agentName)
    .eq('order_type', orderType)
    .eq('status', 'pending');
  if (orgId) query = query.eq('org_id', orgId);
  await query;
}

/**
 * Format shared context as a string for injection into AI prompts.
 * This is the SHARED DATA POOL — every agent sees the same intelligence.
 *
 * @param orgContextBlock - Optional org context prompt block (from formatOrgContextForPrompt).
 *                          Appended at the end when provided (multi-tenant mode).
 */
export function formatContextForPrompt(ctx: AgentContext, orgContextBlock?: string): string {
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
- ${c.postsThisWeek} posts planifiés | ${c.publishedThisWeek} publiés | ${c.draftsReady} brouillons prêts${c.failedThisWeek > 0 ? ` | ⚠️ ${c.failedThisWeek} ÉCHECS DE PUBLICATION` : ''}
- Instagram: ${c.instagramPublished} publiés | Dernière publication: ${c.lastPublishedDate || 'jamais'}
- Plateformes: ${Object.entries(c.platformBreakdown).map(([k, v]) => `${k}: ${v}`).join(' | ') || 'aucune'}${c.failureReasons.length > 0 ? `\n- 🚨 ERREURS PUBLICATION:\n${c.failureReasons.map(r => `  • ${r}`).join('\n')}` : ''}

PERFORMANCE DM (7j):
- Préparés: ${d.igDMsPrepared} Instagram | ${d.ttDMsPrepared} TikTok (envoi manuel par le fondateur)
- Envoyés (manuellement): ${d.igDMsSent} Instagram | ${d.ttDMsSent} TikTok | Total envoyés: ${d.totalSent}
- ${d.dmsQueued} en file d'attente | Taux réponse (sur envoyés): ${d.responseRate}
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

  // Structured learnings (new system) take priority
  const structuredText = formatLearningsForPrompt(ctx.structuredLearnings, ctx.structuredOtherLearnings, ctx.agentFeedbacks, ctx.teamLearnings);
  if (structuredText) {
    text += structuredText;
  }

  // ── MÉMOIRE HISTORIQUE — confirmed knowledge that NEVER expires ──
  // Includes ALL learnings at Rule+ (score >= 65) regardless of expiry date
  // This is the permanent optimization/adaptation knowledge base
  if (ctx.historicalLearnings && ctx.historicalLearnings.length > 0) {
    // Deduplicate: exclude learnings already shown in structured sections
    const shownIds = new Set([
      ...ctx.structuredLearnings.map(l => l.id),
      ...ctx.structuredOtherLearnings.map(l => l.id),
      ...(ctx.teamLearnings || []).map(l => l.id),
    ]);
    const historicalOnly = ctx.historicalLearnings.filter(l => l.id && !shownIds.has(l.id));
    if (historicalOnly.length > 0) {
      text += `\n\n📚 MÉMOIRE HISTORIQUE (connaissances confirmées, score 65+, JAMAIS perdues) :`;
      text += `\n→ Ces learnings sont le fruit de l'amélioration, l'optimisation et l'adaptation continues. APPLIQUE-LES TOUJOURS.`;
      for (const l of historicalOnly.slice(0, 30)) {
        const icon = l.confidence >= 85 ? '💎' : '📏';
        const expired = l.expires_at && new Date(l.expires_at) < new Date() ? ' [historique]' : '';
        text += `\n- ${icon} [${l.agent}/${l.category}] ${l.learning} (score: ${l.confidence}, ${l.confirmations} conf.${l.revenue_linked ? ', CA réel' : ''}${expired})`;
      }
    }
  }

  // Legacy learnings (backward compatible, will be phased out)
  if (ctx.learnings.length > 0 && ctx.structuredLearnings.length === 0) {
    text += `\n\nTES APPRENTISSAGES:\n${ctx.learnings.map(l => `- ${l}`).join('\n')}`;
  }

  if (ctx.allAgentLearnings.length > 0 && ctx.structuredOtherLearnings.length === 0) {
    text += `\n\nAPPRENTISSAGES DES AUTRES AGENTS (cross-learning):\n${ctx.allAgentLearnings.map(l => `- ${l}`).join('\n')}`;
  }

  // ── Permanent business rules (founder-validated, all agents must follow) ──
  text += `

━━━ RÈGLES FONDAMENTALES KEIROAI (PERMANENT — tous agents) ━━━

OFFRE COMMERCIALE :
- Essai gratuit 30 jours — accès COMPLET à tous les agents et toutes les fonctionnalités
- Carte bancaire requise mais AUCUN débit pendant l'essai (0€)
- Annulation à tout moment, sans engagement
- Après l'essai : choix du plan (Créateur 49€, Pro 99€, Fondateurs 149€, etc.)
- JAMAIS dire "7 jours", "3 visuels + 1 vidéo", ou "sans carte bancaire"

QUALITÉ EMAILS :
- Structure impeccable : pas de virgule flottante en début de phrase, pas de blanc inutile
- Corps du mail cohérent : introduction → valeur → CTA, pas de sauts logiques
- Variables {{company}}, {{first_name}}, {{quartier}} doivent s'intégrer naturellement dans la phrase
- Si une variable est vide, la phrase doit rester grammaticalement correcte

QUALITÉ CONTENU :
- JAMAIS d'images en double : chaque visual_description doit être UNIQUE (scène, style, couleur, sujet)
- Couleurs : MAX 1 post violet sur 5. Alterner ambre, bleu nuit, vert sauge, corail, noir, blanc crème
- Cibles prospects : ROTATION obligatoire — restaurant, coiffeur, boutique, coach, fleuriste, freelance, artisan (pas 2 posts de suite sur la même cible)
- Styles visuels : 9 styles définis (isométrique, photo réaliste, minimaliste, illustration, 3D clay, collage, gradient, flat design), rotation stricte
- Pilier P0 Actualités/Tendances : 2-3x/semaine minimum, lier l'actu à KeiroAI et au business du commerçant
- KeiroAI utilise sa propre fonctionnalité d'actu/tendances — c'est le cœur différenciateur

ADAPTATION & MÉMOIRE :
- Les agents s'adaptent à chaque utilisation et à chaque client
- Chaque interaction est une opportunité d'apprentissage
- Les learnings cross-agents permettent une intelligence collective
- MÉMOIRE HISTORIQUE : toutes les connaissances confirmées (score 65+) sont PERMANENTES et JAMAIS perdues
- Les optimisations, améliorations et adaptations passées restent TOUJOURS dans le pool partagé
- En mode multi-tenant : chaque client a ses propres données, les insights anonymisés sont partagés`;

  // Multi-tenant: append org context when available
  if (orgContextBlock) {
    text += `\n\n${orgContextBlock}`;
  }

  return text;
}

/**
 * Load shared context + avatar in one call. Returns formatted prompt block
 * with identity first, then shared data pool.
 *
 * @param orgId - Optional organization ID for multi-tenant scoping.
 *                When provided, loads org context and applies org avatar overrides.
 */
export async function loadContextWithAvatar(
  supabase: SupabaseClient,
  agentName: string,
  orgId?: string,
): Promise<{ context: AgentContext; avatar: AgentAvatarConfig; prompt: string }> {
  const [context, avatar, orgContext] = await Promise.all([
    loadSharedContext(supabase, agentName, orgId),
    getAgentAvatar(supabase, agentName, orgId),
    orgId ? getOrgContext(supabase, orgId) : Promise.resolve(null),
  ]);
  const avatarBlock = formatAvatarForPrompt(avatar);
  const orgContextBlock = orgContext ? formatOrgContextForPrompt(orgContext) : undefined;
  const contextBlock = formatContextForPrompt(context, orgContextBlock);
  return {
    context,
    avatar,
    prompt: avatarBlock + '\n\n' + contextBlock,
  };
}
