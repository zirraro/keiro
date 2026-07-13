/**
 * Cost-margin audit : par client × plan vs revenu attendu.
 * Estime le coût mensuel par client à partir d'agent_logs (runs)
 * + content_calendar (publi qui consomment Seedream/Seedance)
 * + crm_activities (emails Brevo) et le compare au revenu plan.
 *
 * Founder rule 2026-06-09 : maintenir marge ~80%.
 * Affiche red flag si margin < 70% sur un client.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Plan revenue (EUR/mois) — depuis lib/credits/constants.ts pricing
const PLAN_REVENUE: Record<string, number> = {
  free: 0,
  createur: 49,
  pro: 99,
  fondateurs: 79,    // early bird locked
  business: 139,
  elite: 299,        // legacy
  agence: 499,
  admin: 0,          // internal
};

// Cost-per-action heuristics (EUR)
// Calibrated on May 2026 spend : 213€ total / ~2000 runs = ~0.10€/run weighted
const COST_PER = {
  claude_call_sonnet_avg: 0.012,   // ~3k in + 800 out tokens average
  claude_call_haiku_avg: 0.0015,   // ~3k in + 800 out tokens (8x cheaper)
  gemini_call_avg: 0.001,          // free tier + paid mix
  seedream_image: 0.04,            // 1024x1024 ByteDance
  seedance_reel: 0.30,             // 5-8s video
  places_call: 0.0035,             // contact + atmosphere tier
  email_send: 0.0003,              // Brevo Lite
  storage_per_post: 0.001,         // Supabase storage prorata
  ovh_share: 0.40,                 // 8€ / ~20 clients = 0.40€/client
};

interface ClientCost {
  user_id: string;
  email: string;
  plan: string;
  revenue: number;
  cost: number;
  margin_pct: number;
  margin_status: 'green' | 'amber' | 'red';
  breakdown: Record<string, { count: number; cost: number }>;
  active_since_days: number;
}

export async function GET(_req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // Load clients with plan
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, subscription_plan, plan_started_at, created_at')
    .not('subscription_plan', 'is', null)
    .limit(500);

  // Aggregate per-user counts
  const { data: logs } = await supabase
    .from('agent_logs')
    .select('user_id, agent, action, created_at')
    .gte('created_at', since30d)
    .limit(50000);

  const runsByUser: Record<string, { sonnet_agents: number; haiku_agents: number; gemini_agents: number; total: number }> = {};
  for (const l of (logs || []) as any[]) {
    const uid = l.user_id;
    if (!uid) continue;
    if (!runsByUser[uid]) runsByUser[uid] = { sonnet_agents: 0, haiku_agents: 0, gemini_agents: 0, total: 0 };
    runsByUser[uid].total++;
    // Heuristic per-agent model routing (matches llm-router.ts)
    if (['hugo', 'jade', 'ami', 'noah', 'ceo', 'email', 'dm_instagram', 'reviews', 'marketing'].includes(l.agent)) {
      runsByUser[uid].sonnet_agents++;
    } else if (['clara', 'onboarding', 'retention', 'commercial', 'leo'].includes(l.agent)) {
      runsByUser[uid].gemini_agents++;
    } else if (['instagram_comments', 'tiktok_comments'].includes(l.agent)) {
      runsByUser[uid].haiku_agents++;
    } else {
      runsByUser[uid].gemini_agents++; // default
    }
  }

  // Publi counts (Seedream/Seedance cost)
  const { data: posts } = await supabase
    .from('content_calendar')
    .select('user_id, format')
    .eq('status', 'published')
    .gte('published_at', since30d);
  const postsByUser: Record<string, { images: number; videos: number }> = {};
  for (const p of (posts || []) as any[]) {
    const uid = p.user_id;
    if (!uid) continue;
    if (!postsByUser[uid]) postsByUser[uid] = { images: 0, videos: 0 };
    if (p.format === 'video' || p.format === 'reel') postsByUser[uid].videos++;
    else postsByUser[uid].images++;
  }

  // Emails sent
  const { data: emails } = await supabase
    .from('crm_activities')
    .select('user_id, type')
    .eq('type', 'email')
    .gte('created_at', since30d);
  const emailsByUser: Record<string, number> = {};
  for (const e of (emails || []) as any[]) {
    if (e.user_id) emailsByUser[e.user_id] = (emailsByUser[e.user_id] || 0) + 1;
  }

  // Places spend per user (from places_spend_daily if available)
  const { data: places } = await supabase
    .from('places_spend_daily')
    .select('user_id, details_calls, day')
    .gte('day', since30d.split('T')[0]);
  const placesByUser: Record<string, number> = {};
  for (const p of (places || []) as any[]) {
    if (p.user_id) placesByUser[p.user_id] = (placesByUser[p.user_id] || 0) + (p.details_calls || 0);
  }

  const rows: ClientCost[] = (clients || []).map((c: any) => {
    const runs = runsByUser[c.id] || { sonnet_agents: 0, haiku_agents: 0, gemini_agents: 0, total: 0 };
    const publi = postsByUser[c.id] || { images: 0, videos: 0 };
    const emailCount = emailsByUser[c.id] || 0;
    const placesCount = placesByUser[c.id] || 0;

    // Cost computation
    // Note : prompt caching réduit Claude de ~50% sur les agents répétitifs
    // (Hugo/Jade/Lena envoient le même system prompt 100×). On applique
    // un multiplier 0.55 sur les sonnet calls pour refléter ce gain.
    const sonnetCost = runs.sonnet_agents * COST_PER.claude_call_sonnet_avg * 0.55;
    const haikuCost = runs.haiku_agents * COST_PER.claude_call_haiku_avg;
    const geminiCost = runs.gemini_agents * COST_PER.gemini_call_avg;
    const imageCost = publi.images * COST_PER.seedream_image;
    const videoCost = publi.videos * COST_PER.seedance_reel;
    const placesCost = placesCount * COST_PER.places_call;
    const emailCost = emailCount * COST_PER.email_send;
    const infraCost = COST_PER.ovh_share;
    const totalCost = sonnetCost + haikuCost + geminiCost + imageCost + videoCost + placesCost + emailCost + infraCost;

    const revenue = PLAN_REVENUE[c.subscription_plan] || 0;
    const marginPct = revenue > 0 ? Math.round(((revenue - totalCost) / revenue) * 100) : 0;
    const marginStatus: 'green' | 'amber' | 'red' =
      revenue === 0 ? 'red' :
      marginPct >= 80 ? 'green' :
      marginPct >= 70 ? 'amber' : 'red';

    const startDate = c.plan_started_at || c.created_at;
    const activeSinceDays = startDate ? Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) : 0;

    return {
      user_id: c.id,
      email: c.email,
      plan: c.subscription_plan,
      revenue,
      cost: Math.round(totalCost * 100) / 100,
      margin_pct: marginPct,
      margin_status: marginStatus,
      breakdown: {
        sonnet_runs: { count: runs.sonnet_agents, cost: Math.round(sonnetCost * 100) / 100 },
        haiku_runs: { count: runs.haiku_agents, cost: Math.round(haikuCost * 100) / 100 },
        gemini_runs: { count: runs.gemini_agents, cost: Math.round(geminiCost * 100) / 100 },
        images: { count: publi.images, cost: Math.round(imageCost * 100) / 100 },
        videos: { count: publi.videos, cost: Math.round(videoCost * 100) / 100 },
        places: { count: placesCount, cost: Math.round(placesCost * 100) / 100 },
        emails: { count: emailCount, cost: Math.round(emailCost * 100) / 100 },
      },
      active_since_days: activeSinceDays,
    };
  });

  // Aggregate per-plan
  type PlanAgg = { plan: string; clients: number; revenue: number; cost: number; margin_pct: number };
  const byPlan: Record<string, PlanAgg> = {};
  for (const r of rows) {
    if (!byPlan[r.plan]) byPlan[r.plan] = { plan: r.plan, clients: 0, revenue: 0, cost: 0, margin_pct: 0 };
    byPlan[r.plan].clients++;
    byPlan[r.plan].revenue += r.revenue;
    byPlan[r.plan].cost += r.cost;
  }
  for (const p of Object.values(byPlan)) {
    p.margin_pct = p.revenue > 0 ? Math.round(((p.revenue - p.cost) / p.revenue) * 100) : 0;
  }

  // Global
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const globalMargin = totalRev > 0 ? Math.round(((totalRev - totalCost) / totalRev) * 100) : 0;

  // Sort rows : margin lowest first (les rouges remontent)
  rows.sort((a, b) => {
    if (a.margin_status !== b.margin_status) {
      const o = { red: 0, amber: 1, green: 2 };
      return o[a.margin_status] - o[b.margin_status];
    }
    return a.margin_pct - b.margin_pct;
  });

  return NextResponse.json({
    ok: true,
    window: '30d',
    global: {
      total_clients: rows.length,
      total_revenue_eur: Math.round(totalRev * 100) / 100,
      total_cost_eur: Math.round(totalCost * 100) / 100,
      margin_pct: globalMargin,
      margin_status: globalMargin >= 80 ? 'green' : globalMargin >= 70 ? 'amber' : 'red',
    },
    by_plan: Object.values(byPlan).map(p => ({
      ...p,
      revenue: Math.round(p.revenue * 100) / 100,
      cost: Math.round(p.cost * 100) / 100,
    })).sort((a, b) => b.clients - a.clients),
    clients: rows,
  });
}
