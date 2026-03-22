import { NextRequest, NextResponse } from 'next/server';
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

/** Fetch the last 5 chat messages for this user+agent */
async function getRecentChats(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  agentId: string,
) {
  const { data: chatRow } = await supabase
    .from('client_agent_chats')
    .select('messages')
    .eq('user_id', userId)
    .eq('agent_id', agentId)
    .single();

  const messages: Array<{ role: string; content: string; timestamp: string }> =
    Array.isArray(chatRow?.messages) ? chatRow.messages : [];

  return messages.slice(-5);
}

// ---------------------------------------------------------------------------
// Per-agent data loaders
// ---------------------------------------------------------------------------

async function getMarketingData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
) {
  // Total messages exchanged
  const { data: chatRow } = await supabase
    .from('client_agent_chats')
    .select('messages')
    .eq('user_id', userId)
    .eq('agent_id', 'marketing')
    .single();

  const allMessages: unknown[] = Array.isArray(chatRow?.messages)
    ? chatRow.messages
    : [];
  const totalMessages = allMessages.length;

  // Agent logs count
  const { count: logsCount } = await supabase
    .from('agent_logs')
    .select('id', { count: 'exact', head: true })
    .eq('agent', 'marketing')
    .eq('user_id', userId);

  // Recent recommendations (last 5 logs with action containing 'recommend')
  const { data: recommendations } = await supabase
    .from('agent_logs')
    .select('id, action, result, created_at')
    .eq('agent', 'marketing')
    .eq('user_id', userId)
    .ilike('action', '%recommend%')
    .order('created_at', { ascending: false })
    .limit(5);

  return {
    totalMessages,
    logsCount: logsCount ?? 0,
    recommendations: recommendations ?? [],
  };
}

async function getCommercialData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  orgId: string | null,
) {
  // Prospects scoped to org or user
  const prospectQuery = supabase
    .from('crm_prospects')
    .select('*');

  if (orgId) {
    prospectQuery.eq('org_id', orgId);
  } else {
    prospectQuery.eq('user_id', userId);
  }

  const { data: prospects } = await prospectQuery;
  const prospectList = prospects ?? [];

  // Activities for those prospects
  const prospectIds = prospectList.map((p) => p.id);
  let activities: Array<Record<string, unknown>> = [];
  if (prospectIds.length > 0) {
    const { data: acts } = await supabase
      .from('crm_activities')
      .select('*')
      .in('prospect_id', prospectIds)
      .order('created_at', { ascending: false })
      .limit(20);
    activities = acts ?? [];
  }

  // Pipeline: count per status
  const pipeline: Record<string, number> = {};
  for (const p of prospectList) {
    const status = (p.status as string) || 'unknown';
    pipeline[status] = (pipeline[status] || 0) + 1;
  }

  // Score distribution
  const scoreDistribution = { hot: 0, warm: 0, cold: 0, dead: 0, unscored: 0 };
  for (const p of prospectList) {
    const temp = (p.temperature as string) || 'unscored';
    if (temp in scoreDistribution) {
      scoreDistribution[temp as keyof typeof scoreDistribution] += 1;
    } else {
      scoreDistribution.unscored += 1;
    }
  }

  const total = prospectList.length;
  const converted = prospectList.filter(
    (p) => p.status === 'converted' || p.status === 'won',
  ).length;
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

  return {
    prospects: prospectList,
    activities,
    pipeline,
    stats: {
      total,
      hot: scoreDistribution.hot,
      warm: scoreDistribution.warm,
      cold: scoreDistribution.cold,
      conversionRate,
    },
  };
}

async function getEmailData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  orgId: string | null,
) {
  // Prospects for email stats
  const query = supabase
    .from('crm_prospects')
    .select('email_sequence_status, email_sequence_step, email_open_count, email_click_count');

  if (orgId) {
    query.eq('org_id', orgId);
  } else {
    query.eq('user_id', userId);
  }

  const { data: prospects } = await query;
  const prospectList = prospects ?? [];

  // Count by email_sequence_status
  const statusCounts: Record<string, number> = {};
  let totalOpens = 0;
  let totalClicks = 0;
  let totalWithEmail = 0;

  for (const p of prospectList) {
    const status = (p.email_sequence_status as string) || 'none';
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const opens = (p.email_open_count as number) || 0;
    const clicks = (p.email_click_count as number) || 0;
    if (opens > 0 || clicks > 0) totalWithEmail++;
    totalOpens += opens;
    totalClicks += clicks;
  }

  // Sequence progress: how many at each step
  const sequenceProgress: Record<number, number> = {};
  for (const p of prospectList) {
    const step = (p.email_sequence_step as number) ?? 0;
    sequenceProgress[step] = (sequenceProgress[step] || 0) + 1;
  }

  return {
    statusCounts,
    totalProspects: prospectList.length,
    totalOpens,
    totalClicks,
    openRate:
      totalWithEmail > 0
        ? Math.round((totalOpens / Math.max(totalWithEmail, 1)) * 100)
        : 0,
    clickRate:
      totalWithEmail > 0
        ? Math.round((totalClicks / Math.max(totalWithEmail, 1)) * 100)
        : 0,
    sequenceProgress,
  };
}

async function getContentData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
) {
  // Content calendar items from agent_logs
  const { data: contentLogs } = await supabase
    .from('agent_logs')
    .select('id, action, result, created_at')
    .eq('agent', 'content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const logs = contentLogs ?? [];
  const publicationCount = logs.filter(
    (l) =>
      typeof l.action === 'string' &&
      (l.action.includes('publish') || l.action.includes('generate')),
  ).length;

  return {
    calendarItems: logs,
    publicationCount,
    recentContent: logs.slice(0, 5),
  };
}

async function getSeoData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
) {
  // Try seo_blog_posts first, fall back to agent_logs
  const { data: blogPosts, error: blogError } = await supabase
    .from('seo_blog_posts')
    .select('id, title, status, keyword, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  let postsCount = 0;
  let recentActions: Array<Record<string, unknown>> = [];
  let keywords: string[] = [];

  if (!blogError && blogPosts && blogPosts.length > 0) {
    postsCount = blogPosts.length;
    recentActions = blogPosts;
    keywords = Array.from(
      new Set(
        blogPosts
          .map((p) => p.keyword as string)
          .filter(Boolean),
      ),
    );
  } else {
    // Fallback to agent_logs
    const { data: seoLogs } = await supabase
      .from('agent_logs')
      .select('id, action, result, created_at')
      .eq('agent', 'seo')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    const logs = seoLogs ?? [];
    postsCount = logs.length;
    recentActions = logs;
  }

  return {
    postsCount,
    keywordsTracked: keywords,
    recentActions,
  };
}

async function getAdsData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
) {
  const { data: adsLogs } = await supabase
    .from('agent_logs')
    .select('id, action, result, created_at')
    .eq('agent', 'ads')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const logs = adsLogs ?? [];

  // Extract metrics from log results where available
  let totalSpend = 0;
  let totalRevenue = 0;
  for (const log of logs) {
    if (log.result && typeof log.result === 'object') {
      const r = log.result as Record<string, unknown>;
      if (typeof r.spend === 'number') totalSpend += r.spend;
      if (typeof r.revenue === 'number') totalRevenue += r.revenue;
    }
  }

  const roas = totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0;

  return {
    campaignCount: logs.length,
    totalSpend,
    totalRevenue,
    roas,
    recentCampaigns: logs.slice(0, 10),
  };
}

async function getComptableData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
) {
  const { data: financialLogs } = await supabase
    .from('agent_logs')
    .select('id, action, result, created_at')
    .eq('agent', 'comptable')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const logs = financialLogs ?? [];

  return {
    totalEntries: logs.length,
    recentLogs: logs.slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

const AGENTS_WITH_DASHBOARDS = new Set([
  'marketing',
  'commercial',
  'email',
  'content',
  'seo',
  'ads',
  'comptable',
]);

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Auth required' },
        { status: 401 },
      );
    }

    const agentId = request.nextUrl.searchParams.get('agent_id');
    if (!agentId) {
      return NextResponse.json(
        { ok: false, error: 'agent_id parameter required' },
        { status: 400 },
      );
    }

    if (!AGENTS_WITH_DASHBOARDS.has(agentId)) {
      return NextResponse.json({ ok: true, hasDashboard: false });
    }

    const supabase = getSupabaseAdmin();
    const orgId = await resolveOrgId(supabase, user.id);

    // Fetch recent chats in parallel with agent-specific data
    const recentChatsPromise = getRecentChats(supabase, user.id, agentId);

    let agentData: Record<string, unknown> = {};

    switch (agentId) {
      case 'marketing':
        agentData = await getMarketingData(supabase, user.id);
        break;
      case 'commercial':
        agentData = await getCommercialData(supabase, user.id, orgId);
        break;
      case 'email':
        agentData = await getEmailData(supabase, user.id, orgId);
        break;
      case 'content':
        agentData = await getContentData(supabase, user.id);
        break;
      case 'seo':
        agentData = await getSeoData(supabase, user.id);
        break;
      case 'ads':
        agentData = await getAdsData(supabase, user.id);
        break;
      case 'comptable':
        agentData = await getComptableData(supabase, user.id);
        break;
    }

    const recentChats = await recentChatsPromise;

    return NextResponse.json({
      ok: true,
      hasDashboard: true,
      agent_id: agentId,
      data: agentData,
      recentChats,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Erreur serveur';
    console.error('[AgentDashboard] Error:', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
