/**
 * Admin live costs endpoint — agrégation temps réel des coûts API
 * pour pilotage marge.
 *
 * GET /api/admin/costs/live?period=mtd|7d|24h
 *
 * Réponse :
 *   {
 *     period, period_start,
 *     totals: { eur, by_provider: {...}, by_agent: {...} },
 *     daily: [{ date, eur, by_provider }, ...],
 *     top_clients: [{ user_id, email, eur }, ...],
 *     projections: { end_of_month_eur, vs_revenue_pct }
 *   }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });

  const url = new URL(req.url);
  const period = (url.searchParams.get('period') || 'mtd') as 'mtd' | '7d' | '24h';

  // Compute period start
  let periodStart: Date;
  const now = new Date();
  if (period === '24h') {
    periodStart = new Date(now.getTime() - 24 * 3600 * 1000);
  } else if (period === '7d') {
    periodStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  } else {
    periodStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
  }

  // Fetch all events in period (capped at 50k for safety)
  const { data: events } = await supabase
    .from('api_cost_events')
    .select('provider, kind, cost_eur, user_id, agent, created_at')
    .gte('created_at', periodStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(50000);

  const rows = events || [];

  // Aggregate totals
  let totalEur = 0;
  const byProvider: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  const byDay: Record<string, { eur: number; by_provider: Record<string, number> }> = {};

  for (const r of rows as any[]) {
    const cost = parseFloat(r.cost_eur) || 0;
    totalEur += cost;
    byProvider[r.provider] = (byProvider[r.provider] || 0) + cost;
    if (r.agent) byAgent[r.agent] = (byAgent[r.agent] || 0) + cost;
    if (r.user_id) byUser[r.user_id] = (byUser[r.user_id] || 0) + cost;
    const day = r.created_at.substring(0, 10);
    if (!byDay[day]) byDay[day] = { eur: 0, by_provider: {} };
    byDay[day].eur += cost;
    byDay[day].by_provider[r.provider] = (byDay[day].by_provider[r.provider] || 0) + cost;
  }

  // Top 10 clients
  const topUserIds = Object.entries(byUser)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([uid]) => uid);

  let topClients: Array<{ user_id: string; email: string | null; eur: number }> = [];
  if (topUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', topUserIds);
    const emailMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.email]));
    topClients = topUserIds.map(uid => ({
      user_id: uid,
      email: emailMap[uid] || null,
      eur: Math.round(byUser[uid] * 100) / 100,
    }));
  }

  // Sorted daily series
  const daily = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, eur: Math.round(d.eur * 100) / 100, by_provider: d.by_provider }));

  // Projection MTD → end of month (linéaire)
  let projection: { end_of_month_eur: number; days_elapsed: number; days_in_month: number; daily_avg: number } | null = null;
  if (period === 'mtd' && rows.length > 0) {
    const daysElapsed = Math.max(1, Math.ceil((now.getTime() - periodStart.getTime()) / (24 * 3600 * 1000)));
    const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate();
    const dailyAvg = totalEur / daysElapsed;
    projection = {
      end_of_month_eur: Math.round(dailyAvg * daysInMonth * 100) / 100,
      days_elapsed: daysElapsed,
      days_in_month: daysInMonth,
      daily_avg: Math.round(dailyAvg * 100) / 100,
    };
  }

  // Compute monthly revenue estimate (very rough — needs Stripe data)
  // For now, sum of (active client × plan revenue)
  const { data: clients } = await supabase
    .from('profiles')
    .select('subscription_plan')
    .neq('subscription_plan', 'free')
    .neq('subscription_plan', null);
  const PLAN_REV: Record<string, number> = {
    createur: 49, pro: 99, fondateurs: 79, business: 199, elite: 299, agence: 499, admin: 0,
  };
  let monthlyRevenue = 0;
  for (const c of (clients || []) as any[]) {
    monthlyRevenue += PLAN_REV[c.subscription_plan] || 0;
  }

  const marginPct = monthlyRevenue > 0 && projection
    ? Math.round(((monthlyRevenue - projection.end_of_month_eur) / monthlyRevenue) * 100)
    : null;

  return NextResponse.json({
    ok: true,
    period,
    period_start: periodStart.toISOString(),
    totals: {
      eur: Math.round(totalEur * 100) / 100,
      by_provider: Object.fromEntries(
        Object.entries(byProvider).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
      by_agent: Object.fromEntries(
        Object.entries(byAgent).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
      events_count: rows.length,
    },
    daily,
    top_clients: topClients,
    projection,
    monthly_revenue_estimate: monthlyRevenue,
    margin_pct: marginPct,
  });
}
