import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/cron/compute-best-brief-day
 *
 * Weekly analysis (Monday 03:00 UTC) that picks the best weekday to
 * deliver Noah's weekly CEO brief to each client based on which day
 * has the highest open rate over the last 8 weeks.
 *
 * Source signal: Brevo webhook events with tag 'noah_brief' end up in
 * agent_logs via the same webhook route prospects use. We don't have a
 * dedicated table for it yet — instead we reconstruct day-of-week open
 * counts from the webhook event logs.
 *
 * Fallback: if a client has < 4 opens in the last 8 weeks, we keep
 * their preferred_day = null (Sunday default). 4 is the minimum signal
 * count that beats noise for a 7-category histogram.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 8-week window — short enough to adapt to behaviour changes, long
  // enough to average out one-off weeks (vacation, holidays).
  const sinceISO = new Date(Date.now() - 8 * 7 * 86400000).toISOString();

  // Pull every brief-opened event. We tag Noah's emails with
  // 'noah_brief' and include X-Mailin-custom.uid so the webhook can
  // attribute opens to a user_id without relying on email lookup.
  const { data: openEvents } = await sb
    .from('agent_logs')
    .select('data, created_at')
    .eq('agent', 'email')
    .eq('action', 'webhook_opened')
    .gte('created_at', sinceISO)
    .limit(50000);

  if (!openEvents || openEvents.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, updates: 0 });
  }

  // Group opens per user_id per day-of-week.
  const opensPerUser: Record<string, number[]> = {}; // userId → [sun,mon,tue,wed,thu,fri,sat]
  for (const ev of openEvents as any[]) {
    const uid = ev.data?.user_id || ev.data?.uid || null;
    const kind = ev.data?.kind || null;
    if (!uid || kind !== 'noah_brief') continue;
    const dow = new Date(ev.created_at).getUTCDay();
    if (!opensPerUser[uid]) opensPerUser[uid] = [0, 0, 0, 0, 0, 0, 0];
    opensPerUser[uid][dow]++;
  }

  let updates = 0;
  for (const [uid, counts] of Object.entries(opensPerUser)) {
    const totalOpens = counts.reduce((a, b) => a + b, 0);
    if (totalOpens < 4) continue; // insufficient signal, keep default

    // Best day = highest-count day. Tie-break: pick Sunday when tied
    // (the default) so we don't thrash every time signal is weak.
    let bestDay = 0;
    let bestCount = counts[0];
    for (let d = 1; d < 7; d++) {
      if (counts[d] > bestCount) { bestCount = counts[d]; bestDay = d; }
    }

    // Only update if the chosen day has a clear edge — avoid flipping
    // on noise. Need at least 1.3× second-best count.
    const sorted = [...counts].sort((a, b) => b - a);
    if (sorted[0] < sorted[1] * 1.3) continue;

    await sb
      .from('client_brief_preferences')
      .upsert(
        { user_id: uid, preferred_day: bestDay, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    updates++;
  }

  return NextResponse.json({
    ok: true,
    analyzed_users: Object.keys(opensPerUser).length,
    updates,
    window_weeks: 8,
  });
}
