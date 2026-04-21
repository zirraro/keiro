import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { resolveOrgId } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/agents/dashboard/summary?locale=fr|en
 * Returns mini dashboard stats for ALL agents + CRM data in a single call.
 * Action texts + deltas follow the requested locale so the page is fully
 * bilingual without needing a client-side string table for dynamic copy.
 */
export async function GET(request: Request) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Auth required' }, { status: 401 });
    }

    const url = new URL(request.url);
    const locale = url.searchParams.get('locale') === 'en' ? 'en' : 'fr';
    const en = locale === 'en';

    const supabase = getSupabaseAdmin();
    const orgId = await resolveOrgId(supabase, user.id);

    // ── Which agents has this client actually activated? ──
    // Source of truth is org_agent_configs.auto_mode (or setup_completed
    // for legacy rows). We read it once and use it in the "next action"
    // generator so we stop recommending "Activer Hugo" when Hugo is
    // already running per the user's config.
    const { data: configs } = await supabase
      .from('org_agent_configs')
      .select('agent_id, config, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    const activeAgents = new Set<string>();
    const seenCfg = new Set<string>();
    for (const c of configs || []) {
      if (seenCfg.has(c.agent_id)) continue; // duplicate rows — newest wins
      seenCfg.add(c.agent_id);
      if (c.config?.auto_mode === true || c.config?.setup_completed === true) {
        activeAgents.add(c.agent_id);
      }
    }

    // ─── Parallel data loading ─────────────────────────────
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. CRM prospects — paginate to get ALL (PostgREST caps at 1000)
    let allProspects: any[] = [];
    let pFrom = 0;
    let pMore = true;
    while (pMore) {
      const pq = supabase.from('crm_prospects').select('id, status, temperature, score, source, created_at, email').range(pFrom, pFrom + 999);
      if (orgId) pq.eq('org_id', orgId);
      else pq.eq('user_id', user.id);
      const { data: pData } = await pq;
      allProspects = allProspects.concat(pData || []);
      pMore = (pData?.length || 0) === 1000;
      pFrom += 1000;
      if (pFrom >= 20000) break;
    }
    const prospectQuery = { data: allProspects, error: null } as any;

    // 2. Agent logs (for all agents)
    const logsQuery = supabase
      .from('agent_logs')
      .select('id, agent, action, result, status, created_at')
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(500);

    // 3. Chatbot sessions
    const sessionQuery = supabase.from('chatbot_sessions').select('id, visitor_email, created_at');
    if (orgId) sessionQuery.eq('org_id', orgId);
    else sessionQuery.eq('user_id', user.id);

    // 4. Business dossier (onboarding)
    const dossierQuery = supabase
      .from('business_dossiers')
      .select('completeness_score')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    // 5. Agent chats (which agents user has talked to)
    const chatsQuery = supabase
      .from('client_agent_chats')
      .select('agent_id, messages')
      .eq('user_id', user.id);

    const [
      _prospectsDone,
      { data: logs },
      { data: sessions },
      { data: dossier },
      { data: chats },
    ] = await Promise.all([
      Promise.resolve(prospectQuery),
      logsQuery,
      sessionQuery,
      dossierQuery,
      chatsQuery,
    ]);

    const prospects = allProspects;
    const prospectList = prospects ?? [];
    const logList = logs ?? [];
    const sessionList = sessions ?? [];
    const chatList = chats ?? [];

    // ─── Helper: count logs per agent ──────────────────────
    const logsByAgent: Record<string, typeof logList> = {};
    for (const log of logList) {
      const a = log.agent as string;
      if (!logsByAgent[a]) logsByAgent[a] = [];
      logsByAgent[a].push(log);
    }

    const countLogs = (agentId: string) => (logsByAgent[agentId] ?? []).length;
    const recentLogs = (agentId: string, n = 3) =>
      (logsByAgent[agentId] ?? []).slice(0, n).map(l => ({
        action: l.action,
        date: l.created_at,
      }));

    // Chat message counts per agent
    const chatsByAgent: Record<string, number> = {};
    for (const c of chatList) {
      const msgs = Array.isArray(c.messages) ? c.messages.length : 0;
      chatsByAgent[c.agent_id as string] = msgs;
    }

    // ─── CRM data (shared by commercial team) ─────────────
    const pipeline: Record<string, number> = {};
    const temperatureCount = { hot: 0, warm: 0, cold: 0 };
    let clientCount = 0;
    const recentProspects: Array<{ company: string; status: string; temperature: string; created_at: string }> = [];

    for (const p of prospectList) {
      const status = (p.status as string) || 'identifie';
      pipeline[status] = (pipeline[status] || 0) + 1;
      if (status === 'client' || status === 'converted' || status === 'won') clientCount++;
      const temp = (p.temperature as string) || 'cold';
      if (temp === 'hot') temperatureCount.hot++;
      else if (temp === 'warm') temperatureCount.warm++;
      else temperatureCount.cold++;
    }

    const sortedProspects = [...prospectList]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);

    for (const p of sortedProspects) {
      recentProspects.push({
        company: (p.company as string) || (p.email as string) || 'Inconnu',
        status: (p.status as string) || 'identifie',
        temperature: (p.temperature as string) || 'cold',
        created_at: p.created_at as string,
      });
    }

    const prospectsThisWeek = prospectList.filter(
      p => p.created_at && (p.created_at as string) >= oneWeekAgo,
    ).length;

    const crm = {
      total: prospectList.length,
      thisWeek: prospectsThisWeek,
      clients: clientCount,
      conversionRate: prospectList.length > 0 ? Math.round((clientCount / prospectList.length) * 100) : 0,
      pipeline,
      temperature: temperatureCount,
      recentProspects,
    };

    // ─── Email stats ──────────────────────────────────────
    // Column names on crm_prospects are email_opens_count / email_clicks_count
    // (the old email_open_count / email_click_count never existed, which is
    // why the dashboard used to report 0 opens/clicks forever).
    // We also re-query crm_prospects with the columns we actually need —
    // prospectList was selected with a minimal field set upstream.
    const { data: emailProspects } = await supabase
      .from('crm_prospects')
      .select('email_sequence_step, email_sequence_status, email_opens_count, email_clicks_count, last_email_sent_at')
      .eq(orgId ? 'org_id' : 'user_id', orgId || user.id);

    let emailsSent = 0, emailOpens = 0, emailClicks = 0, emailsSentToday = 0;
    const emailSeqCounts: Record<string, number> = {};
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();
    for (const p of emailProspects || []) {
      const step = (p.email_sequence_step as number) ?? 0;
      const status = (p.email_sequence_status as string) || 'none';
      emailSeqCounts[status] = (emailSeqCounts[status] || 0) + 1;
      emailOpens += (p.email_opens_count as number) || 0;
      emailClicks += (p.email_clicks_count as number) || 0;
      if (step > 0) emailsSent += step;
      const lastSent = p.last_email_sent_at as string | null;
      if (lastSent && lastSent >= todayIso) emailsSentToday++;
    }

    // ─── DM stats ─────────────────────────────────────────
    const dmLogs = logsByAgent['dm_instagram'] ?? [];
    const dmsSent = dmLogs.filter(l =>
      typeof l.action === 'string' && (l.action.includes('send') || l.action.includes('dm')),
    ).length;
    const dmResponses = dmLogs.filter(l =>
      typeof l.action === 'string' && (l.action.includes('response') || l.action.includes('reply')),
    ).length;

    // ─── Chatbot stats ────────────────────────────────────
    const chatbotVisitors = sessionList.length;
    const chatbotLeads = sessionList.filter(
      s => typeof s.visitor_email === 'string' && s.visitor_email.length > 0,
    ).length;

    // ─── Content stats ────────────────────────────────────
    const contentLogs = logsByAgent['content'] ?? [];
    const contentPublished = contentLogs.filter(l =>
      typeof l.action === 'string' && (l.action.includes('publish') || l.action.includes('generate')),
    ).length;

    // ─── SEO stats ────────────────────────────────────────
    const seoLogs = logsByAgent['seo'] ?? [];

    // ─── Ads stats ────────────────────────────────────────
    const adsLogs = logsByAgent['ads'] ?? [];
    let adSpend = 0, adRevenue = 0;
    for (const log of adsLogs) {
      if (log.result && typeof log.result === 'object') {
        const r = log.result as Record<string, unknown>;
        if (typeof r.spend === 'number') adSpend += r.spend;
        if (typeof r.revenue === 'number') adRevenue += r.revenue;
      }
    }

    // ─── Prospects added today ──────────────────────────
    const prospectsToday = prospectList.filter(p => new Date(p.created_at as string) >= todayStart).length;
    const prospectsWithEmail = prospectList.filter(p => p.email).length;
    const prospectsWithIG = prospectList.filter(p => (p as any).instagram).length;

    // Email open rate
    const emailOpenRate = emailsSent > 0 ? Math.round((emailOpens / Math.max(emailsSent, 1)) * 100) : 0;

    // ─── Build per-agent mini dashboards (client-relevant stats only) ──
    const agents: Record<string, { metrics: Array<{ label: string; value: string | number; icon: string }>; recent: Array<{ action: string; date: string }> }> = {
      commercial: {
        metrics: [
          { label: 'Prospects', value: prospectList.length, icon: '\u{1F3AF}' },
          { label: 'Chauds', value: temperatureCount.hot, icon: '\u{1F525}' },
          { label: 'Aujourd\'hui', value: `+${prospectsToday}`, icon: '\u{1F4C8}' },
        ],
        recent: recentLogs('commercial'),
      },
      email: {
        metrics: [
          { label: 'Envoyes', value: emailsSent, icon: '\u{1F4E7}' },
          { label: 'Taux ouv.', value: `${emailOpenRate}%`, icon: '\u{1F4EC}' },
          { label: 'Reponses', value: emailClicks, icon: '\u2709\uFE0F' },
        ],
        recent: recentLogs('email'),
      },
      dm_instagram: {
        metrics: [
          { label: 'DMs', value: dmsSent, icon: '\u{1F4AC}' },
          { label: 'Reponses', value: dmResponses, icon: '\u21A9\uFE0F' },
          { label: 'Prospects IG', value: prospectsWithIG, icon: '\u{1F4F8}' },
        ],
        recent: recentLogs('dm_instagram'),
      },
      chatbot: {
        metrics: [
          { label: 'Visiteurs', value: chatbotVisitors, icon: '\u{1F464}' },
          { label: 'Leads', value: chatbotLeads, icon: '\u{1F4E5}' },
          { label: 'Conv.', value: chatbotVisitors > 0 ? `${Math.round((chatbotLeads / chatbotVisitors) * 100)}%` : '0%', icon: '\u{1F4C8}' },
        ],
        recent: recentLogs('chatbot'),
      },
      content: {
        metrics: [
          { label: 'Publications', value: contentPublished, icon: '\u{1F4F1}' },
          { label: 'Cette sem.', value: contentLogs.filter(l => l.created_at && (l.created_at as string) >= oneWeekAgo).length, icon: '\u{1F4C5}' },
        ],
        recent: recentLogs('content'),
      },
      seo: {
        metrics: [
          { label: 'Articles', value: seoLogs.filter(l => typeof l.action === 'string' && l.action.includes('blog')).length, icon: '\u{1F4DD}' },
          { label: 'Mots-cles', value: seoLogs.length, icon: '\u{1F50D}' },
        ],
        recent: recentLogs('seo'),
      },
      tiktok_comments: {
        metrics: [
          { label: 'Engagements', value: countLogs('tiktok_comments'), icon: '\u{1F3B5}' },
        ],
        recent: recentLogs('tiktok_comments'),
      },
      gmaps: {
        metrics: [
          { label: 'Avis repondus', value: countLogs('gmaps'), icon: '\u2B50' },
        ],
        recent: recentLogs('gmaps'),
      },
      comptable: {
        metrics: [
          { label: 'Documents', value: countLogs('comptable'), icon: '\u{1F4B0}' },
        ],
        recent: recentLogs('comptable'),
      },
      rh: {
        metrics: [
          { label: 'Documents', value: countLogs('rh'), icon: '\u2696\uFE0F' },
        ],
        recent: recentLogs('rh'),
      },
      ads: {
        metrics: [
          { label: 'Campagnes', value: adsLogs.length, icon: '\u{1F4E2}' },
          { label: 'Budget', value: adSpend > 0 ? `${adSpend}\u20AC` : '\u2014', icon: '\u{1F4B8}' },
        ],
        recent: recentLogs('ads'),
      },
      marketing: {
        metrics: [
          { label: 'Recommandations', value: countLogs('marketing'), icon: '\u{1F4CA}' },
        ],
        recent: recentLogs('marketing'),
      },
      onboarding: {
        metrics: [
          { label: 'Profil', value: dossier?.completeness_score ? `${dossier.completeness_score}%` : '0%', icon: '\u{1F4CB}' },
          { label: 'Agents', value: Object.keys(logsByAgent).length || chatList.length, icon: '\u{1F916}' },
        ],
        recent: recentLogs('onboarding'),
      },
    };

    // ─── Team aggregates ──────────────────────────────────
    const teams = {
      commercial: {
        totalActions: countLogs('commercial') + countLogs('email') + countLogs('dm_instagram') + countLogs('chatbot'),
        prospects: prospectList.length,
        clients: clientCount,
        conversionRate: crm.conversionRate,
      },
      visibilite: {
        totalActions: countLogs('content') + countLogs('seo') + countLogs('tiktok_comments') + countLogs('gmaps'),
        contentPublished,
        seoArticles: seoLogs.length,
      },
      finance: {
        totalActions: countLogs('comptable') + countLogs('rh') + countLogs('ads'),
        adSpend,
        adRevenue,
      },
      strategie: {
        totalActions: countLogs('marketing') + countLogs('onboarding'),
        dossierScore: dossier?.completeness_score ?? 0,
        agentsDiscovered: Object.keys(logsByAgent).length || chatList.length,
      },
    };

    // ─── Activity feed (last 10 across all agents) ────────
    const activityFeed = logList.slice(0, 10).map(l => ({
      agent: l.agent,
      action: l.action,
      status: l.status,
      date: l.created_at,
    }));

    // ─── Smart actions — what the client should do next ──────
    // Each action is priority-sorted AND gated on real activation state
    // (org_agent_configs) so we don't tell the user "Activer Hugo" when
    // Hugo already ran 119 emails today. Copy is bilingual.
    const actions: Array<{ icon: string; text: string; cta?: string; link?: string; priority: number }> = [];

    if (!dossier?.completeness_score || dossier.completeness_score < 80) {
      actions.push({
        icon: '\u{1F4CB}',
        text: en
          ? 'Complete your business profile so your agents are more effective'
          : 'Complète ton profil business pour que tes agents soient plus efficaces',
        cta: en ? 'Complete' : 'Compléter',
        link: '/assistant/agent/onboarding', priority: 1,
      });
    }
    if (temperatureCount.hot > 0) {
      actions.push({
        icon: '\u{1F525}',
        text: en
          ? `${temperatureCount.hot} hot prospect${temperatureCount.hot > 1 ? 's' : ''} — reach out now`
          : `${temperatureCount.hot} prospect${temperatureCount.hot > 1 ? 's' : ''} chaud${temperatureCount.hot > 1 ? 's' : ''} — contacte-les vite !`,
        cta: en ? 'Open CRM' : 'Voir le CRM',
        link: '/assistant?tab=crm', priority: 2,
      });
    }
    if (prospectsToday > 0) {
      actions.push({
        icon: '\u{1F4C8}',
        text: en
          ? `+${prospectsToday} new prospect${prospectsToday > 1 ? 's' : ''} added today by Léo`
          : `+${prospectsToday} nouveau${prospectsToday > 1 ? 'x' : ''} prospect${prospectsToday > 1 ? 's' : ''} ajouté${prospectsToday > 1 ? 's' : ''} aujourd'hui par Léo`,
        priority: 5,
      });
    }
    // "Activer Hugo" only when he has NEVER sent an email AND is not activated.
    if (!activeAgents.has('email') && emailsSent === 0 && prospectsWithEmail > 0) {
      actions.push({
        icon: '\u{1F4E7}',
        text: en
          ? `${prospectsWithEmail} prospects with email — activate Hugo to start outreach`
          : `${prospectsWithEmail} prospects avec email — active Hugo pour lancer la prospection`,
        cta: en ? 'Activate Hugo' : 'Activer Hugo',
        link: '/assistant/agent/email', priority: 3,
      });
    } else if (activeAgents.has('email') && emailsSentToday > 0) {
      // Hugo is live and working — celebrate the delta instead of asking to activate.
      actions.push({
        icon: '\u{1F4E7}',
        text: en
          ? `Hugo sent ${emailsSentToday} email${emailsSentToday > 1 ? 's' : ''} today${emailOpens > 0 ? ` · ${emailOpens} opens so far` : ''}`
          : `Hugo a envoyé ${emailsSentToday} email${emailsSentToday > 1 ? 's' : ''} aujourd'hui${emailOpens > 0 ? ` · ${emailOpens} ouvertures déjà` : ''}`,
        priority: 6,
      });
    }
    if (!activeAgents.has('dm_instagram') && dmsSent === 0 && prospectsWithIG > 0) {
      actions.push({
        icon: '\u{1F4AC}',
        text: en
          ? `${prospectsWithIG} Instagram prospects — activate Léna to send DMs`
          : `${prospectsWithIG} prospects Instagram — active Léna pour envoyer des DMs`,
        cta: en ? 'Activate Léna' : 'Activer Léna',
        link: '/assistant/agent/dm_instagram', priority: 3,
      });
    }
    if (!activeAgents.has('content') && contentPublished === 0) {
      actions.push({
        icon: '\u{1F4F1}',
        text: en
          ? 'No content published yet — activate Jade to start posting'
          : 'Aucun contenu publié — active Jade pour commencer',
        cta: en ? 'Activate Jade' : 'Activer Jade',
        link: '/assistant/agent/content', priority: 4,
      });
    }
    if (emailsSent > 0 && emailOpenRate > 0) {
      actions.push({
        icon: '\u{1F4CA}',
        text: en
          ? `Email open rate: ${emailOpenRate}% — ${emailOpenRate > 30 ? 'excellent!' : emailOpenRate > 15 ? 'average' : 'needs work'}`
          : `Taux d'ouverture email : ${emailOpenRate}% — ${emailOpenRate > 30 ? 'excellent !' : emailOpenRate > 15 ? 'dans la moyenne' : 'à améliorer'}`,
        priority: 6,
      });
    }

    actions.sort((a, b) => a.priority - b.priority);

    // Actions today from logs (used as "Actions" momentum stat — delta)
    const actionsToday = logList.filter(l => l.created_at && (l.created_at as string) >= todayIso).length;

    // ─── Global stats (top of page) ──────────────────────
    // We split every metric into TODAY (delta we want to see rise) and
    // TOTAL (context). The UI renders the delta big and the total small.
    const globalStats = {
      prospectsTotal: prospectList.length,
      prospectsToday,
      prospectsHot: temperatureCount.hot,
      emailsSent,
      emailsSentToday,
      emailOpenRate,
      emailOpens,
      dmsSent,
      contentPublished,
      conversionRate: crm.conversionRate,
      actionsToday,
      actionsTotal: logList.length,
      activeAgentsCount: activeAgents.size,
      activeAgents: Array.from(activeAgents),
    };

    return NextResponse.json({
      ok: true,
      locale,
      agents,
      teams,
      crm,
      activityFeed,
      actions,
      globalStats,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    console.error('[DashboardSummary] Error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
