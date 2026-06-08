/**
 * Drill-down : ONE client × ONE agent — timeline détaillée + erreurs
 * récurrentes + perfs + learnings actifs.
 *
 * Founder ask 2026-06-08 : "permettre un pilotage global et detaillé
 * par client pour identifier les frailles et lenteur ce qui ne va pas
 * pour un client et ameliorer ainsi si ca arrive pour un client ca ne
 * doit pas se reproduire pour les autres clients".
 *
 * Returns:
 *   - profile : plan, paused state, connected networks
 *   - timeline : last 100 agent_logs entries (success + error)
 *   - perf : avg/p50/p95/p99 latency from log durations
 *   - errors : grouped by error fingerprint (count + last_seen)
 *   - shared_learnings : agent_knowledge rows that apply to this
 *     client's business_type and might help / be the root cause
 *   - directives : typed directives this client has given
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function errorFingerprint(action: string, raw: string): string {
  // Normalise an error message → a stable key so we can group
  // recurring incidents (e.g. all "timeout 300s" or all "401 token
  // expired" land in the same bucket).
  let s = (raw || '').toLowerCase();
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>');
  s = s.replace(/\b\d{6,}\b/g, '<n>');
  s = s.replace(/https?:\/\/\S+/g, '<url>');
  s = s.replace(/'[^']{0,80}'/g, "'<str>'");
  s = s.substring(0, 180);
  return `${action}::${s}`;
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ agentId: string; userId: string }> }) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { agentId, userId } = await ctx.params;
  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  // ── 1. Client profile snapshot ──
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('id, email, first_name, subscription_plan, scheduling_paused_at, scheduling_paused_reason, instagram_username, tiktok_username, linkedin_username, smtp_host, managed_email_from, managed_email_status, plan_started_at')
    .eq('id', userId)
    .maybeSingle();

  // business_type drives the shared learnings lookup
  const { data: dossier } = await supabase
    .from('business_dossiers')
    .select('business_type, company_name, city')
    .eq('user_id', userId)
    .maybeSingle();
  const businessType = (dossier as any)?.business_type || null;

  // ── 2. Recent logs for this agent × this user (30d cap, 200 rows) ──
  const { data: logs } = await supabase
    .from('agent_logs')
    .select('id, agent, action, status, data, created_at')
    .eq('agent', agentId)
    .eq('user_id', userId)
    .gte('created_at', since30d)
    .order('created_at', { ascending: false })
    .limit(200);

  // ── 3. Aggregate ──
  const errorBuckets: Record<string, { fingerprint: string; action: string; raw: string; count: number; last_seen: string; sample_data?: any }> = {};
  const durations: number[] = [];
  let okCount = 0;
  let errCount = 0;
  const actionsByDay: Record<string, { date: string; ok: number; err: number }> = {};

  for (const l of (logs || []) as any[]) {
    const isErr = l.status === 'error' || l.status === 'failed';
    if (isErr) errCount++; else okCount++;
    const day = (l.created_at || '').substring(0, 10);
    if (!actionsByDay[day]) actionsByDay[day] = { date: day, ok: 0, err: 0 };
    if (isErr) actionsByDay[day].err++; else actionsByDay[day].ok++;

    if (isErr) {
      const raw = (l.data?.error || l.data?.message || l.data?.reason || l.action || '').toString();
      const fp = errorFingerprint(l.action, raw);
      if (!errorBuckets[fp]) {
        errorBuckets[fp] = { fingerprint: fp, action: l.action, raw: raw.substring(0, 200), count: 0, last_seen: l.created_at, sample_data: l.data };
      }
      errorBuckets[fp].count++;
      if (l.created_at > errorBuckets[fp].last_seen) errorBuckets[fp].last_seen = l.created_at;
    }

    const dur = Number(l.data?.duration_ms || l.data?.elapsed_ms || 0);
    if (dur > 0 && dur < 1200_000) durations.push(dur);
  }

  const errors = Object.values(errorBuckets).sort((a, b) => b.count - a.count);

  // ── 4. Shared learnings that apply to this client (business_type match) ──
  // When an issue was identified and resolved for another client of the
  // same business_type, the fix lives here. Surfacing it tells the
  // admin (and the agent) what's already known about this profile.
  let sharedLearnings: any[] = [];
  if (businessType) {
    const { data: knowledge } = await supabase
      .from('agent_knowledge')
      .select('id, category, summary, content, confidence, source, created_at')
      .eq('agent', agentId)
      .eq('business_type', businessType)
      .order('confidence', { ascending: false })
      .limit(10);
    sharedLearnings = (knowledge as any[]) || [];
  }

  // Also pull any GLOBAL pattern in agent_knowledge categorised as
  // 'error_pattern' for this agent (these are produced by the daily
  // pattern-detection cron — same fix applies to every client).
  const { data: globalPatterns } = await supabase
    .from('agent_knowledge')
    .select('id, summary, content, confidence, source, created_at')
    .eq('agent', agentId)
    .eq('category', 'error_pattern')
    .order('confidence', { ascending: false })
    .limit(5);

  // ── 5. Typed directives this client has given to this agent ──
  const { data: directives } = await supabase
    .from('client_directives_typed')
    .select('type, value, raw_text, confidence, source, updated_at')
    .eq('user_id', userId)
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: false });

  // ── 6. Volume specific to this agent for THIS user ──
  let volume: Record<string, any> = {};
  if (agentId === 'content') {
    const { data: posts } = await supabase
      .from('content_calendar')
      .select('platform, status')
      .eq('user_id', userId)
      .gte('created_at', since7d);
    const v = { ig: 0, tt: 0, li: 0, failed: 0, total: posts?.length || 0 };
    for (const p of (posts || []) as any[]) {
      if (p.status === 'published') {
        if (p.platform === 'instagram') v.ig++;
        else if (p.platform === 'tiktok') v.tt++;
        else if (p.platform === 'linkedin') v.li++;
      } else if (p.status === 'publish_failed') v.failed++;
    }
    volume = v;
  } else if (agentId === 'email') {
    const { data: acts } = await supabase
      .from('crm_activities')
      .select('type')
      .eq('user_id', userId)
      .like('type', 'email%')
      .gte('created_at', since7d);
    const v = { sent: 0, opened: 0, clicked: 0, replied: 0 };
    for (const a of (acts || []) as any[]) {
      if (a.type === 'email') v.sent++;
      else if (a.type === 'email_opened') v.opened++;
      else if (a.type === 'email_clicked') v.clicked++;
      else if (a.type === 'email_replied') v.replied++;
    }
    volume = v;
  }

  return NextResponse.json({
    ok: true,
    agent_id: agentId,
    user_id: userId,
    client: {
      ...clientProfile,
      business_type: businessType,
      company_name: (dossier as any)?.company_name || null,
      city: (dossier as any)?.city || null,
    },
    window: '30d',
    summary: {
      ok_runs: okCount,
      err_runs: errCount,
      success_rate: (okCount + errCount > 0) ? Math.round((okCount / (okCount + errCount)) * 100) : 100,
      unique_errors: errors.length,
      avg_duration_ms: durations.length ? Math.round(durations.reduce((s, x) => s + x, 0) / durations.length) : 0,
      p50_duration_ms: percentile(durations, 50),
      p95_duration_ms: percentile(durations, 95),
      p99_duration_ms: percentile(durations, 99),
    },
    volume_7d: volume,
    errors_grouped: errors.slice(0, 20),
    timeline: (logs || []).slice(0, 100).map((l: any) => ({
      id: l.id,
      action: l.action,
      status: l.status,
      created_at: l.created_at,
      duration_ms: Number(l.data?.duration_ms || l.data?.elapsed_ms || 0) || null,
      preview: (l.data?.message || l.data?.error || l.data?.subject || l.data?.decision || '').toString().substring(0, 160),
    })),
    activity_by_day: Object.values(actionsByDay).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
    shared_learnings: sharedLearnings,
    global_error_patterns: globalPatterns || [],
    directives: directives || [],
  });
}
