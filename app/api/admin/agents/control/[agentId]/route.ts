/**
 * Admin agent control panel API. Returns per-client status + recent
 * runs + errors + network-specific data for ONE agent across ALL
 * KeiroAI clients. Powers /admin/agents/control/[agentId].
 *
 * Founder ask 2026-06-08: "il faut que chaque agent de supervision
 * ai aussi un vrai panel de control avec des data coherente selon le
 * reseaux social et les actions et taches dedies aux agent stp soit
 * un veritable expert qui permet de piloter chaque fonctionnement de
 * chaque agent pour tout les clients keiroai".
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { computeHealthScore } from '@/lib/agents/health-score';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Agent → network mapping, used by the UI to render the right KPIs.
const AGENT_NETWORKS: Record<string, string[]> = {
  content: ['instagram', 'tiktok', 'linkedin'],
  dm_instagram: ['instagram', 'tiktok'],
  email: ['email'],
  commercial: ['crm'],
  reviews: ['google_business'],
  ceo: ['internal'],
  amit: ['internal'],
  marketing: ['cross'],
  seo: ['blog'],
  onboarding: ['email'],
  retention: ['email'],
  instagram_comments: ['instagram'],
  tiktok_comments: ['tiktok'],
};

// Network-specific KPI query per agent (Supabase column → label).
const AGENT_KPI_FIELDS: Record<string, Array<{ label: string; column: string; format?: string }>> = {
  content: [
    { label: 'IG followers', column: 'instagram_followers' },
    { label: 'TikTok followers', column: 'tiktok_followers' },
    { label: 'LinkedIn followers', column: 'linkedin_connections' },
  ],
  dm_instagram: [
    { label: 'IG username', column: 'instagram_username' },
    { label: 'IG followers', column: 'instagram_followers' },
  ],
  email: [
    { label: 'SMTP / Gmail', column: 'smtp_host' },
    { label: 'Managed', column: 'managed_email_from' },
  ],
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { agentId } = await ctx.params;
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  // ── 1. All clients with their relevant profile fields for this agent ──
  const baseColumns = ['id', 'email', 'first_name', 'subscription_plan', 'scheduling_paused_at'];
  const kpiCols = (AGENT_KPI_FIELDS[agentId] || []).map(f => f.column);
  const sel = [...new Set([...baseColumns, ...kpiCols])].join(', ');

  const { data: clients } = await supabase
    .from('profiles')
    .select(sel)
    .not('subscription_plan', 'is', null)
    .limit(200);

  // ── 2. Aggregate agent_logs by user for this agent (24h + 7d) ──
  const { data: logs7d } = await supabase
    .from('agent_logs')
    .select('user_id, action, status, data, created_at')
    .eq('agent', agentId)
    .gte('created_at', since7d)
    .order('created_at', { ascending: false })
    .limit(5000);

  const byClient: Record<string, {
    runs24h: number; runs7d: number;
    errors24h: number; errors7d: number;
    lastRunAt: string | null; lastActionAt: string | null;
    lastError: string | null;
    actionsBreakdown: Record<string, number>;
  }> = {};

  for (const l of (logs7d || []) as any[]) {
    const uid = l.user_id || '__no_user__';
    if (!byClient[uid]) {
      byClient[uid] = {
        runs24h: 0, runs7d: 0, errors24h: 0, errors7d: 0,
        lastRunAt: null, lastActionAt: null, lastError: null,
        actionsBreakdown: {},
      };
    }
    const slot = byClient[uid];
    const isErr = l.status === 'error' || l.status === 'failed';
    const at24h = l.created_at >= since24h;

    slot.runs7d++;
    if (at24h) slot.runs24h++;
    if (isErr) {
      slot.errors7d++;
      if (at24h) slot.errors24h++;
      if (!slot.lastError) slot.lastError = (l.data?.error || l.data?.message || l.action || '').toString().substring(0, 200);
    }
    if (!slot.lastRunAt || l.created_at > slot.lastRunAt) slot.lastRunAt = l.created_at;
    if (!isErr && (!slot.lastActionAt || l.created_at > slot.lastActionAt)) slot.lastActionAt = l.created_at;
    slot.actionsBreakdown[l.action] = (slot.actionsBreakdown[l.action] || 0) + 1;
  }

  // ── 3. Agent-specific volume metrics (publications, emails, DMs, prospects) ──
  let volumeMetrics: Record<string, any> = {};
  if (agentId === 'content') {
    const { data: posts } = await supabase
      .from('content_calendar')
      .select('user_id, platform, status, scheduled_date, published_at')
      .gte('created_at', since7d);
    const pubByUser: Record<string, { ig: number; tt: number; li: number; failed: number }> = {};
    for (const p of (posts || []) as any[]) {
      const uid = p.user_id;
      if (!uid) continue;
      if (!pubByUser[uid]) pubByUser[uid] = { ig: 0, tt: 0, li: 0, failed: 0 };
      if (p.status === 'published') {
        if (p.platform === 'instagram') pubByUser[uid].ig++;
        else if (p.platform === 'tiktok') pubByUser[uid].tt++;
        else if (p.platform === 'linkedin') pubByUser[uid].li++;
      } else if (p.status === 'publish_failed') pubByUser[uid].failed++;
    }
    volumeMetrics = pubByUser;
  } else if (agentId === 'email') {
    const { data: acts } = await supabase
      .from('crm_activities')
      .select('user_id, type, created_at')
      .like('type', 'email%')
      .gte('created_at', since7d);
    const byUser: Record<string, { sent: number; opened: number; clicked: number; replied: number }> = {};
    for (const a of (acts || []) as any[]) {
      const uid = a.user_id;
      if (!uid) continue;
      if (!byUser[uid]) byUser[uid] = { sent: 0, opened: 0, clicked: 0, replied: 0 };
      if (a.type === 'email') byUser[uid].sent++;
      else if (a.type === 'email_opened') byUser[uid].opened++;
      else if (a.type === 'email_clicked') byUser[uid].clicked++;
      else if (a.type === 'email_replied') byUser[uid].replied++;
    }
    volumeMetrics = byUser;
  } else if (agentId === 'dm_instagram') {
    const { data: dms } = await supabase
      .from('dm_queue')
      .select('user_id, status, channel, created_at')
      .gte('created_at', since7d);
    const byUser: Record<string, { sent: number; pending: number; failed: number }> = {};
    for (const d of (dms || []) as any[]) {
      const uid = d.user_id;
      if (!uid) continue;
      if (!byUser[uid]) byUser[uid] = { sent: 0, pending: 0, failed: 0 };
      if (d.status === 'sent') byUser[uid].sent++;
      else if (d.status === 'pending' || d.status === 'queued') byUser[uid].pending++;
      else if (d.status === 'failed') byUser[uid].failed++;
    }
    volumeMetrics = byUser;
  } else if (agentId === 'commercial') {
    const { data: prospects } = await supabase
      .from('crm_prospects')
      .select('user_id, created_at, status')
      .gte('created_at', since7d);
    const byUser: Record<string, { added: number; client: number; perdu: number }> = {};
    for (const p of (prospects || []) as any[]) {
      const uid = p.user_id;
      if (!uid) continue;
      if (!byUser[uid]) byUser[uid] = { added: 0, client: 0, perdu: 0 };
      byUser[uid].added++;
      if (p.status === 'client') byUser[uid].client++;
      else if (p.status === 'perdu') byUser[uid].perdu++;
    }
    volumeMetrics = byUser;
  }

  // ── 3.5. Active anomalies indexed by user_id for health score ──
  const { data: anomalies } = await supabase
    .from('anomaly_alerts')
    .select('user_id, severity')
    .eq('agent', agentId)
    .is('resolved_at', null);
  const anomaliesByUser: Record<string, Array<{ severity: 'P0' | 'P1' | 'P2' }>> = {};
  for (const a of (anomalies || []) as any[]) {
    const uid = a.user_id || '__global__';
    if (!anomaliesByUser[uid]) anomaliesByUser[uid] = [];
    anomaliesByUser[uid].push({ severity: a.severity });
  }

  // ── 4. Build per-client rows + health score ──
  const rows = (clients || []).map((c: any) => {
    const stats = byClient[c.id] || {
      runs24h: 0, runs7d: 0, errors24h: 0, errors7d: 0,
      lastRunAt: null, lastActionAt: null, lastError: null,
      actionsBreakdown: {},
    };
    const volume = volumeMetrics[c.id] || {};
    const health = computeHealthScore({
      runs_7d: stats.runs7d,
      errors_7d: stats.errors7d,
      last_run_at: stats.lastRunAt,
      paused: !!c.scheduling_paused_at,
      active_anomalies: anomaliesByUser[c.id] || [],
    });
    return {
      user_id: c.id,
      email: c.email,
      first_name: c.first_name,
      plan: c.subscription_plan,
      paused: !!c.scheduling_paused_at,
      runs_24h: stats.runs24h,
      runs_7d: stats.runs7d,
      errors_24h: stats.errors24h,
      errors_7d: stats.errors7d,
      last_run_at: stats.lastRunAt,
      last_success_at: stats.lastActionAt,
      last_error: stats.lastError,
      actions_breakdown: stats.actionsBreakdown,
      kpis: (AGENT_KPI_FIELDS[agentId] || []).reduce((acc: any, f) => {
        acc[f.label] = c[f.column] ?? null;
        return acc;
      }, {}),
      volume,
      health,
    };
  }).filter(r => r.runs_7d > 0 || (AGENT_KPI_FIELDS[agentId] || []).some(f => r.kpis[f.label]));

  // Sort: health worst first (RED → AMBER → GREEN), then errors, then activity
  rows.sort((a, b) => {
    const levelRank = { red: 0, amber: 1, green: 2 };
    const la = levelRank[a.health.level];
    const lb = levelRank[b.health.level];
    if (la !== lb) return la - lb;
    if (a.errors_24h !== b.errors_24h) return b.errors_24h - a.errors_24h;
    return b.runs_7d - a.runs_7d;
  });

  // ── 5. Aggregate summary ──
  const totalRuns24h = rows.reduce((s, r) => s + r.runs_24h, 0);
  const totalRuns7d = rows.reduce((s, r) => s + r.runs_7d, 0);
  const totalErrors24h = rows.reduce((s, r) => s + r.errors_24h, 0);
  const totalErrors7d = rows.reduce((s, r) => s + r.errors_7d, 0);
  const activeClients = rows.filter(r => r.runs_7d > 0).length;
  const successRate24h = totalRuns24h > 0 ? Math.round(((totalRuns24h - totalErrors24h) / totalRuns24h) * 100) : 100;
  const healthDistribution = {
    red: rows.filter(r => r.health.level === 'red').length,
    amber: rows.filter(r => r.health.level === 'amber').length,
    green: rows.filter(r => r.health.level === 'green').length,
  };

  return NextResponse.json({
    ok: true,
    agent_id: agentId,
    networks: AGENT_NETWORKS[agentId] || [],
    kpi_fields: AGENT_KPI_FIELDS[agentId] || [],
    summary: {
      total_clients: rows.length,
      active_clients: activeClients,
      total_runs_24h: totalRuns24h,
      total_runs_7d: totalRuns7d,
      total_errors_24h: totalErrors24h,
      total_errors_7d: totalErrors7d,
      success_rate_24h: successRate24h,
      health_red: healthDistribution.red,
      health_amber: healthDistribution.amber,
      health_green: healthDistribution.green,
    },
    clients: rows,
  });
}

/**
 * POST — pilot actions: trigger run for a client, pause, etc.
 * Body: { action: 'trigger' | 'pause' | 'resume', user_id: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { agentId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const targetUserId = body.user_id as string;
  if (!action || !targetUserId) return NextResponse.json({ ok: false, error: 'action + user_id required' }, { status: 400 });

  if (action === 'trigger') {
    // Map agent_id → endpoint
    const endpointMap: Record<string, string> = {
      content: '/api/agents/content',
      dm_instagram: '/api/agents/dm-instagram',
      email: '/api/agents/email/daily',
      commercial: '/api/agents/commercial',
      reviews: '/api/agents/google-reviews',
      ceo: '/api/agents/ceo',
      seo: '/api/agents/seo',
      onboarding: '/api/agents/onboarding',
      retention: '/api/agents/retention',
      marketing: '/api/agents/marketing',
      instagram_comments: '/api/agents/instagram-comments',
      gmaps: '/api/agents/gmaps',
    };
    const path = endpointMap[agentId];
    if (!path) return NextResponse.json({ ok: false, error: `No endpoint for ${agentId}` }, { status: 400 });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://keiroai.com';
    const cronSecret = process.env.CRON_SECRET;
    const sep = path.includes('?') ? '&' : '?';
    const url = `${appUrl}${path}${sep}user_id=${targetUserId}`;
    fetch(url, {
      method: 'POST',
      headers: cronSecret ? { 'Authorization': `Bearer ${cronSecret}`, 'Content-Type': 'application/json' } : {},
    }).catch(() => { /* fire-and-forget */ });
    return NextResponse.json({ ok: true, fired: agentId, user: targetUserId });
  }

  if (action === 'pause') {
    await supabase.from('profiles').update({
      scheduling_paused_at: new Date().toISOString(),
      scheduling_paused_reason: body.reason || 'admin pause',
    } as any).eq('id', targetUserId);
    return NextResponse.json({ ok: true, paused: targetUserId });
  }

  if (action === 'resume') {
    await supabase.from('profiles').update({
      scheduling_paused_at: null,
      scheduling_paused_reason: null,
    } as any).eq('id', targetUserId);
    return NextResponse.json({ ok: true, resumed: targetUserId });
  }

  return NextResponse.json({ ok: false, error: `Unknown action ${action}` }, { status: 400 });
}
