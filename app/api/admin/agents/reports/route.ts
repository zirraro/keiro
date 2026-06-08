/**
 * Detailed report export per agent × client × period.
 * Founder ask 2026-06-09: "je veux pouvoir sortir un rapport detaillé
 * par agent de supervision par client/agent pour analyse et
 * optimisation et par periode".
 *
 * Query params :
 *   agent (optional)    — agent_id filter (content, email, ...)
 *   user_id (optional)  — client filter
 *   from (optional ISO) — period start (default = 7 days ago)
 *   to (optional ISO)   — period end (default = now)
 *   format = json | csv (default json)
 *
 * Output : per-day x per-action breakdown of runs, errors, durations,
 * volume metrics + recurring error fingerprints + the most relevant
 * shared learnings that apply.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function fp(action: string, raw: string): string {
  let s = (raw || '').toLowerCase();
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>');
  s = s.replace(/\b\d{6,}\b/g, '<n>');
  s = s.replace(/https?:\/\/\S+/g, '<url>');
  return `${action}::${s.substring(0, 180)}`;
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function csvCell(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const agent = searchParams.get('agent') || null;
  const targetUserId = searchParams.get('user_id') || null;
  const from = searchParams.get('from') || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const to = searchParams.get('to') || new Date().toISOString();
  const format = (searchParams.get('format') || 'json').toLowerCase();

  let logsQ = supabase
    .from('agent_logs')
    .select('id, agent, user_id, action, status, data, created_at')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })
    .limit(20000);
  if (agent) logsQ = logsQ.eq('agent', agent);
  if (targetUserId) logsQ = logsQ.eq('user_id', targetUserId);

  const { data: logs } = await logsQ;

  // Daily breakdown : agent × user × day → counts + duration percentiles
  const dayMap: Record<string, { day: string; agent: string; user_id: string; ok: number; err: number; actions: Record<string, number>; durations: number[] }> = {};
  const errBuckets: Record<string, { fp: string; agent: string; user_id: string | null; action: string; sample: string; count: number; last_seen: string }> = {};

  for (const l of (logs || []) as any[]) {
    const day = (l.created_at || '').substring(0, 10);
    const key = `${day}::${l.agent}::${l.user_id || '__none__'}`;
    if (!dayMap[key]) dayMap[key] = { day, agent: l.agent, user_id: l.user_id || '', ok: 0, err: 0, actions: {}, durations: [] };
    const row = dayMap[key];
    const isErr = l.status === 'error' || l.status === 'failed';
    if (isErr) row.err++; else row.ok++;
    row.actions[l.action] = (row.actions[l.action] || 0) + 1;
    const d = Number(l.data?.duration_ms || l.data?.elapsed_ms || 0);
    if (d > 0 && d < 1200000) row.durations.push(d);

    if (isErr) {
      const raw = (l.data?.error || l.data?.message || '').toString();
      const fpKey = `${l.agent}::${l.user_id || 'null'}::${fp(l.action, raw)}`;
      if (!errBuckets[fpKey]) errBuckets[fpKey] = { fp: fpKey, agent: l.agent, user_id: l.user_id || null, action: l.action, sample: raw.substring(0, 240), count: 0, last_seen: l.created_at };
      errBuckets[fpKey].count++;
      if (l.created_at > errBuckets[fpKey].last_seen) errBuckets[fpKey].last_seen = l.created_at;
    }
  }

  const breakdown = Object.values(dayMap).map((r) => ({
    day: r.day,
    agent: r.agent,
    user_id: r.user_id,
    ok: r.ok,
    err: r.err,
    success_rate: r.ok + r.err > 0 ? Math.round((r.ok / (r.ok + r.err)) * 100) : 100,
    actions: r.actions,
    avg_duration_ms: r.durations.length ? Math.round(r.durations.reduce((s, x) => s + x, 0) / r.durations.length) : 0,
    p50_ms: percentile(r.durations, 50),
    p95_ms: percentile(r.durations, 95),
    p99_ms: percentile(r.durations, 99),
  })).sort((a, b) => b.day.localeCompare(a.day) || a.agent.localeCompare(b.agent));

  const errorsRanked = Object.values(errBuckets).sort((a, b) => b.count - a.count).slice(0, 100);

  // Volume metrics for the period (if agent specified)
  let volume: any = null;
  if (agent === 'content') {
    let q = supabase.from('content_calendar').select('user_id, platform, status, scheduled_date, published_at')
      .gte('created_at', from).lte('created_at', to);
    if (targetUserId) q = q.eq('user_id', targetUserId);
    const { data: posts } = await q.limit(5000);
    const v = { total: posts?.length || 0, published: 0, failed: 0, ig: 0, tt: 0, li: 0 };
    for (const p of (posts || []) as any[]) {
      if (p.status === 'published') {
        v.published++;
        if (p.platform === 'instagram') v.ig++;
        else if (p.platform === 'tiktok') v.tt++;
        else if (p.platform === 'linkedin') v.li++;
      } else if (p.status === 'publish_failed') v.failed++;
    }
    volume = v;
  } else if (agent === 'email') {
    let q = supabase.from('crm_activities').select('user_id, type, created_at').like('type', 'email%')
      .gte('created_at', from).lte('created_at', to);
    if (targetUserId) q = q.eq('user_id', targetUserId);
    const { data } = await q.limit(20000);
    const v = { sent: 0, opened: 0, clicked: 0, replied: 0 };
    for (const a of (data || []) as any[]) {
      if (a.type === 'email') v.sent++;
      else if (a.type === 'email_opened') v.opened++;
      else if (a.type === 'email_clicked') v.clicked++;
      else if (a.type === 'email_replied') v.replied++;
    }
    volume = v;
  } else if (agent === 'commercial') {
    let q = supabase.from('crm_prospects').select('user_id, status, created_at').gte('created_at', from).lte('created_at', to);
    if (targetUserId) q = q.eq('user_id', targetUserId);
    const { data } = await q.limit(5000);
    const v = { added: data?.length || 0, client: 0, perdu: 0 };
    for (const p of (data || []) as any[]) {
      if (p.status === 'client') v.client++;
      else if (p.status === 'perdu') v.perdu++;
    }
    volume = v;
  }

  // Shared learnings (knowledge mutualisée) for the agent / global patterns
  let learnings: any[] = [];
  if (agent) {
    const { data: k } = await supabase
      .from('agent_knowledge')
      .select('id, category, summary, content, confidence, source, created_at, business_type')
      .eq('agent', agent)
      .gte('confidence', 0.4)
      .order('confidence', { ascending: false })
      .limit(20);
    learnings = (k as any[]) || [];
  }

  const payload = {
    ok: true,
    period: { from, to },
    filters: { agent, user_id: targetUserId },
    totals: {
      runs: logs?.length || 0,
      errors: (logs || []).filter((l: any) => l.status === 'error' || l.status === 'failed').length,
      unique_errors: errorsRanked.length,
    },
    volume,
    daily_breakdown: breakdown,
    top_errors: errorsRanked,
    learnings,
  };

  if (format === 'csv') {
    const header = ['day', 'agent', 'user_id', 'ok', 'err', 'success_rate', 'avg_ms', 'p50_ms', 'p95_ms', 'p99_ms'];
    let csv = header.join(',') + '\n';
    for (const r of breakdown) {
      csv += [r.day, r.agent, r.user_id, r.ok, r.err, r.success_rate, r.avg_duration_ms, r.p50_ms, r.p95_ms, r.p99_ms].map(csvCell).join(',') + '\n';
    }
    csv += '\nTop errors\nfingerprint,agent,user_id,action,count,sample\n';
    for (const e of errorsRanked) {
      csv += [e.fp, e.agent, e.user_id || '', e.action, e.count, e.sample].map(csvCell).join(',') + '\n';
    }
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="keiroai-report-${agent || 'all'}-${(targetUserId || 'all').substring(0, 8)}-${from.substring(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json(payload);
}
