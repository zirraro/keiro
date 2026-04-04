import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * GET /api/admin/monitoring
 * Returns usage & cost monitoring data per client.
 * Admin only.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin requis' }, { status: 403 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // Get all clients (non-admin profiles with a plan)
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, full_name, email, company_name, subscription_plan, credits_balance, trial_ends_at, created_at')
    .eq('is_admin', false)
    .not('subscription_plan', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200);

  // Get agent_logs per user for the last 30 days (actions = cost drivers)
  const { data: logs } = await supabase
    .from('agent_logs')
    .select('user_id, agent, action, created_at')
    .gte('created_at', thirtyDaysAgo)
    .not('user_id', 'is', null)
    .limit(10000);

  // Get credit transactions (deductions)
  const { data: transactions } = await supabase
    .from('credit_transactions')
    .select('user_id, amount, feature, created_at')
    .gte('created_at', thirtyDaysAgo)
    .limit(5000);

  // Get CRM prospects per user
  const { data: prospectCounts } = await supabase
    .from('crm_prospects')
    .select('user_id')
    .not('user_id', 'is', null);

  // Get email sends per user
  const { data: emailLogs } = await supabase
    .from('agent_logs')
    .select('user_id')
    .eq('agent', 'email')
    .eq('action', 'email_sent')
    .gte('created_at', thirtyDaysAgo);

  // Get DM auto-replies per user
  const { data: dmLogs } = await supabase
    .from('agent_logs')
    .select('user_id')
    .eq('agent', 'dm_instagram')
    .eq('action', 'dm_auto_reply')
    .gte('created_at', thirtyDaysAgo);

  // Cost estimation per action type (approximate)
  const ACTION_COSTS: Record<string, number> = {
    // Image generation (Seedream)
    'daily_post_generated': 0.02,
    'generate_week': 0.14,
    // Email (Brevo free / Resend)
    'email_sent': 0.001,
    'daily_cold': 0.01,
    // DM (Gemini)
    'dm_auto_reply': 0.005,
    'webhook_dm_received': 0,
    // Content (Gemini)
    'execute_publication': 0.01,
    // Commercial (Gemini)
    'enrichment_run': 0.02,
    // SEO (Gemini)
    'blog_generated': 0.05,
    // Chat (Gemini/Sonnet)
    'chat_action_executed': 0.03,
    // Default
    '_default': 0.002,
  };

  // Aggregate per client
  const clientMap = new Map<string, any>();
  for (const c of (clients || [])) {
    clientMap.set(c.id, {
      ...c,
      actions_30d: 0,
      estimated_cost: 0,
      credits_used: 0,
      emails_sent: 0,
      dms_sent: 0,
      prospects: 0,
      agents_used: new Set<string>(),
    });
  }

  // Count actions + estimate costs
  for (const log of (logs || [])) {
    const c = clientMap.get(log.user_id);
    if (!c) continue;
    c.actions_30d++;
    c.estimated_cost += ACTION_COSTS[log.action] ?? ACTION_COSTS._default;
    c.agents_used.add(log.agent);
  }

  // Count credit usage
  for (const tx of (transactions || [])) {
    const c = clientMap.get(tx.user_id);
    if (c) c.credits_used += Math.abs(tx.amount || 0);
  }

  // Count emails
  for (const e of (emailLogs || [])) {
    const c = clientMap.get(e.user_id);
    if (c) c.emails_sent++;
  }

  // Count DMs
  for (const d of (dmLogs || [])) {
    const c = clientMap.get(d.user_id);
    if (c) c.dms_sent++;
  }

  // Count prospects
  const prospectsByUser: Record<string, number> = {};
  for (const p of (prospectCounts || [])) {
    prospectsByUser[p.user_id] = (prospectsByUser[p.user_id] || 0) + 1;
  }
  for (const [uid, count] of Object.entries(prospectsByUser)) {
    const c = clientMap.get(uid);
    if (c) c.prospects = count;
  }

  // Plan revenue
  const PLAN_REVENUE: Record<string, number> = {
    free: 0, gratuit: 0, sprint: 0,
    createur: 49, pro: 99, fondateurs: 149,
    business: 199, elite: 999, agence: 0,
  };

  // Build response
  const clientList = Array.from(clientMap.values()).map(c => ({
    id: c.id,
    name: c.full_name || c.company_name || c.email || '?',
    email: c.email,
    plan: c.subscription_plan,
    revenue: PLAN_REVENUE[c.subscription_plan] || 0,
    credits_balance: c.credits_balance || 0,
    credits_used: c.credits_used,
    actions_30d: c.actions_30d,
    estimated_cost: Math.round(c.estimated_cost * 100) / 100,
    margin: Math.round(((PLAN_REVENUE[c.subscription_plan] || 0) - c.estimated_cost) * 100) / 100,
    margin_pct: (PLAN_REVENUE[c.subscription_plan] || 0) > 0 ? Math.round(((PLAN_REVENUE[c.subscription_plan] || 0) - c.estimated_cost) / (PLAN_REVENUE[c.subscription_plan] || 1) * 100) : 0,
    emails_sent: c.emails_sent,
    dms_sent: c.dms_sent,
    prospects: c.prospects,
    agents_used: Array.from(c.agents_used),
    agents_count: c.agents_used.size,
    trial_ends: c.trial_ends_at,
    created: c.created_at,
  }));

  // Global totals
  const totals = {
    total_clients: clientList.length,
    total_revenue: clientList.reduce((s, c) => s + c.revenue, 0),
    total_cost: clientList.reduce((s, c) => s + c.estimated_cost, 0),
    total_margin: clientList.reduce((s, c) => s + c.margin, 0),
    total_actions: clientList.reduce((s, c) => s + c.actions_30d, 0),
    avg_margin_pct: clientList.length > 0 ? Math.round(clientList.reduce((s, c) => s + c.margin_pct, 0) / clientList.length) : 0,
  };

  return NextResponse.json({ ok: true, clients: clientList, totals, period: '30d' });
}
