import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { resolveOrgId } from '@/lib/tenant';
import { loadInstagramInsights } from '@/lib/meta/insights-shared';

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

  // Instagram stats — pulled from the shared `loadInstagramInsights` helper
  // so AMI (here) and Léna (getContentData) always show identical numbers
  // for the same connected account. Same window (50 posts), same metrics
  // (likes + comments), no arbitrary gate on "must have published via KeiroAI".
  const igLoaded = await loadInstagramInsights(supabase, userId);
  const igStats = {
    connected: igLoaded.connected,
    hasActivity: igLoaded.hasActivity,
    postsCount: igLoaded.postsCount,
    followersCount: igLoaded.followersCount,
    reach: igLoaded.reach,
    likes: igLoaded.likes,
    comments: igLoaded.comments,
    engagement: igLoaded.engagement,
  };

  // TikTok stats — live from /v2/user/info when connected. Same approach
  // as IG: only meaningful when KeiroAI has published at least one TT post.
  let tiktokStats: any = {
    connected: false,
    hasActivity: false,
    postsCount: 0,
    followersCount: 0,
    likes: 0,
    avgViews: 0,
    engagement: 0,
  };
  try {
    const { data: tkProfile } = await supabase
      .from('profiles')
      .select('tiktok_username, tiktok_access_token')
      .eq('id', userId)
      .single();
    tiktokStats.connected = !!(tkProfile?.tiktok_access_token);
    if (tiktokStats.connected) {
      const { count: tkPublished } = await supabase
        .from('content_calendar')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('platform', 'tiktok')
        .eq('status', 'published');
      tiktokStats.hasActivity = (tkPublished || 0) > 0;
      const tkToken = (tkProfile as any)?.tiktok_access_token;
      // Hit /v2/user/info as soon as the token exists — even without
      // KeiroAI-published activity. The founder wants to see real
      // followers/posts immediately after connection, not "0 until you
      // publish via Lena".
      if (tkToken) {
        const r = await fetch(
          'https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count,video_count',
          { headers: { Authorization: `Bearer ${tkToken}` }, signal: AbortSignal.timeout(5000) }
        );
        if (r.ok) {
          const data = await r.json();
          const u = data?.data?.user;
          if (u) {
            tiktokStats.postsCount = u.video_count || 0;
            tiktokStats.followersCount = u.follower_count || 0;
            tiktokStats.likes = u.likes_count || 0;
            tiktokStats.engagement = tiktokStats.followersCount > 0 && tiktokStats.postsCount > 0
              ? Math.round((tiktokStats.likes / tiktokStats.postsCount / tiktokStats.followersCount) * 10000) / 100
              : 0;
          }
        }
        try {
          const vl = await fetch(
            'https://open.tiktokapis.com/v2/video/list/?fields=view_count',
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${tkToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ max_count: 20 }),
              signal: AbortSignal.timeout(6000),
            },
          );
          if (vl.ok) {
            const vd = await vl.json();
            const vids: any[] = vd?.data?.videos || [];
            if (vids.length > 0) {
              tiktokStats.avgViews = Math.round(vids.reduce((s, v) => s + (v.view_count || 0), 0) / vids.length);
            }
          }
        } catch {}
      }
    }
  } catch {}

  // LinkedIn stats — only KeiroAI-published count for now (the r_member_social
  // scope needed for connection count isn't requested yet).
  let linkedinStats: any = {
    connected: false,
    hasActivity: false,
    postsCount: 0,
    followersCount: 0, // labelled "Connexions" in UI
    likes: 0,          // labelled "Réactions"
    engagement: 0,
  };
  try {
    const { data: liProfile } = await supabase
      .from('profiles')
      .select('linkedin_access_token, linkedin_username')
      .eq('id', userId)
      .single();
    linkedinStats.connected = !!(liProfile?.linkedin_access_token);
    if (linkedinStats.connected) {
      const { count: liPublished } = await supabase
        .from('content_calendar')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('platform', 'linkedin')
        .eq('status', 'published');
      linkedinStats.hasActivity = (liPublished || 0) > 0;
      linkedinStats.postsCount = liPublished || 0;
    }
  } catch {}

  // Jade summary — DMs sent, comments replied, follows queued, follows
  // confirmed. Pulled from the SAME tables Jade's own panel reads
  // (dm_queue + agent_logs + crm_prospects) so Ami and Jade always
  // agree on numbers. Founder ask 2026-05-24: "Ami data doit être
  // coherente avec celles de Lena et Jade".
  const last7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const jadeStats = await (async () => {
    try {
      const [{ count: dmsSent7d }, { count: commentsReplied7d }, { count: followsQueued }, { count: followsConfirmed }, { count: followBackDms }] = await Promise.all([
        supabase.from('dm_queue').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('created_at', last7d),
        supabase.from('agent_logs').select('id', { count: 'exact', head: true }).eq('agent', 'instagram_comments').eq('action', 'reply_sent').eq('user_id', userId).gte('created_at', last7d),
        supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('dm_status', 'queued_for_manual_follow'),
        supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('user_id', userId).not('dm_followed_at', 'is', null),
        supabase.from('crm_activities').select('id', { count: 'exact', head: true }).eq('type', 'dm_after_follow_queued').gte('created_at', last7d),
      ]);
      return {
        dms_sent_7d: dmsSent7d || 0,
        comments_replied_7d: commentsReplied7d || 0,
        follows_pending: followsQueued || 0,
        follows_confirmed: followsConfirmed || 0,
        after_follow_dms_7d: followBackDms || 0,
      };
    } catch {
      return { dms_sent_7d: 0, comments_replied_7d: 0, follows_pending: 0, follows_confirmed: 0, after_follow_dms_7d: 0 };
    }
  })();

  const globalStats = {
    commercial: commercialDomain,
    visibility: { totalActions: visibilityCount ?? 0, traffic: igStats.followersCount },
    instagram: igStats,
    tiktok: tiktokStats,
    linkedin: linkedinStats,
    jade: jadeStats,
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
  // Scope expression reused across the count queries below.
  const scope = (q: any) => orgId
    ? q.eq('org_id', orgId)
    : q.or(`user_id.eq.${userId},created_by.eq.${userId}`);

  // Row-level fetch — paged at 2000 for in-process pipeline/temperature
  // breakdowns. The TOTAL count below is exact (not capped) so a CRM
  // with 5000+ prospects shows the real number on the dashboard.
  const prospectQuery = scope(
    supabase
      .from('crm_prospects')
      .select('id, company, type, status, temperature, score, email, instagram, tiktok_handle, linkedin_url, dm_status, email_sequence_status, created_at')
      .order('created_at', { ascending: false })
      .limit(2000),
  );
  const { data: prospects } = await prospectQuery;
  const prospectList: Array<Record<string, any>> = prospects ?? [];

  // Exact total — uses head:true so we never load 5000 rows just to
  // count them. Founder spotted 2026-05-17 that the dashboard total
  // was capped at the limit() value, hiding real CRM growth past 2000.
  const { count: exactTotal } = await scope(
    supabase.from('crm_prospects').select('id', { count: 'exact', head: true }),
  );

  // Activities for those prospects
  const prospectIds = prospectList.map((p: any) => p.id);
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

  // Pipeline: count per status (within the loaded 2000 rows). For
  // CRMs larger than that, the proportions are still representative.
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

  const total = exactTotal || prospectList.length;
  const converted = prospectList.filter(
    (p: any) => p.status === 'converted' || p.status === 'won' || p.status === 'client',
  ).length;
  // Conversion rate uses the sampled denominator (prospectList.length)
  // when CRM > 2000 so we don't divide a sample-numerator by a
  // full-population denominator and report 0% on a healthy pipeline.
  const denom = Math.min(total, prospectList.length || 1);
  const conversionRate = denom > 0 ? Math.round((converted / denom) * 100) : 0;

  // Channel readiness stats — how many prospects are ready for each agent
  const withEmail = prospectList.filter((p: any) => p.email && !['bounced', 'email_invalid', 'stopped'].includes(p.email_sequence_status || '')).length;
  const withInstagram = prospectList.filter((p: any) => p.instagram && p.instagram !== 'A_VERIFIER').length;
  const withTiktok = prospectList.filter((p: any) => p.tiktok_handle).length;
  const withLinkedin = prospectList.filter((p: any) => p.linkedin_url).length;
  const emailNotStarted = prospectList.filter((p: any) => p.email && (!p.email_sequence_status || p.email_sequence_status === 'not_started')).length;
  const dmNotStarted = prospectList.filter((p: any) => p.instagram && (!p.dm_status || p.dm_status === 'none')).length;

  // Today's additions
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const todayCount = prospectList.filter((p: any) => new Date(p.created_at).getTime() > now - oneDay).length;

  return {
    prospects: prospectList.slice(0, 200), // Limit for frontend perf
    activities,
    pipeline,
    stats: {
      total,
      sampled: prospectList.length,
      hot: scoreDistribution.hot,
      warm: scoreDistribution.warm,
      cold: scoreDistribution.cold,
      conversionRate,
      todayCount,
      withEmail,
      withInstagram,
      withTiktok,
      withLinkedin,
      emailNotStarted,
      dmNotStarted,
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
    .select('email_sequence_status, email_sequence_step, email_open_count, email_click_count, last_email_sent_at');

  if (orgId) {
    query.eq('org_id', orgId);
  } else {
    query.eq('user_id', userId);
  }

  const { data: prospects } = await query;
  const prospectList = prospects ?? [];

  // Founder ask 2026-06-02: split the email-sent metric into:
  //   - First-sends  (prospects whose first email landed in the window)
  //   - Follow-ups   (prospects whose later step landed in the window)
  //   - Hugo replies (auto-reply count from agent_logs)
  //   - Inbound replies (prospects who replied; unreplied flag set if Hugo couldn't respond)
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  let firstSends24h = 0;
  let followUps24h = 0;
  let firstSends7d = 0;
  let followUps7d = 0;
  for (const p of prospectList) {
    const ts = (p as any).last_email_sent_at;
    if (!ts) continue;
    const step = ((p as any).email_sequence_step as number) || 0;
    const inWindow24h = ts >= since24h;
    const inWindow7d = ts >= since7d;
    if (inWindow24h) {
      if (step <= 1) firstSends24h++; else followUps24h++;
    }
    if (inWindow7d) {
      if (step <= 1) firstSends7d++; else followUps7d++;
    }
  }

  // Hugo's reply pipeline — read from agent_logs
  const [hugoRepliesRes, inboundsRes] = await Promise.all([
    supabase
      .from('agent_logs')
      .select('id, data', { count: 'exact' })
      .eq('agent', 'email')
      .eq('action', 'inbound_processed')
      .eq('status', 'ok')
      .eq('user_id', userId)
      .gte('created_at', since24h),
    supabase
      .from('agent_logs')
      .select('id, data, created_at', { count: 'exact' })
      .eq('agent', 'email')
      .eq('action', 'inbound_processed')
      .eq('user_id', userId)
      .gte('created_at', since24h)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const hugoAutoReplied24h = (hugoRepliesRes.data || []).filter((l: any) => l.data?.decision === 'auto_replied').length;
  const hugoBlacklisted24h = (hugoRepliesRes.data || []).filter((l: any) => l.data?.decision === 'blacklisted' || l.data?.decision === 'stopped').length;
  const inboundsTotal24h = inboundsRes.count || 0;
  const unrepliedInbounds = (inboundsRes.data || [])
    .filter((l: any) => {
      const decision = l.data?.decision;
      return decision !== 'auto_replied' && decision !== 'blacklisted' && decision !== 'stopped' && decision !== 'ignore';
    })
    .map((l: any) => ({
      from: l.data?.from || 'unknown',
      classification: l.data?.classification || 'unknown',
      decision: l.data?.decision || 'unknown',
      received_at: l.created_at,
    }));

  const replyRate24h = inboundsTotal24h > 0
    ? Math.round((hugoAutoReplied24h / Math.max(1, inboundsTotal24h - hugoBlacklisted24h)) * 100)
    : 100; // 100% if nothing to reply to

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

  // Recent email activities (sent, opened, replied) — strict per-account
  // isolation. crm_activities carries user_id + org_id; older rows may have
  // user_id NULL (back-filled before the column existed) so we additionally
  // scope through the user's own prospect IDs as a second guard.
  const activityQuery = supabase
    .from('crm_activities')
    .select('prospect_id, type, description, created_at, data')
    .eq('type', 'email')
    .order('created_at', { ascending: false })
    .limit(15);
  if (orgId) {
    activityQuery.eq('org_id', orgId);
  } else {
    activityQuery.eq('user_id', userId);
  }

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
    // 2026-06-02: split metrics for the panel funnel
    splitMetrics: {
      firstSends24h,
      followUps24h,
      totalSends24h: firstSends24h + followUps24h,
      firstSends7d,
      followUps7d,
      hugoAutoReplied24h,
      hugoBlacklisted24h,
      inboundsTotal24h,
      replyRate24h, // % of inbound prospect replies that Hugo answered (excludes blacklist/ignore)
      unrepliedInbounds, // list (max 50) with reason — for the panel debug section
    },
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

  // Load REAL engagement stats from Instagram API (not from DB which is empty).
  // We only fetch live IG metrics when there is at least one post the user
  // actually published THROUGH KeiroAI — otherwise showing follower counts /
  // reach figures pulled from the user's organic Instagram presence creates
  // the impression that KeiroAI invented those numbers, which is exactly the
  // confusion that came up in user feedback. If nothing has been published
  // via KeiroAI yet, we return all zeros and let the UI render an empty state.
  let totalLikes = 0;
  let totalComments = 0;
  let totalViews = 0;
  let igInsights: any = null;
  let followersCount = 0;
  let igConnected = false;

  // Detect connection independently of activity so the UI can distinguish
  // "no Instagram connected" vs "connected but nothing published yet".
  let tiktokConnected = false;
  let linkedinConnected = false;
  let igMediaCount = 0; // real Instagram media_count (not KeiroAI-published)
  let igSampledMediaCount = 0; // number of media actually fetched for the likes/comments aggregation
  // TikTok live stats (filled from /v2/user/info when connected)
  let ttFollowers = 0, ttVideoCount = 0, ttLikes = 0, ttAvgViews = 0;
  // LinkedIn cached stats (no live network-size fetch yet — needs r_member_social scope)
  let liConnections = 0, liPostCount = 0;
  // Pull IG insights through the shared helper (same source as AMI /
  // getMarketingData) — guarantees both panels show identical numbers.
  const igLoaded = await loadInstagramInsights(supabase, userId);
  igConnected = igLoaded.connected;
  igMediaCount = igLoaded.postsCount;
  followersCount = igLoaded.followersCount;
  totalLikes = igLoaded.likes;
  totalComments = igLoaded.comments;
  igSampledMediaCount = igLoaded.sampledMediaCount;
  igInsights = { reach: igLoaded.reach };

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('tiktok_username, tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry, linkedin_username, linkedin_access_token')
      .eq('id', userId)
      .single();
    tiktokConnected = !!(profile as any)?.tiktok_username && !!(profile as any)?.tiktok_access_token;
    linkedinConnected = !!(profile as any)?.linkedin_username && !!(profile as any)?.linkedin_access_token;

    // ── TikTok live stats ──
    // /v2/user/info/ returns follower_count, video_count, likes_count
    // when requested as extra fields. We don't currently cache these
    // anywhere so the dashboard fetches them live — fast (single
    // request, < 1 sec) and always fresh.
    if (tiktokConnected) {
      try {
        const ttToken = (profile as any).tiktok_access_token;
        const ttRes = await fetch(
          'https://open.tiktokapis.com/v2/user/info/?fields=open_id,follower_count,following_count,likes_count,video_count',
          {
            headers: { 'Authorization': `Bearer ${ttToken}` },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (ttRes.ok) {
          const ttData = await ttRes.json();
          const u = ttData?.data?.user;
          if (u) {
            ttFollowers = u.follower_count ?? 0;
            ttVideoCount = u.video_count ?? 0;
            ttLikes = u.likes_count ?? 0;
            // TikTok doesn't expose per-video views via /v2/user/info —
            // and /v2/video/query/ requires a Research API approval we
            // don't have. Synthesizing "avg views" from likes was
            // misleading the founder ("data tiktok pas bonnes"). We now
            // pull real per-video view_count via /v2/video/list/ (granted
            // when video.list scope is OK), and only otherwise leave the
            // field at 0 so the UI can hide it rather than show fake data.
            try {
              const vlRes = await fetch(
                'https://open.tiktokapis.com/v2/video/list/?fields=view_count,like_count,comment_count,share_count',
                {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${ttToken}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ max_count: 20 }),
                  signal: AbortSignal.timeout(6000),
                },
              );
              if (vlRes.ok) {
                const vlData = await vlRes.json();
                const videos: any[] = vlData?.data?.videos || [];
                if (videos.length > 0) {
                  const totalViews = videos.reduce((s, v) => s + (v.view_count || 0), 0);
                  ttAvgViews = Math.round(totalViews / videos.length);
                }
              }
            } catch { /* fall back to 0 — better than a fake estimate */ }
          }
        }
      } catch (e: any) {
        console.warn('[Dashboard] TikTok stats fetch failed:', e?.message);
      }
    }

    // (LinkedIn cached stats — connection count needs r_member_social
    // scope which we haven't requested yet. liConnections stays 0 and
    // liPostCount is derived from byPlatform after it's built below.)
  } catch {}

  // Break totals down by platform so the Content panel can surface a tidy
  // per-network view (Instagram / TikTok / LinkedIn) instead of one blended
  // row — asked for a pleasant UX grouped per réseau.
  const byPlatform: Record<string, { published: number; scheduled: number; drafts: number; total: number }> = {};
  for (const p of allPosts) {
    const plat = (p.platform || 'instagram').toLowerCase();
    if (!byPlatform[plat]) byPlatform[plat] = { published: 0, scheduled: 0, drafts: 0, total: 0 };
    byPlatform[plat].total++;
    if (p.status === 'published') byPlatform[plat].published++;
    else if (p.status === 'approved') byPlatform[plat].scheduled++;
    else if (p.status === 'draft') byPlatform[plat].drafts++;
  }

  // LinkedIn fallback post count uses KeiroAI-published count from
  // byPlatform — recorded here once byPlatform is built. When we add
  // r_member_social we can fetch the real total.
  if (linkedinConnected) {
    liPostCount = byPlatform['linkedin']?.published || 0;
  }

  return {
    contentStats: {
      postsGenerated: allPosts.length,
      scheduledPosts: scheduled.length,
      publishedPosts: published.length,
      draftPosts: drafts.length,
      totalLikes,
      totalComments,
      totalViews,
      followersCount,
      reach: igInsights?.reach || 0,
      accountsEngaged: igInsights?.accounts_engaged || 0,
      engagement: followersCount > 0 && published.length > 0 ? Math.round(((totalLikes + totalComments) / published.length / followersCount) * 10000) / 100 : 0,
      recentContent: allPosts.slice(0, 30),
      // Per-network breakdown for the Content panel.
      // - `connected` tells the UI whether to render the connect-CTA tile or a stats tile.
      // - `hasActivity` is true when KeiroAI has published at least one post on this
      //   network — used to show a "KeiroAI-published" badge alongside the stats.
      // The metric values themselves are now sourced from the user's REAL Instagram
      // account (followers, recent likes, comments, daily reach) as soon as the
      // account is connected, so the dashboard never feels empty.
      byNetwork: {
        instagram: {
          connected: igConnected,
          hasActivity: published.length > 0 && igConnected,
          // "Posts" = real Instagram media_count when connected (from
          // /me?fields=media_count). The KeiroAI-published count is
          // surfaced separately as keiroai_posts so the UI can show
          // "170 posts · 12 via KeiroAI" if it wants. We never want
          // the primary "Posts" number to be the KeiroAI count alone
          // — that's what was breaking metareview ("1 post" instead
          // of the real 170).
          posts: igMediaCount || byPlatform['instagram']?.published || 0,
          keiroai_posts: byPlatform['instagram']?.published || 0,
          scheduled: byPlatform['instagram']?.scheduled || 0,
          followers: followersCount,
          likes: totalLikes,
          comments: totalComments,
          reach: igInsights?.reach || 0,
          // Engagement rate = (likes + comments) on the sampled recent
          // media / sampled count / followers, expressed in %. Was
          // previously divided by KeiroAI-published count which gave
          // absurd values for accounts pre-existing the app.
          engagement: followersCount > 0 && (totalLikes + totalComments) > 0 && igSampledMediaCount > 0
            ? Math.round(((totalLikes + totalComments) / igSampledMediaCount / followersCount) * 10000) / 100
            : 0,
        },
        tiktok: {
          connected: tiktokConnected,
          hasActivity: tiktokConnected && (byPlatform['tiktok']?.published || 0) > 0,
          // Posts = real TikTok video_count (from /v2/user/info), fall
          // back to KeiroAI-published count. Same fix as IG.
          posts: ttVideoCount || byPlatform['tiktok']?.published || 0,
          keiroai_posts: byPlatform['tiktok']?.published || 0,
          scheduled: byPlatform['tiktok']?.scheduled || 0,
          followers: ttFollowers,
          likes: ttLikes,
          views: ttAvgViews,
          // Engagement rate = total_likes / video_count / followers × 100
          engagement: ttFollowers > 0 && ttVideoCount > 0 && ttLikes > 0
            ? Math.round((ttLikes / ttVideoCount / ttFollowers) * 10000) / 100
            : 0,
        },
        linkedin: {
          connected: linkedinConnected,
          hasActivity: linkedinConnected && (byPlatform['linkedin']?.published || 0) > 0,
          // LinkedIn doesn't expose a public total post count without
          // querying UGC posts (heavy). For now show the KeiroAI-
          // published count and label it accordingly. Connection count
          // needs r_member_social scope — placeholder 0 until added.
          posts: liPostCount,
          keiroai_posts: byPlatform['linkedin']?.published || 0,
          scheduled: byPlatform['linkedin']?.scheduled || 0,
          followers: liConnections, // ContentPanel labels this "Connections"
          reactions: 0,
          engagement: 0,
        },
      },
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
  // Try blog_posts first, fall back to agent_logs
  const { data: blogPosts, error: blogError } = await supabase
    .from('blog_posts')
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

  // Extract financial data from log results
  let revenue = 0;
  let expenses = 0;
  const recentTransactions: any[] = [];

  for (const log of logs) {
    const r = typeof log.result === 'string' ? (() => { try { return JSON.parse(log.result); } catch { return log.result; } })() : log.result;
    if (r && typeof r === 'object') {
      if (r.revenue) revenue += Number(r.revenue) || 0;
      if (r.expenses) expenses += Number(r.expenses) || 0;
      if (r.amount) {
        recentTransactions.push({
          label: r.label || r.description || log.action || 'Transaction',
          amount: Number(r.amount) || 0,
          type: r.type || (Number(r.amount) >= 0 ? 'revenue' : 'expense'),
          date: log.created_at,
        });
      }
    }
  }

  return {
    financeStats: {
      revenue,
      expenses,
      profit: revenue - expenses,
      margin: revenue - expenses,
      profitMargin: revenue > 0 ? Math.round(((revenue - expenses) / revenue) * 100) : 0,
      totalEntries: logs.length,
      recentTransactions: recentTransactions.slice(0, 10),
      recentLogs: logs.slice(0, 10),
    },
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

  // Build recentDocs from doc-related logs
  const recentDocs = logs
    .filter(l => typeof l.action === 'string' && (l.action.includes('document') || l.action.includes('contrat') || l.action.includes('generate')))
    .slice(0, 10)
    .map(l => {
      const r = typeof l.result === 'string' ? (() => { try { return JSON.parse(l.result); } catch { return {}; } })() : (l.result || {});
      return {
        title: r.title || r.name || l.action || 'Document',
        type: l.action?.includes('contrat') ? 'contrat' : 'document',
        date: l.created_at,
      };
    });

  return {
    rhStats: {
      docsGenerated,
      questionsAnswered,
      activeContracts,
      totalActions: logs.length,
      recentDocs,
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

  // DM queue stats — scoped to client's prospects. Now includes the full
  // funnel (verified / skipped / sent / responded) so the workspace panel
  // can show DM channel attribution, not just "sent count".
  const prospectIdsForDM = (await supabase.from('crm_prospects').select('id').or(`user_id.eq.${userId},created_by.eq.${userId}`).not('instagram', 'is', null).limit(2000)).data || [];
  const pIds = prospectIdsForDM.map(p => p.id);
  let queueTotal = 0, queuePending = 0, queueSent = 0, queueFailed = 0;
  let queueSkipped = 0, queueResponded = 0, queueVerifiedReady = 0;
  if (pIds.length > 0) {
    const batchIds = pIds.slice(0, 500); // Limit for query perf
    const baseQ = () => supabase.from('dm_queue').select('id', { count: 'exact', head: true }).eq('channel', 'instagram').in('prospect_id', batchIds);
    const [qt, qp, qs, qf, qsk, qr, qv] = await Promise.all([
      baseQ(),
      baseQ().eq('status', 'pending'),
      baseQ().eq('status', 'sent'),
      baseQ().eq('status', 'failed'),
      baseQ().eq('status', 'skipped'),
      baseQ().eq('status', 'responded'),
      baseQ().eq('status', 'pending').eq('verified_exists', true),
    ]);
    queueTotal = qt.count ?? 0;
    queuePending = qp.count ?? 0;
    queueSent = qs.count ?? 0;
    queueFailed = qf.count ?? 0;
    queueSkipped = qsk.count ?? 0;
    queueResponded = qr.count ?? 0;
    queueVerifiedReady = qv.count ?? 0;
  }

  // Prospects with Instagram for DM potential — strict per-account isolation.
  const igProspectsQuery = supabase.from('crm_prospects')
    .select('id', { count: 'exact', head: true })
    .not('instagram', 'is', null)
    .neq('instagram', '');
  if (orgId) {
    igProspectsQuery.eq('org_id', orgId);
  } else {
    igProspectsQuery.eq('user_id', userId);
  }
  const { count: prospectsWithIG } = await igProspectsQuery;

  // Likes given (from send-queue pre-engagement) — note the column is `data`,
  // not `result`, so the previous read was always undefined.
  const likesLogs = logs.filter(l => typeof l.action === 'string' && l.action.includes('like'));
  let totalLikesGiven = 0;
  for (const l of likesLogs) {
    const d = (l as any).data || (l as any).result || {};
    totalLikesGiven += d?.likes || 1;
  }

  // Response rate on the channel: how many of the DMs we actually sent
  // received a reply? Compared against (sent + responded) because by the
  // time the prospect replies, dm_queue.status flips from sent → responded.
  const sentOrResponded = queueSent + queueResponded;
  const dmResponseRate = sentOrResponded > 0 ? Math.round((queueResponded / sentOrResponded) * 100) : 0;

  return {
    dmStats: {
      dmsSent: (queueSent ?? 0) + dmsSent,
      dmReceived,
      responses,
      rdvGenerated,
      handovers,
      responseRate: dmResponseRate, // % of sent DMs that got a reply
      prospectsGenerated: dmProspects ?? 0,
      prospectsWithIG: prospectsWithIG ?? 0,
      totalActions: logs.length,
      // Full funnel stats
      queueTotal,
      queuePending,
      queueSent,
      queueFailed,
      queueSkipped,       // NEW — invalid/unreachable handles we skipped
      queueResponded,     // NEW — prospects who replied to our DM
      queueVerifiedReady, // NEW — pending DMs with a verified IG account
      likesGiven: totalLikesGiven,
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
        .eq('user_id', user.id)
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
        // Emails sent + prospects in sequence — strict per-account isolation.
        let query = supabase
          .from('crm_activities')
          .select('id, prospect_id, type, description, data, created_at')
          .ilike('type', 'email%')
          .order('created_at', { ascending: false })
          .limit(50);
        if (orgId) query = query.eq('org_id', orgId);
        else query = query.eq('user_id', user.id);
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
          .eq('user_id', user.id)
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
      .select('is_admin, instagram_business_account_id, instagram_access_token, instagram_igaa_token, facebook_page_access_token, facebook_page_id, google_business_location_id, subscription_plan, linkedin_access_token, tiktok_access_token, gmail_email, gmail_refresh_token, gmail_access_token')
      .eq('id', user.id)
      .single();
    const isAdmin = !!userProfile?.is_admin;

    // Connection status — passed to frontend so panels know what's connected.
    // IGAA token counts as "Instagram connected" because it's the permanent
    // token we use for DMs when Meta hasn't approved instagram_manage_messages.
    // Without this, clients with only IGAA (no classic FB page id) show as
    // disconnected on every panel even though the DM pipeline works.
    const connections = {
      instagram: !!(userProfile?.instagram_business_account_id && (
        userProfile?.instagram_igaa_token ||
        userProfile?.facebook_page_access_token ||
        userProfile?.instagram_access_token ||
        userProfile?.facebook_page_id
      )),
      google: !!userProfile?.google_business_location_id,
      linkedin: !!userProfile?.linkedin_access_token,
      tiktok: !!userProfile?.tiktok_access_token,
      gmail: !!(userProfile?.gmail_refresh_token || (userProfile as any)?.gmail_access_token),
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
      case 'ceo': {
        // Noah CEO: aggregate data from all agents for strategic overview
        const [commercialData, emailData, dmData, contentData] = await Promise.all([
          getCommercialData(supabase, dashboardUserId || user.id, dashboardOrgId),
          getEmailData(supabase, dashboardUserId || user.id, dashboardOrgId),
          getDmInstagramData(supabase, user.id, orgId),
          getContentData(supabase, dashboardUserId || user.id),
        ]);
        // Get recent logs from ALL agents
        const { data: allLogs } = await supabase
          .from('agent_logs')
          .select('agent, action, status, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        agentData = {
          ...agentData,
          prospects: (commercialData as any).prospects,
          stats: (commercialData as any).stats,
          emailStats: emailData,
          dmStats: { sent: (dmData as any).dmStats?.totalDMs || 0 },
          contentStats: { published: (contentData as any).contentStats?.publishedCount || 0 },
          recentLogs: allLogs || [],
        };
        break;
      }
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
