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
  orgId: string | null,
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

  // --- GLOBAL DASHBOARD: cross-agent overview ---

  // Commercial domain: prospects this week, conversions, estimated revenue
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const prospectQuery = supabase
    .from('crm_prospects')
    .select('id, status, temperature, created_at');
  if (orgId) {
    prospectQuery.eq('org_id', orgId);
  } else {
    prospectQuery.eq('user_id', userId);
  }
  const { data: allProspects } = await prospectQuery;
  const prospectList = allProspects ?? [];

  const prospectsThisWeek = prospectList.filter(
    (p) => p.created_at && p.created_at >= oneWeekAgo,
  ).length;
  const clientCount = prospectList.filter(
    (p) => p.status === 'client' || p.status === 'converted' || p.status === 'won',
  ).length;

  const commercialDomain = {
    totalProspects: prospectList.length,
    prospectsThisWeek,
    conversions: clientCount,
    conversionRate:
      prospectList.length > 0
        ? Math.round((clientCount / prospectList.length) * 100)
        : 0,
  };

  // Visibility domain: logs from content/seo/gmaps/tiktok_comments
  const visibilityAgents = ['content', 'seo', 'gmaps', 'tiktok_comments'];
  const { count: visibilityCount } = await supabase
    .from('agent_logs')
    .select('id', { count: 'exact', head: true })
    .in('agent', visibilityAgents)
    .eq('user_id', userId);

  // Finance domain: logs from ads/comptable
  const financeAgents = ['ads', 'comptable'];
  const { count: financeCount } = await supabase
    .from('agent_logs')
    .select('id', { count: 'exact', head: true })
    .in('agent', financeAgents)
    .eq('user_id', userId);

  // Team activity feed: last 5 logs across ALL agents
  const { data: teamActivity } = await supabase
    .from('agent_logs')
    .select('id, agent, action, result, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  // Generate recommendation based on data
  let recommendation = 'Continuez sur votre lancée !';
  if (prospectList.length === 0) {
    recommendation =
      'Aucun prospect détecté. Activez vos agents Commercial et DM Instagram pour générer des leads.';
  } else if (clientCount === 0 && prospectList.length > 5) {
    recommendation =
      'Vous avez des prospects mais aucune conversion. Vérifiez vos séquences email et relancez les prospects chauds.';
  } else if ((visibilityCount ?? 0) < 5) {
    recommendation =
      'Votre visibilité est faible. Publiez plus de contenu et activez les agents SEO et TikTok.';
  }

  const globalStats = {
    commercial: commercialDomain,
    visibility: { totalActions: visibilityCount ?? 0 },
    finance: { totalActions: financeCount ?? 0 },
    teamActivity: teamActivity ?? [],
    recommendation,
  };

  return {
    totalMessages,
    logsCount: logsCount ?? 0,
    recommendations: recommendations ?? [],
    globalStats,
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

  // Recent email activities (sent, opened, replied)
  const activityQuery = supabase
    .from('crm_activities')
    .select('prospect_id, type, description, created_at, data')
    .eq('type', 'email')
    .order('created_at', { ascending: false })
    .limit(15);

  const { data: recentActivities } = await activityQuery;

  // Also fetch email_opened, email_replied, email_bounced activities
  const allEmailQuery = supabase
    .from('crm_activities')
    .select('prospect_id, type, description, created_at, data')
    .like('type', 'email%')
    .order('created_at', { ascending: false })
    .limit(30);

  if (orgId) {
    // Filter by org prospects
  }

  const { data: allEmailActivities } = await allEmailQuery;

  const recentEmails = (allEmailActivities || []).map(a => ({
    prospect_id: a.prospect_id,
    prospect: (a.data as any)?.company || (a.data as any)?.to_email || a.description?.substring(0, 60) || '?',
    email: (a.data as any)?.to_email || (a.data as any)?.from_email || '',
    type: a.type === 'email_opened' ? 'ouvert' : a.type === 'email_replied' ? 'reponse_recue' : a.type === 'email_clicked' ? 'clic' : a.type === 'email_bounced' ? 'bounce' : (a.data as any)?.auto_reply ? 'auto_reply' : (a.data as any)?.step ? `step_${(a.data as any).step}` : 'email',
    status: a.type === 'email_replied' ? 'repondu' : a.type === 'email_opened' ? 'ouvert' : a.type === 'email_clicked' ? 'clique' : a.type === 'email_bounced' ? 'bounce' : 'envoye',
    message: (a.data as any)?.reply_content || (a.data as any)?.reply_preview || (a.data as any)?.message || a.description?.substring(0, 150) || '',
    direction: a.type === 'email_replied' ? 'incoming' : 'outgoing',
    date: a.created_at,
  }));

  return {
    statusCounts,
    totalProspects: prospectList.length,
    totalOpens,
    totalClicks,
    openRate: totalWithEmail > 0 ? Math.round((totalOpens / Math.max(totalWithEmail, 1)) * 100) : 0,
    clickRate: totalWithEmail > 0 ? Math.round((totalClicks / Math.max(totalWithEmail, 1)) * 100) : 0,
    sequenceProgress,
    recentEmails,
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

async function getRhData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
) {
  const { data: rhLogs } = await supabase
    .from('agent_logs')
    .select('id, action, result, created_at')
    .eq('agent', 'rh')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  const logs = rhLogs ?? [];

  const docsGenerated = logs.filter(
    (l) =>
      typeof l.action === 'string' &&
      (l.action.includes('document') || l.action.includes('contrat')),
  ).length;

  const questionsAnswered = logs.filter(
    (l) =>
      typeof l.action === 'string' &&
      (l.action.includes('question') || l.action.includes('answer') || l.action.includes('réponse')),
  ).length;

  const activeContracts = logs.filter(
    (l) =>
      typeof l.action === 'string' &&
      l.action.includes('contrat') &&
      !l.action.includes('archiv'),
  ).length;

  return {
    rhStats: {
      docsGenerated,
      questionsAnswered,
      activeContracts,
      totalActions: logs.length,
      recentLogs: logs.slice(0, 10),
    },
  };
}

async function getOnboardingData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
) {
  // Check business dossier completeness
  const { data: dossier } = await supabase
    .from('business_dossiers')
    .select('id, completeness_score, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const completenessScore =
    dossier && typeof dossier.completeness_score === 'number'
      ? dossier.completeness_score
      : 0;

  // Check which agents the user has chatted with
  const { data: agentChats } = await supabase
    .from('client_agent_chats')
    .select('agent_id')
    .eq('user_id', userId);

  const chattedAgents = (agentChats ?? []).map(
    (c) => c.agent_id as string,
  );

  const allAgents = [
    'marketing', 'commercial', 'email', 'content', 'seo',
    'ads', 'comptable', 'rh', 'onboarding', 'dm_instagram',
    'tiktok_comments', 'gmaps', 'chatbot',
  ];

  const stepsCompleted = {
    dossierFilled: completenessScore >= 50,
    dossierComplete: completenessScore >= 100,
    firstAgentChat: chattedAgents.length > 0,
    multipleAgents: chattedAgents.length >= 3,
    allAgentsDiscovered: chattedAgents.length >= allAgents.length,
    chattedAgents,
  };

  return {
    onboardingStats: {
      completenessScore,
      hasDossier: !!dossier,
      agentsDiscovered: chattedAgents.length,
      totalAgents: allAgents.length,
      stepsCompleted,
    },
  };
}

async function getDmInstagramData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  orgId: string | null,
) {
  const { data: dmLogs } = await supabase
    .from('agent_logs')
    .select('id, action, result, created_at')
    .eq('agent', 'dm_instagram')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  const logs = dmLogs ?? [];

  const dmsSent = logs.filter(
    (l) =>
      typeof l.action === 'string' &&
      (l.action.includes('send') || l.action.includes('dm') || l.action.includes('message')),
  ).length;

  const responses = logs.filter(
    (l) =>
      typeof l.action === 'string' &&
      (l.action.includes('response') || l.action.includes('reply') || l.action.includes('réponse')),
  ).length;

  const rdvGenerated = logs.filter(
    (l) =>
      typeof l.action === 'string' &&
      (l.action.includes('rdv') || l.action.includes('rendez-vous') || l.action.includes('appointment')),
  ).length;

  // CRM prospects sourced from DM Instagram
  const prospectQuery = supabase
    .from('crm_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'dm_instagram');
  if (orgId) {
    prospectQuery.eq('org_id', orgId);
  } else {
    prospectQuery.eq('user_id', userId);
  }
  const { count: dmProspects } = await prospectQuery;

  // Build recent DMs with target/status for the activity feed
  const recentDms = logs.slice(0, 15).map(l => {
    const result = l.result as Record<string, any> | null;
    return {
      target: result?.target || result?.username || result?.prospect || l.action?.replace('dm_', '') || '?',
      status: l.action?.includes('reply') || l.action?.includes('response') ? 'repondu'
        : l.action?.includes('rdv') ? 'rdv'
        : l.action?.includes('send') || l.action?.includes('dm') ? 'envoye'
        : 'en_cours',
      message: result?.message?.substring?.(0, 100) || result?.preview?.substring?.(0, 100) || '',
      date: l.created_at,
    };
  });

  return {
    dmStats: {
      dmsSent,
      responses,
      rdvGenerated,
      responseRate: dmsSent > 0 ? Math.round((responses / dmsSent) * 100) : 0,
      prospectsGenerated: dmProspects ?? 0,
      totalActions: logs.length,
      recentDms,
      recentLogs: logs.slice(0, 10),
    },
  };
}

async function getTiktokCommentsData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
) {
  const { data: tiktokLogs } = await supabase
    .from('agent_logs')
    .select('id, action, result, created_at')
    .eq('agent', 'tiktok_comments')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  const logs = tiktokLogs ?? [];

  const commentsPosted = logs.filter(
    (l) =>
      typeof l.action === 'string' &&
      (l.action.includes('comment') || l.action.includes('post') || l.action.includes('reply')),
  ).length;

  // Extract engagement metrics from results
  let totalLikes = 0;
  let totalReplies = 0;
  for (const log of logs) {
    if (log.result && typeof log.result === 'object') {
      const r = log.result as Record<string, unknown>;
      if (typeof r.likes === 'number') totalLikes += r.likes;
      if (typeof r.replies === 'number') totalReplies += r.replies;
    }
  }

  return {
    tiktokStats: {
      commentsPosted,
      totalLikes,
      totalReplies,
      totalActions: logs.length,
      recentLogs: logs.slice(0, 10),
    },
  };
}

async function getGmapsData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
) {
  const { data: gmapsLogs } = await supabase
    .from('agent_logs')
    .select('id, action, result, created_at')
    .eq('agent', 'gmaps')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  const logs = gmapsLogs ?? [];

  const reviewsAnswered = logs.filter(
    (l) =>
      typeof l.action === 'string' &&
      (l.action.includes('review') || l.action.includes('avis') || l.action.includes('reply')),
  ).length;

  // Extract rating data from results
  let latestRating: number | null = null;
  let totalReviews: number | null = null;
  for (const log of logs) {
    if (log.result && typeof log.result === 'object') {
      const r = log.result as Record<string, unknown>;
      if (typeof r.rating === 'number' && latestRating === null) {
        latestRating = r.rating;
      }
      if (typeof r.total_reviews === 'number' && totalReviews === null) {
        totalReviews = r.total_reviews;
      }
    }
  }

  return {
    gmapsStats: {
      reviewsAnswered,
      googleRating: latestRating,
      totalGoogleReviews: totalReviews,
      totalActions: logs.length,
      recentLogs: logs.slice(0, 10),
    },
  };
}

async function getChatbotData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  orgId: string | null,
) {
  // Query chatbot_sessions
  const sessionQuery = supabase
    .from('chatbot_sessions')
    .select('id, visitor_email, created_at, updated_at');
  if (orgId) {
    sessionQuery.eq('org_id', orgId);
  } else {
    sessionQuery.eq('user_id', userId);
  }

  const { data: sessions } = await sessionQuery;
  const sessionList = sessions ?? [];

  const totalVisitors = sessionList.length;
  const leadsWithEmail = sessionList.filter(
    (s) => typeof s.visitor_email === 'string' && s.visitor_email.length > 0,
  ).length;
  const conversionRate =
    totalVisitors > 0 ? Math.round((leadsWithEmail / totalVisitors) * 100) : 0;

  // Recent sessions
  const recentSessions = sessionList
    .sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    })
    .slice(0, 10)
    .map((s) => ({
      id: s.id,
      hasEmail: !!(s.visitor_email && s.visitor_email.length > 0),
      created_at: s.created_at,
    }));

  return {
    chatbotStats: {
      totalVisitors,
      leadsWithEmail,
      conversionRate,
      recentSessions,
    },
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
  'rh',
  'onboarding',
  'dm_instagram',
  'tiktok_comments',
  'gmaps',
  'chatbot',
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
        agentData = await getMarketingData(supabase, user.id, orgId);
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
      case 'rh':
        agentData = await getRhData(supabase, user.id);
        break;
      case 'onboarding':
        agentData = await getOnboardingData(supabase, user.id);
        break;
      case 'dm_instagram':
        agentData = await getDmInstagramData(supabase, user.id, orgId);
        break;
      case 'tiktok_comments':
        agentData = await getTiktokCommentsData(supabase, user.id);
        break;
      case 'gmaps':
        agentData = await getGmapsData(supabase, user.id);
        break;
      case 'chatbot':
        agentData = await getChatbotData(supabase, user.id, orgId);
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
