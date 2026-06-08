import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const STEP_GAP_DAYS: Record<number, number> = { 1: 2, 2: 5, 3: 3, 4: 3 };
const MIN_DAYS_BETWEEN = 3;

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(_req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const supabase = sb();
  const now = new Date();

  const { data: prospects } = await supabase
    .from('crm_prospects')
    .select('id, email, company, first_name, type, email_sequence_step, email_sequence_status, last_email_sent_at, temperature, status, score')
    .eq('user_id', user.id)
    .not('email', 'is', null)
    .limit(2000);

  // Also fetch full CRM count so the queue card can show how many
  // prospects don't have email yet (vs ones eligible for Hugo).
  const { count: totalCrmCount } = await supabase
    .from('crm_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  const prospectsWithoutEmail = Math.max(0, (totalCrmCount || 0) - (prospects?.length || 0));

  const todayStr = ymd(now);
  const byDay: Record<string, { step1: number; followup: number; total: number }> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    byDay[ymd(d)] = { step1: 0, followup: 0, total: 0 };
  }

  // Read settings early so we can respect max_per_day when spreading
  // first-sends across the upcoming week (previously all step=0
  // prospects were dumped on today's bar, making the chart look broken
  // and the founder think the queue was empty).
  const { data: settingsRowEarly } = await supabase
    .from('agent_settings')
    .select('settings')
    .eq('user_id', user.id)
    .eq('agent_id', 'email')
    .maybeSingle();
  const _settings: any = settingsRowEarly?.settings || {};
  const maxPerDay = Math.max(5, Number(_settings.max_per_day) || 50);

  let blockedDead = 0;
  let blockedCompleted = 0;
  let blockedBounced = 0;
  let blockedDeadByStatus = 0;
  let blockedDeadByTemp = 0;
  let blockedNoEmailValid = 0;

  // Separate eligibles into "needs first send" (step=0) and "follow-up"
  // so we can fan first sends across the week respecting max_per_day.
  const firstSendBucket: any[] = [];
  const followUpBucket: { p: any; nextSend: Date }[] = [];

  for (const p of prospects || []) {
    if (p.temperature === 'dead') { blockedDead++; blockedDeadByTemp++; continue; }
    if (['client', 'perdu', 'sprint', 'lost'].includes(p.status || '')) { blockedDead++; blockedDeadByStatus++; continue; }
    const seq = p.email_sequence_status;
    if (seq === 'completed' || seq === 'warm_sent') { blockedCompleted++; continue; }
    if (seq === 'bounced' || seq === 'email_invalid' || seq === 'stopped' || seq === 'paused') { blockedBounced++; continue; }

    const step = p.email_sequence_step ?? 0;
    const lastSent = p.last_email_sent_at ? new Date(p.last_email_sent_at) : null;

    if (step >= 5) continue;

    if (step === 0) {
      firstSendBucket.push(p);
      continue;
    }

    let nextSend: Date;
    if (!lastSent) {
      nextSend = new Date(now);
    } else {
      const gap = STEP_GAP_DAYS[step] ?? MIN_DAYS_BETWEEN;
      nextSend = new Date(lastSent.getTime() + gap * 86400000);
      if (nextSend.getTime() < now.getTime()) nextSend = new Date(now);
    }
    followUpBucket.push({ p, nextSend });
  }

  // Place follow-ups on their target day first (they have a fixed
  // sequence cadence), then fill remaining daily capacity with
  // first-sends in priority/score order.
  for (const { p, nextSend } of followUpBucket) {
    const key = ymd(nextSend);
    if (byDay[key]) {
      byDay[key].total++;
      byDay[key].followup++;
    }
  }

  // Sort first-sends by score descending so the best prospects go first.
  firstSendBucket.sort((a, b) => (b.score || 0) - (a.score || 0));
  let dayCursor = 0;
  const dayKeys = Object.keys(byDay).sort();
  for (const p of firstSendBucket) {
    while (dayCursor < dayKeys.length && byDay[dayKeys[dayCursor]].total >= maxPerDay) {
      dayCursor++;
    }
    if (dayCursor >= dayKeys.length) break; // queue overflow — will be picked up next week
    const key = dayKeys[dayCursor];
    byDay[key].total++;
    byDay[key].step1++;
  }

  const since24h = new Date(now.getTime() - 86400000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 86400000).toISOString();
  const { data: recentLogs } = await supabase
    .from('agent_logs')
    .select('action, status, data, created_at')
    .eq('agent', 'email')
    .eq('user_id', user.id)
    .gte('created_at', since7d)
    .order('created_at', { ascending: false })
    .limit(300);

  const sent24h = (recentLogs || []).filter((l: any) =>
    (l.action === 'email_sent' || l.action === 'reply_sent') && l.created_at >= since24h
  ).length;
  const sent7d = (recentLogs || []).filter((l: any) =>
    l.action === 'email_sent' || l.action === 'reply_sent'
  ).length;

  // Sent breakdown by day (past 7 days) — for the "real recent activity"
  // chart so the founder can see what actually went out.
  const sentByPastDay: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    sentByPastDay[ymd(d)] = 0;
  }
  for (const l of recentLogs || []) {
    if (l.action !== 'email_sent' && l.action !== 'reply_sent') continue;
    const key = ymd(new Date(l.created_at));
    if (key in sentByPastDay) sentByPastDay[key]++;
  }

  const since48h = new Date(now.getTime() - 2 * 86400000).toISOString();
  const { count: inboundCount } = await supabase
    .from('crm_activities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('type', 'email_reply')
    .gte('created_at', since48h);

  const { count: pendingReplies } = await supabase
    .from('crm_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'repondu_recent');

  return NextResponse.json({
    ok: true,
    today: todayStr,
    by_day: byDay,
    sent_past_7d: sentByPastDay,
    recent: {
      sent_24h: sent24h,
      sent_7d: sent7d,
      inbound_48h: inboundCount || 0,
      pending_replies: pendingReplies || 0,
    },
    settings: {
      send_hour_1: _settings.send_hour_1 || '09:00',
      send_hour_2: _settings.send_hour_2 || '14:00',
      max_per_day: _settings.max_per_day || 50,
      auto_relance: _settings.auto_relance !== false,
      relance_delay: _settings.relance_delay || 3,
      max_steps: _settings.max_steps || 3,
    },
    queue: {
      eligible: (prospects || []).length - blockedDead - blockedCompleted - blockedBounced - blockedNoEmailValid,
      first_sends: firstSendBucket.length,
      follow_ups: followUpBucket.length,
      blocked_dead: blockedDead,
      blocked_dead_by_status: blockedDeadByStatus,
      blocked_dead_by_temp: blockedDeadByTemp,
      blocked_completed: blockedCompleted,
      blocked_bounced: blockedBounced,
      total: (prospects || []).length,
      total_crm: totalCrmCount || 0,
      without_email: prospectsWithoutEmail,
    },
    recent_logs: (recentLogs || []).slice(0, 10).map((l: any) => ({
      action: l.action,
      status: l.status,
      created_at: l.created_at,
      preview: l.data?.subject || l.data?.message_preview || l.data?.recipient || '',
    })),
  });
}
