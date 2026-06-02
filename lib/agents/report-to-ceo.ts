/**
 * 2026-06-03 — Dedup report_to_ceo logs.
 *
 * Each agent inserts a 'report_to_ceo' row at the end of every run as a
 * status heartbeat. Over a month with multiple cron triggers per day per
 * agent per client, this produced 800+ noisy rows that polluted the
 * admin dashboard's "runs" count without representing useful work.
 *
 * Founder ask 2026-06-03: "pourquoi y'a autant de run si si peu sont
 * utiles? faut optimiser!!".
 *
 * This helper writes AT MOST one report_to_ceo per (agent, user_id, day).
 * If the day already has one, we update it in-place (latest summary wins)
 * rather than appending. agent_logs growth drops by ~75% for these heartbeats.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReportToCeoPayload {
  agent: string;
  user_id?: string | null;
  org_id?: string | null;
  status?: string;
  data?: Record<string, any>;
}

export async function logReportToCeoOnce(
  supabase: SupabaseClient,
  payload: ReportToCeoPayload,
): Promise<void> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  try {
    let q = supabase
      .from('agent_logs')
      .select('id, data')
      .eq('agent', payload.agent)
      .eq('action', 'report_to_ceo')
      .gte('created_at', todayStart);
    if (payload.user_id) q = q.eq('user_id', payload.user_id);
    const { data: existing } = await q.limit(1).maybeSingle();

    if (existing) {
      // Merge new data into the existing entry — keeps the row count down
      // while letting the latest summary win.
      const merged = { ...(existing.data || {}), ...(payload.data || {}), last_updated: now.toISOString() };
      await supabase
        .from('agent_logs')
        .update({ data: merged, status: payload.status || 'ok', created_at: now.toISOString() })
        .eq('id', existing.id);
      return;
    }
    await supabase.from('agent_logs').insert({
      agent: payload.agent,
      action: 'report_to_ceo',
      status: payload.status || 'ok',
      user_id: payload.user_id || null,
      org_id: payload.org_id || null,
      data: payload.data || {},
      created_at: now.toISOString(),
    });
  } catch { /* non-fatal */ }
}
