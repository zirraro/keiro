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

  const todayStr = ymd(now);
  const byDay: Record<string, { step1: number; followup: number; total: number }> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    byDay[ymd(d)] = { step1: 0, followup: 0, total: 0 };
  }

  let blockedDead = 0;
  let blockedCompleted = 0;
  let blockedBounced = 0;

  for (const p of prospects || []) {
    if (p.temperature === 'dead') { blockedDead++; continue; }
    if (['client', 'perdu', 'sprint', 'lost'].includes(p.status || '')) { blockedDead++; continue; }
    const seq = p.email_sequence_status;
    if (seq === 'completed' || seq === 'warm_sent') { blockedCompleted++; continue; }
    if (seq === 'bounced' || seq === 'email_invalid' || seq === 'stopped' || seq === 'paused') { blockedBounced++; continue; }

    const step = p.email_sequence_step ?? 0;
    const lastSent = p.last_email_sent_at ? new Date(p.last_email_sent_at) : null;

    let nextSend: Date;
    if (step === 0) {
      nextSend = new Date(now);
    } else if (step >= 5) {
      continue;
    } else {
      if (!lastSent) {
        nextSend = new Date(now);
      } else {
        const gap = STEP_GAP_DAYS[step] ?? MIN_DAYS_BETWEEN;
        nextSend = new Date(lastSent.getTime() + gap * 86400000);
        if (nextSend.getTime() < now.getTime()) nextSend = new Date(now);
      }
    }

    const key = ymd(nextSend);
    if (byDay[key]) {
      byDay[key].total++;
      if (step === 0) byDay[key].step1++;
      else byDay[key].followup++;
    }
  }

  const since24h = new Date(now.getTime() - 86400000).toISOString();
  const { data: recentLogs } = await supabase
    .from('agent_logs')
    .select('action, status, data, created_at')
    .eq('agent', 'email')
    .eq('user_id', user.id)
    .gte('created_at', since24h)
    .order('created_at', { ascending: false })
    .limit(50);

  const sent24h = (recentLogs || []).filter((l: any) => l.action === 'email_sent' || l.action === 'reply_sent').length;

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

  const { data: settingsRow } = await supabase
    .from('agent_settings')
    .select('settings')
    .eq('user_id', user.id)
    .eq('agent_id', 'email')
    .maybeSingle();

  const settings = settingsRow?.settings || {};

  return NextResponse.json({
    ok: true,
    today: todayStr,
    by_day: byDay,
    recent: {
      sent_24h: sent24h,
      inbound_48h: inboundCount || 0,
      pending_replies: pendingReplies || 0,
    },
    settings: {
      send_hour_1: settings.send_hour_1 || '09:00',
      send_hour_2: settings.send_hour_2 || '14:00',
      max_per_day: settings.max_per_day || 50,
      auto_relance: settings.auto_relance !== false,
      relance_delay: settings.relance_delay || 3,
      max_steps: settings.max_steps || 3,
    },
    queue: {
      eligible: (prospects || []).length - blockedDead - blockedCompleted - blockedBounced,
      blocked_dead: blockedDead,
      blocked_completed: blockedCompleted,
      blocked_bounced: blockedBounced,
      total: (prospects || []).length,
    },
    recent_logs: (recentLogs || []).slice(0, 10).map((l: any) => ({
      action: l.action,
      status: l.status,
      created_at: l.created_at,
      preview: l.data?.subject || l.data?.message_preview || l.data?.recipient || '',
    })),
  });
}
