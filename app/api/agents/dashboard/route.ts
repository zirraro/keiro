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
    .select('id, status, temperature, created_at, email');
  if (orgId) {
    prospectQuery.eq('org_id', orgId);
  } else {
    prospectQuery.or(`user_id.eq.${userId},created_by.eq.${userId}`);
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

  // Instagram stats — load from real IG API
  let igStats = { postsCount: 0, followersCount: 0, reach: 0, likes: 0, engagement: 0 };
  try {
    const { data: igProfile } = await supabase.from('profiles').select('instagram_access_token, instagram_business_account_id').eq('id', userId).single();
    const igToken = igProfile?.instagram_access_token;
    if (igToken) {
      // Profile stats
      const profileRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=followers_count,media_count&access_token=${igToken}`, { signal: AbortSignal.timeout(5000) });
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        igStats.postsCount = profileData.media_count || 0;
        igStats.followersCount = profileData.followers_count || 0;
      }
      // Insights
      const insightsRes = await fetch(`https://graph.instagram.com/v21.0/me/insights?metric=reach&metric_type=total_value&period=day&access_token=${igToken}`, { signal: AbortSignal.timeout(5000) });
      if (insightsRes.ok) {
        const insightsData = await insightsRes.json();
        igStats.reach = insightsData.data?.[0]?.total_value?.value || 0;
      }
      // Recent media likes
      const mediaRes = await fetch(`https://graph.instagram.com/v21.0/me/media?fields=like_count&limit=20&access_token=${igToken}`, { signal: AbortSignal.timeout(5000) });
      if (mediaRes.ok) {
        const mediaData = await mediaRes.json();
        igStats.likes = (mediaData.data || []).reduce((sum: number, m: any) => sum + (m.like_count || 0), 0);
        igStats.engagement = igStats.followersCount > 0 ? Math.round((igStats.likes / Math.max(igStats.postsCount, 1) / igStats.followersCount) * 10000) / 100 : 0;
      }
    }
  } catch {}

  const globalStats = {
    commercial: commercialDomain,
    visibility: { totalActions: visibilityCount ?? 0, traffic: igStats.followersCount },
    instagram: igStats,
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
  let allEmailQuery = supabase
    .from('crm_activities')
    .select('prospect_id, type, description, created_at, data')
    .like('type', 'email%')
    .order('created_at', { ascending: false })
    .limit(50);

  // Filter by user's prospects
  if (!orgId && userId) {
    const { data: userProspectIds } = await supabase
      .from('crm_prospects')
      .select('id')
      .or(`user_id.eq.${userId},created_by.eq.${userId}`)
      .limit(500);
    if (userProspectIds && userProspectIds.length > 0) {
      allEmailQuery = allEmailQuery.in('prospect_id', userProspectIds.map((p: any) => p.id));
    }
  }

  const { data: allEmailActivities } = await allEmailQuery;

  const recentEmails = (allEmailActivities || []).map(a => {
    const d = a.data as any;
    return {
      prospect_id: a.prospect_id,
      prospect: d?.company || d?.to_email || a.description?.substring(0, 60) || '?',
      email: d?.to_email || d?.from_email || '',
      type: a.type === 'email_opened' ? 'ouvert' : a.type === 'email_replied' ? 'reponse_recue' : a.type === 'email_clicked' ? 'clic' : a.type === 'email_bounced' ? 'bounce' : d?.auto_reply ? 'auto_reply' : d?.step ? `step_${d.step}` : 'email',
      status: a.type === 'email_replied' ? 'repondu' : a.type === 'email_opened' ? 'ouvert' : a.type === 'email_clicked' ? 'clique' : a.type === 'email_bounced' ? 'bounce' : 'envoye',
      subject: d?.subject || null,
      message: d?.reply_content || d?.reply_preview || d?.body?.substring(0, 300) || d?.message || a.description?.substring(0, 150) || '',
      provider: d?.provider || null,
      direction: a.type === 'email_replied' ? 'incoming' : 'outgoing',
      date: a.created_at,
    };
  });

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
  // Get REAL posts from content_calendar (not just logs)
  const { data: posts } = await supabase
    .from('content_calendar')
    .select('id, platform, format, status, hook, caption, visual_url, scheduled_date, published_at, instagram_permalink, engagement_data, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  const allPosts = posts || [];
  const published = allPosts.filter(p => p.status === 'published');
  const scheduled = allPosts.filter(p => p.status === 'approved');
  const drafts = allPosts.filter(p => p.status === 'draft');

  // Calculate real engagement stats from posts
  let totalLikes = 0;
  let totalComments = 0;
  let totalViews = 0;
  for (const p of published) {
    const eng = p.engagement_data as any;
    if (eng) {
      totalLikes += eng.likes || 0;
      totalComments += eng.comments || 0;
      totalViews += eng.views || eng.impressions || 0;
    }
  }

  // Also load IG insights if available
  let igInsights: any = null;
  try {
    const { data: profile } = await supabase.from('profiles').select('instagram_access_token').eq('id', userId).single();
    if (profile?.instagram_access_token) {
      const insightsRes = await fetch(`https://graph.instagram.com/v21.0/me/insights?metric=reach,accounts_engaged&metric_type=total_value&period=day&access_token=${profile.instagram_access_token}`, { signal: AbortSignal.timeout(5000) });
      if (insightsRes.ok) {
        const insightsData = await insightsRes.json();
        igInsights = {};
        for (const d of (insightsData.data || [])) {
          igInsights[d.name] = d.total_value?.value || 0;
        }
      }
    }
  } catch {}

  return {
    contentStats: {
      postsGenerated: allPosts.length,
      scheduledPosts: scheduled.length,
      publishedPosts: published.length,
      draftPosts: drafts.length,
      totalLikes,
      totalComments,
      totalViews,
      reach: igInsights?.reach || 0,
      accountsEngaged: igInsights?.accounts_engaged || 0,
      recentContent: allPosts.slice(0, 30),
    },
    recentLogs: allPosts.slice(0, 10).map(p => ({
      id: p.id,
      action: p.status === 'published' ? 'execute_publication' : 'daily_post_generated',
      data: { platform: p.platform, format: p.format, hook: p.hook, permalink: p.instagram_permalink },
      status: p.status === 'published' ? 'success' : 'pending',
      created_at: p.published_at || p.created_at,
    })),
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

  // Count actual DM auto-replies and received messages
  const dmsSent = logs.filter(l => l.action === 'dm_auto_reply' || l.action === 'daily_preparation').length;
  const dmReceived = logs.filter(l => l.action === 'webhook_dm_received').length;
  const responses = dmReceived; // Each received message that got a reply
  const handovers = logs.filter(l => l.action === 'handover_notification').length;

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
      dmReceived,
      responses,
      rdvGenerated,
      handovers,
      responseRate: dmReceived > 0 ? Math.round((dmsSent / dmReceived) * 100) : 0,
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

    // Handle type=logs — return agent activity history for the client
    const queryType = request.nextUrl.searchParams.get('type');
    if (queryType === 'logs') {
      const supabase = getSupabaseAdmin();
      const { data: logs } = await supabase
        .from('agent_logs')
        .select('id, agent, action, status, data, created_at')
        .eq('agent', agentId)
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .not('action', 'like', '%report_to_ceo%')
        .order('created_at', { ascending: false })
        .limit(30);

      // Human-readable action labels
      const ACTION_LABELS: Record<string, string> = {
        email_sent: 'Email envoye',
        daily_cold: 'Campagne email lancee',
        warm_send: 'Relance envoyee',
        daily_post_generated: 'Post cree',
        execute_publication: 'Publication executee',
        generate_week: 'Semaine de contenu generee',
        prospect_scraped: 'Prospect identifie',
        gmaps_scrape: 'Recherche Google Maps',
        dm_sent: 'DM envoye',
        dm_reply: 'Reponse DM',
        comment_posted: 'Commentaire publie',
        blog_generated: 'Article SEO redige',
        seo_audit: 'Audit SEO',
      };

      const formattedLogs = (logs || []).map((l: any) => {
        const d = l.data as any;
        const actionLabel = ACTION_LABELS[l.action] || l.action?.replace(/_/g, ' ') || 'Action';
        // Build rich description from data
        let description = d?.message || d?.hook || actionLabel;
        if (l.action === 'email_sent' && d?.subject) {
          description = `Email envoye: "${d.subject}" a ${d.company || d.prospect_email || ''}`;
        } else if (l.action === 'daily_post_generated' && d?.caption) {
          description = `Post cree: ${(d.caption || '').substring(0, 80)}...`;
        } else if (l.action === 'execute_publication' && d?.platform) {
          description = `Publie sur ${d.platform}${d.permalink ? '' : ' (en attente)'}`;
        } else if (l.action === 'prospect_scraped' || l.action === 'gmaps_scrape') {
          description = `${d?.count || ''} prospects identifies${d?.query ? ` (${d.query})` : ''}`;
        }

        return {
          id: l.id,
          type: l.action,
          description,
          result: d?.publication_error || d?.error || d?.campaign_result || (d?.provider ? `via ${d.provider}` : null),
          status: l.status === 'ok' || l.status === 'success' ? 'success' : l.status === 'error' ? 'error' : 'pending',
          created_at: l.created_at,
        };
      });

      return NextResponse.json({ ok: true, logs: formattedLogs });
    }

    // Handle type=timeline — return agent's operational items (posts, emails, prospects)
    if (queryType === 'timeline') {
      const supabase = getSupabaseAdmin();
      const orgId = await resolveOrgId(supabase, user.id);
      const items: any[] = [];

      if (agentId === 'content') {
        // Posts: past published + future scheduled
        let query = supabase
          .from('content_calendar')
          .select('id, platform, format, status, hook, caption, visual_url, scheduled_date, scheduled_time, published_at, instagram_permalink, created_at')
          .order('scheduled_date', { ascending: false })
          .limit(50);
        if (orgId) query = query.eq('org_id', orgId);
        else query = query.eq('user_id', user.id);
        const { data: posts } = await query;
        for (const p of (posts || [])) {
          const isPast = p.status === 'published';
          const isFailed = p.status === 'publish_failed';
          items.push({
            id: p.id,
            type: isPast ? 'completed' : isFailed ? 'failed' : p.status === 'approved' ? 'scheduled' : 'draft',
            title: p.hook || (p.caption || '').substring(0, 60) || 'Post sans titre',
            subtitle: `${p.platform || 'instagram'} • ${p.format || 'post'}`,
            date: p.published_at || p.scheduled_date || p.created_at,
            time: p.scheduled_time || null,
            image: p.visual_url || null,
            link: p.instagram_permalink || null,
            status: p.status,
          });
        }
      } else if (agentId === 'email') {
        // Emails sent + prospects in sequence
        let query = supabase
          .from('crm_activities')
          .select('id, prospect_id, type, description, data, created_at')
          .ilike('type', 'email%')
          .order('created_at', { ascending: false })
          .limit(50);
        const { data: activities } = await query;
        for (const a of (activities || [])) {
          const d = a.data as any;
          items.push({
            id: a.id,
            type: a.type === 'email_replied' ? 'reply' : 'completed',
            title: d?.subject || `Email etape ${d?.step || '?'}`,
            subtitle: `${d?.company || d?.to_email || 'Prospect'} • via ${d?.provider || '?'}`,
            date: a.created_at,
            status: a.type === 'email_replied' ? 'repondu' : 'envoye',
          });
        }
      } else if (agentId === 'commercial' || agentId === 'gmaps') {
        // Recent prospects imported
        let query = supabase
          .from('crm_prospects')
          .select('id, company, type, quartier, status, temperature, source, score, created_at')
          .order('created_at', { ascending: false })
          .limit(50);
        if (orgId) query = query.eq('org_id', orgId);
        else query = query.or(`user_id.eq.${user.id},created_by.eq.${user.id}`);
        const { data: prospects } = await query;
        for (const p of (prospects || [])) {
          items.push({
            id: p.id,
            type: p.status === 'client' ? 'completed' : p.temperature === 'hot' ? 'hot' : 'scheduled',
            title: p.company || 'Sans nom',
            subtitle: `${p.type || '?'} • ${p.quartier || '?'} • score ${p.score || 0}`,
            date: p.created_at,
            status: p.status,
            temperature: p.temperature,
          });
        }
      } else if (agentId === 'dm_instagram') {
        // DM conversations
        const { data: logs } = await supabase
          .from('agent_logs')
          .select('id, action, data, status, created_at')
          .eq('agent', 'dm_instagram')
          .or(`user_id.eq.${user.id},user_id.is.null`)
          .order('created_at', { ascending: false })
          .limit(30);
        for (const l of (logs || [])) {
          const d = l.data as any;
          items.push({
            id: l.id,
            type: l.status === 'success' ? 'completed' : 'failed',
            title: d?.message || l.action?.replace(/_/g, ' ') || 'DM',
            subtitle: d?.platform || 'Instagram',
            date: l.created_at,
            status: l.status,
          });
        }
      }

      return NextResponse.json({ ok: true, items });
    }

    if (!AGENTS_WITH_DASHBOARDS.has(agentId)) {
      return NextResponse.json({ ok: true, hasDashboard: false });
    }

    const supabase = getSupabaseAdmin();
    const orgId = await resolveOrgId(supabase, user.id);

    // Check if admin + connection status
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('is_admin, instagram_business_account_id, instagram_access_token, facebook_page_id, google_business_location_id, subscription_plan, linkedin_access_token, tiktok_access_token, gmail_email, gmail_refresh_token')
      .eq('id', user.id)
      .single();
    const isAdmin = !!userProfile?.is_admin;

    // Connection status — passed to frontend so panels know what's connected
    const connections = {
      instagram: !!(userProfile?.instagram_business_account_id && (userProfile?.instagram_access_token || userProfile?.facebook_page_id)),
      google: !!userProfile?.google_business_location_id,
      linkedin: !!userProfile?.linkedin_access_token,
      tiktok: !!userProfile?.tiktok_access_token,
      gmail: !!userProfile?.gmail_refresh_token,
      gmail_email: userProfile?.gmail_email || null,
      subscription_plan: userProfile?.subscription_plan || 'free',
    };

    // For admin: pass null userId to get ALL clients data (supervision)
    // For client: pass their own userId to get their data only
    const dashboardUserId = isAdmin ? null : user.id;
    const dashboardOrgId = isAdmin ? null : orgId;

    // Fetch recent chats in parallel with agent-specific data
    const recentChatsPromise = getRecentChats(supabase, user.id, agentId);

    let agentData: Record<string, unknown> = {};

    // Admin supervision: add cross-client stats
    if (isAdmin) {
      // Get per-client breakdown for this agent
      const { data: clientLogs } = await supabase
        .from('agent_logs')
        .select('user_id, status, created_at')
        .eq('agent', agentId)
        .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(200);

      const clientBreakdown: Record<string, { actions: number; errors: number }> = {};
      for (const log of (clientLogs || [])) {
        const uid = log.user_id || 'unknown';
        if (!clientBreakdown[uid]) clientBreakdown[uid] = { actions: 0, errors: 0 };
        clientBreakdown[uid].actions++;
        if (log.status === 'error') clientBreakdown[uid].errors++;
      }

      // Get client names
      const clientIds = Object.keys(clientBreakdown).filter(id => id !== 'unknown');
      const { data: clientProfiles } = clientIds.length > 0
        ? await supabase.from('profiles').select('id, email, first_name, company_name').in('id', clientIds)
        : { data: [] };

      const profileMap = new Map((clientProfiles || []).map((p: any) => [p.id, p]));

      (agentData as any).supervision = {
        isAdmin: true,
        totalActions24h: (clientLogs || []).length,
        totalErrors24h: (clientLogs || []).filter((l: any) => l.status === 'error').length,
        clients: Object.entries(clientBreakdown).map(([uid, stats]) => ({
          user_id: uid,
          name: profileMap.get(uid)?.company_name || profileMap.get(uid)?.first_name || profileMap.get(uid)?.email || uid.substring(0, 8),
          ...stats,
        })),
      };
    }

    switch (agentId) {
      case 'marketing':
        agentData = { ...agentData, ...(await getMarketingData(supabase, dashboardUserId || user.id, dashboardOrgId)) };
        break;
      case 'commercial':
        agentData = { ...agentData, ...(await getCommercialData(supabase, dashboardUserId || user.id, dashboardOrgId)) };
        break;
      case 'email':
        agentData = { ...agentData, ...(await getEmailData(supabase, dashboardUserId || user.id, dashboardOrgId)) };
        break;
      case 'content':
        agentData = { ...agentData, ...(await getContentData(supabase, dashboardUserId || user.id)) };
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
      connections,
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
