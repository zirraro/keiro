import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function checkAdmin(supabase: ReturnType<typeof getAdminClient>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return profile?.is_admin === true;
}

// ─── Funnel stages in pipeline order ─────────────────────────────────────────
const FUNNEL_STAGES = [
  'identifie', 'contacte', 'relance_1', 'relance_2', 'relance_3',
  'repondu', 'demo', 'sprint', 'client',
] as const;

const CONVERTED_STATUSES = ['client', 'sprint'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100; // two decimals
}

// ─── GET /api/admin/crm/stats ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const supabase = getAdminClient();
    if (!(await checkAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'all';
    const dateFrom = searchParams.get('date_from') || '2020-01-01';
    const dateTo = searchParams.get('date_to') || new Date().toISOString();

    const result: Record<string, any> = { ok: true };

    // Run requested computations in parallel
    const tasks: Promise<void>[] = [];

    if (type === 'funnel' || type === 'all') {
      tasks.push(computeFunnel(supabase).then((d) => { result.funnel = d; }));
    }
    if (type === 'email_perf' || type === 'all') {
      tasks.push(
        computeEmailByCategory(supabase, dateFrom, dateTo).then((d) => { result.emailByCategory = d; }),
      );
      tasks.push(
        computeEmailByStep(supabase, dateFrom, dateTo).then((d) => { result.emailByStep = d; }),
      );
    }
    if (type === 'best_actions' || type === 'all') {
      tasks.push(computeBestActions(supabase).then((d) => { result.bestActions = d; }));
    }
    if (type === 'engagement' || type === 'all') {
      tasks.push(computeEngagementTracker(supabase).then((d) => { result.engagement = d; }));
    }
    if (type === 'all') {
      tasks.push(computeSourceAttribution(supabase).then((d) => { result.sourceAttribution = d; }));
    }

    await Promise.all(tasks);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Admin CRM Stats] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ─── 1. Funnel Stats ────────────────────────────────────────────────────────

async function computeFunnel(supabase: ReturnType<typeof getAdminClient>) {
  // Fetch all prospects' status + email_sequence_step for accurate counting
  // email_sequence_step is the source of truth (status may be stale due to past constraint bug)
  const { data: allProspects } = await supabase
    .from('crm_prospects')
    .select('status, email_sequence_step')
    .limit(50000);

  const stepToStage: Record<number, string> = { 2: 'relance_1', 3: 'relance_2', 4: 'relance_3', 5: 'relance_3' };
  const countMap: Record<string, number> = {};
  const allStagesWithPerdu = [...FUNNEL_STAGES, 'perdu'];
  for (const s of allStagesWithPerdu) countMap[s] = 0;

  for (const p of (allProspects || [])) {
    const step = p.email_sequence_step ?? 0;
    // If status is 'contacte' but step >= 2, count under the correct relance stage
    const effectiveStatus = (p.status === 'contacte' && step >= 2 && stepToStage[step])
      ? stepToStage[step]
      : (p.status || 'identifie');
    countMap[effectiveStatus] = (countMap[effectiveStatus] || 0) + 1;
  }

  // Cumulative counts: sum from that point forward (excluding 'perdu')
  const stages: { stage: string; current: number; cumulative: number }[] = [];
  const cumulatives: number[] = new Array(FUNNEL_STAGES.length).fill(0);
  let cumulativeFromEnd = 0;
  for (let i = FUNNEL_STAGES.length - 1; i >= 0; i--) {
    cumulativeFromEnd += countMap[FUNNEL_STAGES[i]] || 0;
    cumulatives[i] = cumulativeFromEnd;
  }

  for (let i = 0; i < FUNNEL_STAGES.length; i++) {
    stages.push({
      stage: FUNNEL_STAGES[i],
      current: countMap[FUNNEL_STAGES[i]] || 0,
      cumulative: cumulatives[i],
    });
  }

  // Conversion rates between adjacent stages (cumulative-based)
  const conversionRates: { from: string; to: string; rate: number }[] = [];
  for (let i = 0; i < FUNNEL_STAGES.length - 1; i++) {
    conversionRates.push({
      from: FUNNEL_STAGES[i],
      to: FUNNEL_STAGES[i + 1],
      rate: rate(cumulatives[i + 1], cumulatives[i]),
    });
  }

  return { stages, conversionRates, perdu: countMap['perdu'] || 0 };
}

// ─── 2. Email Performance by Category ────────────────────────────────────────

async function computeEmailByCategory(
  supabase: ReturnType<typeof getAdminClient>,
  dateFrom: string,
  dateTo: string,
) {
  // Fetch email-related activities in date range
  const [sentRes, openedRes, clickedRes, repliedRes] = await Promise.all([
    supabase
      .from('crm_activities')
      .select('prospect_id, data, created_at')
      .eq('type', 'email')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo)
      .limit(5000),
    supabase
      .from('crm_activities')
      .select('prospect_id, data, created_at')
      .eq('type', 'email_opened')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo)
      .limit(5000),
    supabase
      .from('crm_activities')
      .select('prospect_id, data, created_at')
      .eq('type', 'email_clicked')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo)
      .limit(5000),
    supabase
      .from('crm_activities')
      .select('prospect_id, data, created_at')
      .eq('type', 'email_replied')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo)
      .limit(5000),
  ]);

  const sentActivities = sentRes.data || [];
  const openedActivities = openedRes.data || [];
  const clickedActivities = clickedRes.data || [];
  const repliedActivities = repliedRes.data || [];

  // Collect unique prospect IDs to fetch their types
  const prospectIds = new Set<string>();
  for (const a of [...sentActivities, ...openedActivities, ...clickedActivities, ...repliedActivities]) {
    if (a.prospect_id) prospectIds.add(a.prospect_id);
  }

  // Fetch prospect types
  const prospectTypeMap: Record<string, string> = {};
  if (prospectIds.size > 0) {
    const ids = Array.from(prospectIds);
    // Batch in chunks of 200
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data } = await supabase
        .from('crm_prospects')
        .select('id, type')
        .in('id', chunk);
      if (data) {
        for (const p of data) {
          prospectTypeMap[p.id] = p.type || 'inconnu';
        }
      }
    }
  }

  // Helper: get category from activity data or prospect type
  function getCategory(activity: any): string {
    const d = activity.data as any;
    if (d && typeof d === 'object' && d.category) return d.category;
    return prospectTypeMap[activity.prospect_id] || 'inconnu';
  }

  // Group by category
  const categories: Record<string, { sent: number; opened: number; clicked: number; replied: number }> = {};

  function ensure(cat: string) {
    if (!categories[cat]) categories[cat] = { sent: 0, opened: 0, clicked: 0, replied: 0 };
  }

  for (const a of sentActivities) { const c = getCategory(a); ensure(c); categories[c].sent++; }
  for (const a of openedActivities) { const c = getCategory(a); ensure(c); categories[c].opened++; }
  for (const a of clickedActivities) { const c = getCategory(a); ensure(c); categories[c].clicked++; }
  for (const a of repliedActivities) { const c = getCategory(a); ensure(c); categories[c].replied++; }

  return Object.entries(categories).map(([category, stats]) => ({
    category,
    ...stats,
    openRate: rate(stats.opened, stats.sent),
    clickRate: rate(stats.clicked, stats.sent),
    replyRate: rate(stats.replied, stats.sent),
  }));
}

// ─── 3. Email Performance by Step ────────────────────────────────────────────

async function computeEmailByStep(
  supabase: ReturnType<typeof getAdminClient>,
  dateFrom: string,
  dateTo: string,
) {
  const [sentRes, openedRes, clickedRes, repliedRes] = await Promise.all([
    supabase
      .from('crm_activities')
      .select('data')
      .eq('type', 'email')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo)
      .limit(5000),
    supabase
      .from('crm_activities')
      .select('data')
      .eq('type', 'email_opened')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo)
      .limit(5000),
    supabase
      .from('crm_activities')
      .select('data')
      .eq('type', 'email_clicked')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo)
      .limit(5000),
    supabase
      .from('crm_activities')
      .select('data')
      .eq('type', 'email_replied')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo)
      .limit(5000),
  ]);

  function getStep(activity: any): number {
    const d = activity.data as any;
    if (d && typeof d === 'object' && d.step != null) return Number(d.step);
    return 0;
  }

  const steps: Record<number, { sent: number; opened: number; clicked: number; replied: number }> = {};

  function ensure(step: number) {
    if (!steps[step]) steps[step] = { sent: 0, opened: 0, clicked: 0, replied: 0 };
  }

  for (const a of (sentRes.data || [])) { const s = getStep(a); ensure(s); steps[s].sent++; }
  for (const a of (openedRes.data || [])) { const s = getStep(a); ensure(s); steps[s].opened++; }
  for (const a of (clickedRes.data || [])) { const s = getStep(a); ensure(s); steps[s].clicked++; }
  for (const a of (repliedRes.data || [])) { const s = getStep(a); ensure(s); steps[s].replied++; }

  return Object.entries(steps)
    .map(([step, stats]) => ({
      step: Number(step),
      ...stats,
      openRate: rate(stats.opened, stats.sent),
      clickRate: rate(stats.clicked, stats.sent),
      replyRate: rate(stats.replied, stats.sent),
    }))
    .sort((a, b) => a.step - b.step);
}

// ─── 4. Best Actions ────────────────────────────────────────────────────────

async function computeBestActions(supabase: ReturnType<typeof getAdminClient>) {
  // Get all converted prospects
  const { data: convertedProspects } = await supabase
    .from('crm_prospects')
    .select('id')
    .in('status', CONVERTED_STATUSES);

  if (!convertedProspects || convertedProspects.length === 0) {
    return [];
  }

  const convertedIds = convertedProspects.map((p) => p.id);

  // Fetch all activities for converted prospects
  const actionCounts: Record<string, { total: number; converted: number }> = {};
  const ACTION_TYPES = ['email', 'dm_instagram', 'dm_tiktok', 'tiktok_comment', 'comment_prepared', 'appel', 'visite', 'relance'];

  // Get total count of each action type across all prospects
  const totalPromises = ACTION_TYPES.map(async (actionType) => {
    const { count } = await supabase
      .from('crm_activities')
      .select('id', { count: 'exact', head: true })
      .eq('type', actionType);
    return { actionType, count: count || 0 };
  });

  const totals = await Promise.all(totalPromises);
  for (const { actionType, count } of totals) {
    actionCounts[actionType] = { total: count, converted: 0 };
  }

  // For converted prospects, count which action types they had
  // Batch prospect IDs in chunks
  for (let i = 0; i < convertedIds.length; i += 200) {
    const chunk = convertedIds.slice(i, i + 200);
    const { data: activities } = await supabase
      .from('crm_activities')
      .select('type, prospect_id')
      .in('prospect_id', chunk)
      .in('type', ACTION_TYPES);

    if (activities) {
      // Count unique prospect-action pairs
      const seen = new Set<string>();
      for (const a of activities) {
        const key = `${a.prospect_id}:${a.type}`;
        if (!seen.has(key)) {
          seen.add(key);
          if (actionCounts[a.type]) {
            actionCounts[a.type].converted++;
          }
        }
      }
    }
  }

  return Object.entries(actionCounts)
    .filter(([, stats]) => stats.total > 0)
    .map(([actionType, stats]) => ({
      actionType,
      totalActivities: stats.total,
      convertedProspects: stats.converted,
      conversionRate: rate(stats.converted, convertedProspects.length),
    }))
    .sort((a, b) => b.conversionRate - a.conversionRate);
}

// ─── 5. Source Attribution ──────────────────────────────────────────────────

async function computeSourceAttribution(supabase: ReturnType<typeof getAdminClient>) {
  const { data: prospects } = await supabase
    .from('crm_prospects')
    .select('source, status')
    .limit(10000);

  if (!prospects || prospects.length === 0) {
    return [];
  }

  const sources: Record<string, { total: number; converted: number }> = {};

  for (const p of prospects) {
    const src = p.source || 'inconnu';
    if (!sources[src]) sources[src] = { total: 0, converted: 0 };
    sources[src].total++;
    if (CONVERTED_STATUSES.includes(p.status)) {
      sources[src].converted++;
    }
  }

  return Object.entries(sources)
    .map(([source, stats]) => ({
      source,
      total: stats.total,
      converted: stats.converted,
      conversionRate: rate(stats.converted, stats.total),
    }))
    .sort((a, b) => b.total - a.total);
}

// ─── 6. Engagement Tracker (daily actions by business type) ─────────────────

async function computeEngagementTracker(supabase: ReturnType<typeof getAdminClient>) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);

  // Fetch last 7 days of engagement activities + prospect types
  const engagementTypes = ['email', 'email_opened', 'email_clicked', 'email_replied', 'dm_instagram', 'dm_replied'];
  const { data: activities } = await supabase
    .from('crm_activities')
    .select('type, prospect_id, data, created_at')
    .in('type', engagementTypes)
    .gte('created_at', weekStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(5000);

  if (!activities || activities.length === 0) {
    return { today: [], week: [], byType: [], timeline: [] };
  }

  // Fetch prospect types for these activities
  const prospectIds = [...new Set(activities.map(a => a.prospect_id).filter(Boolean))];
  const prospectMap: Record<string, { type: string; company: string; status: string }> = {};
  for (let i = 0; i < prospectIds.length; i += 200) {
    const chunk = prospectIds.slice(i, i + 200);
    const { data } = await supabase
      .from('crm_prospects')
      .select('id, type, company, status')
      .in('id', chunk);
    if (data) {
      for (const p of data) {
        prospectMap[p.id] = { type: p.type || 'autre', company: p.company || '', status: p.status || '' };
      }
    }
  }

  const todayISO = todayStart.toISOString();

  // Today's engagement events (for the daily tracker)
  const todayEvents = activities
    .filter(a => a.created_at >= todayISO)
    .map(a => {
      const prospect = prospectMap[a.prospect_id] || { type: 'autre', company: '?', status: '' };
      return {
        type: a.type,
        businessType: prospect.type,
        company: prospect.company,
        prospectStatus: prospect.status,
        step: (a.data as any)?.step || null,
        subject: (a.data as any)?.subject || null,
        created_at: a.created_at,
      };
    });

  // Aggregate: engagement by business type (last 7 days)
  const typeStats: Record<string, { sent: number; opened: number; clicked: number; replied: number; dm: number; dm_replied: number }> = {};
  for (const a of activities) {
    const bType = prospectMap[a.prospect_id]?.type || 'autre';
    if (!typeStats[bType]) typeStats[bType] = { sent: 0, opened: 0, clicked: 0, replied: 0, dm: 0, dm_replied: 0 };
    if (a.type === 'email') typeStats[bType].sent++;
    else if (a.type === 'email_opened') typeStats[bType].opened++;
    else if (a.type === 'email_clicked') typeStats[bType].clicked++;
    else if (a.type === 'email_replied') typeStats[bType].replied++;
    else if (a.type === 'dm_instagram') typeStats[bType].dm++;
    else if (a.type === 'dm_replied') typeStats[bType].dm_replied++;
  }

  const byType = Object.entries(typeStats)
    .map(([businessType, stats]) => ({
      businessType,
      ...stats,
      openRate: rate(stats.opened, stats.sent),
      clickRate: rate(stats.clicked, stats.sent),
      replyRate: rate(stats.replied, stats.sent),
    }))
    .sort((a, b) => b.sent - a.sent);

  // Daily timeline: group by day
  const dailyCounts: Record<string, { date: string; sent: number; opened: number; clicked: number; replied: number }> = {};
  for (const a of activities) {
    const day = a.created_at.substring(0, 10);
    if (!dailyCounts[day]) dailyCounts[day] = { date: day, sent: 0, opened: 0, clicked: 0, replied: 0 };
    if (a.type === 'email') dailyCounts[day].sent++;
    else if (a.type === 'email_opened') dailyCounts[day].opened++;
    else if (a.type === 'email_clicked') dailyCounts[day].clicked++;
    else if (a.type === 'email_replied') dailyCounts[day].replied++;
  }
  const timeline = Object.values(dailyCounts).sort((a, b) => a.date.localeCompare(b.date));

  return { today: todayEvents, byType, timeline };
}
