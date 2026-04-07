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
 * GET /api/agents/dashboard/summary
 * Returns mini dashboard stats for ALL agents + CRM data in a single call
 */
export async function GET() {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Auth required' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const orgId = await resolveOrgId(supabase, user.id);

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
    let emailsSent = 0, emailOpens = 0, emailClicks = 0;
    const emailSeqCounts: Record<string, number> = {};
    for (const p of prospectList) {
      const step = (p.email_sequence_step as number) ?? 0;
      const status = (p.email_sequence_status as string) || 'none';
      emailSeqCounts[status] = (emailSeqCounts[status] || 0) + 1;
      emailOpens += (p.email_open_count as number) || 0;
      emailClicks += (p.email_click_count as number) || 0;
      if (step > 0) emailsSent += step;
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

    // ─── Build per-agent mini dashboards ──────────────────
    const agents: Record<string, { metrics: Array<{ label: string; value: string | number; icon: string }>; recent: Array<{ action: string; date: string }> }> = {
      commercial: {
        metrics: [
          { label: 'Prospects', value: prospectList.length, icon: '🎯' },
          { label: 'Chauds', value: temperatureCount.hot + temperatureCount.warm, icon: '🔥' },
          { label: 'Clients', value: clientCount, icon: '💰' },
        ],
        recent: recentLogs('commercial'),
      },
      email: {
        metrics: [
          { label: 'Envoyés', value: emailsSent, icon: '📧' },
          { label: 'Ouvertures', value: emailOpens, icon: '👁' },
          { label: 'Clics', value: emailClicks, icon: '🖱' },
        ],
        recent: recentLogs('email'),
      },
      dm_instagram: {
        metrics: [
          { label: 'DMs envoyés', value: dmsSent, icon: '💬' },
          { label: 'Réponses', value: dmResponses, icon: '↩' },
          { label: 'Taux', value: dmsSent > 0 ? `${Math.round((dmResponses / dmsSent) * 100)}%` : '—', icon: '📊' },
        ],
        recent: recentLogs('dm_instagram'),
      },
      chatbot: {
        metrics: [
          { label: 'Visiteurs', value: chatbotVisitors, icon: '👤' },
          { label: 'Leads', value: chatbotLeads, icon: '📥' },
          { label: 'Conv.', value: chatbotVisitors > 0 ? `${Math.round((chatbotLeads / chatbotVisitors) * 100)}%` : '—', icon: '📈' },
        ],
        recent: recentLogs('chatbot'),
      },
      content: {
        metrics: [
          { label: 'Publiés', value: contentPublished, icon: '📝' },
          { label: 'Actions', value: contentLogs.length, icon: '⚡' },
          { label: 'Messages', value: chatsByAgent['content'] ?? 0, icon: '💬' },
        ],
        recent: recentLogs('content'),
      },
      seo: {
        metrics: [
          { label: 'Articles', value: seoLogs.length, icon: '📄' },
          { label: 'Actions', value: countLogs('seo'), icon: '🔍' },
          { label: 'Messages', value: chatsByAgent['seo'] ?? 0, icon: '💬' },
        ],
        recent: recentLogs('seo'),
      },
      tiktok_comments: {
        metrics: [
          { label: 'Actions', value: countLogs('tiktok_comments'), icon: '🎵' },
          { label: 'Messages', value: chatsByAgent['tiktok_comments'] ?? 0, icon: '💬' },
        ],
        recent: recentLogs('tiktok_comments'),
      },
      gmaps: {
        metrics: [
          { label: 'Actions', value: countLogs('gmaps'), icon: '📍' },
          { label: 'Messages', value: chatsByAgent['gmaps'] ?? 0, icon: '💬' },
        ],
        recent: recentLogs('gmaps'),
      },
      comptable: {
        metrics: [
          { label: 'Actions', value: countLogs('comptable'), icon: '📊' },
          { label: 'Messages', value: chatsByAgent['comptable'] ?? 0, icon: '💬' },
        ],
        recent: recentLogs('comptable'),
      },
      rh: {
        metrics: [
          { label: 'Actions', value: countLogs('rh'), icon: '📋' },
          { label: 'Messages', value: chatsByAgent['rh'] ?? 0, icon: '💬' },
        ],
        recent: recentLogs('rh'),
      },
      ads: {
        metrics: [
          { label: 'Campagnes', value: adsLogs.length, icon: '🔥' },
          { label: 'Dépenses', value: adSpend > 0 ? `${adSpend}€` : '—', icon: '💸' },
          { label: 'ROAS', value: adSpend > 0 ? `${(adRevenue / adSpend).toFixed(1)}x` : '—', icon: '📈' },
        ],
        recent: recentLogs('ads'),
      },
      marketing: {
        metrics: [
          { label: 'Messages', value: chatsByAgent['marketing'] ?? 0, icon: '💬' },
          { label: 'Actions', value: countLogs('marketing'), icon: '⚡' },
        ],
        recent: recentLogs('marketing'),
      },
      onboarding: {
        metrics: [
          { label: 'Dossier', value: dossier?.completeness_score ? `${dossier.completeness_score}%` : '0%', icon: '📋' },
          { label: 'Agents actifs', value: Object.keys(logsByAgent).length || chatList.length, icon: '🤖' },
          { label: 'Messages', value: chatsByAgent['onboarding'] ?? 0, icon: '💬' },
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

    return NextResponse.json({
      ok: true,
      agents,
      teams,
      crm,
      activityFeed,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    console.error('[DashboardSummary] Error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
