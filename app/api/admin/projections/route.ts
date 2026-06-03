import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function assertAdmin() {
  const { user } = await getAuthUser();
  if (!user) return null;
  const sb = admin();
  const { data: p } = await sb.from('profiles').select('is_admin').eq('id', user.id).single();
  return p?.is_admin ? user.id : null;
}

/**
 * GET /api/admin/projections
 *
 * Returns the anchor numbers the /admin/projections calculator needs:
 *   - paying clients today, split by plan
 *   - last-month real COGS per plan (uploaded bills + live log estimates)
 *   - inferred LLM cost per active client over the last 30 days
 *
 * The UI runs the actual EBITDA / dividend math client-side using these
 * anchors + user-tunable sliders (client count, mix, ads, churn, etc.).
 */
export async function GET() {
  const userId = await assertAdmin();
  if (!userId) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const sb = admin();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Paying clients per plan
  const { data: clients } = await sb
    .from('profiles')
    .select('id, subscription_plan')
    .limit(2000);
  const byPlan: Record<string, number> = {};
  for (const c of (clients || []) as any[]) {
    const plan = (c.subscription_plan || 'free').toLowerCase();
    byPlan[plan] = (byPlan[plan] || 0) + 1;
  }

  // Latest uploaded bills for the current month
  const { data: uploads } = await sb
    .from('external_cost_uploads')
    .select('service, total_cost_eur, billing_period')
    .eq('billing_period', monthLabel);
  const uploadByService: Record<string, number> = {};
  for (const u of (uploads || []) as any[]) {
    uploadByService[u.service] = (uploadByService[u.service] || 0) + Number(u.total_cost_eur || 0);
  }

  // Live LLM estimate from logs (current month)
  const { data: logs } = await sb
    .from('agent_logs')
    .select('agent')
    .gte('created_at', monthStart)
    .limit(50000);
  const agentCount: Record<string, number> = {};
  for (const l of (logs || []) as any[]) {
    const key = l.agent || 'unknown';
    agentCount[key] = (agentCount[key] || 0) + 1;
  }

  // Per-call cost coefficients (€ — rough averages calibrated against
  // May 2026 Anthropic + Gemini bills).
  const COST_PER_CALL: Record<string, number> = {
    content: 0.015, dm_instagram: 0.005, dm_instagram_webhook: 0.005,
    email: 0.005, ceo: 0.02, seo: 0.05, gmaps: 0.003,
    marketing: 0.015, instagram_comments: 0.003, tiktok_comments: 0.003,
    chatbot: 0.002, retention: 0.003, commercial: 0.005,
    onboarding: 0.005, ads: 0.005, whatsapp: 0.001,
  };
  let liveLlmCost = 0;
  for (const [agent, count] of Object.entries(agentCount)) {
    liveLlmCost += (COST_PER_CALL[agent] || 0.003) * count;
  }

  const payingClients = (byPlan.createur || 0) + (byPlan.pro || 0) + (byPlan.business || 0) + (byPlan.fondateurs || 0);
  const llmPerActiveClient = payingClients > 0 ? liveLlmCost / payingClients : 0;

  // Image / video generation count (proxy for visual cost)
  const { count: imgCount } = await sb
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', monthStart)
    .not('visual_url', 'is', null);
  const visualCost = (imgCount || 0) * 0.03;
  const visualPerActiveClient = payingClients > 0 ? visualCost / payingClients : 0;

  return NextResponse.json({
    ok: true,
    period: monthLabel,
    clients: {
      createur: byPlan.createur || 0,
      pro: byPlan.pro || 0,
      business: byPlan.business || 0,
      fondateurs: byPlan.fondateurs || 0,
      free: byPlan.free || 0,
      total_paying: payingClients,
    },
    real_costs_eur: {
      uploads_by_service: uploadByService,
      uploads_total: Object.values(uploadByService).reduce((a, b) => a + b, 0),
      live_llm_estimate: Number(liveLlmCost.toFixed(2)),
      visual_gen_estimate: Number(visualCost.toFixed(2)),
    },
    per_client_anchors_eur: {
      llm_per_active: Number(llmPerActiveClient.toFixed(2)),
      visual_per_active: Number(visualPerActiveClient.toFixed(2)),
    },
  });
}
