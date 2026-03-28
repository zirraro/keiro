import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const AGENTS = ['email', 'commercial', 'dm_instagram', 'seo', 'content', 'onboarding', 'retention', 'marketing', 'chatbot', 'whatsapp', 'gmaps', 'comptable', 'ads', 'rh', 'ceo'];

/**
 * GET /api/admin/agent-groups
 * Aggregated stats per agent type across ALL clients.
 * Admin only.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const groups: Array<{
    agent: string;
    runs_24h: number;
    errors_24h: number;
    error_rate: number;
    runs_7d: number;
    errors_7d: number;
    top_actions: string[];
    recent_errors: Array<{ action: string; error: string; created_at: string }>;
  }> = [];

  for (const agent of AGENTS) {
    const [
      { count: runs24 },
      { count: errors24 },
      { count: runs7d },
      { count: errors7d },
    ] = await Promise.all([
      supabase.from('agent_logs').select('id', { count: 'exact', head: true }).eq('agent', agent).gte('created_at', since24h),
      supabase.from('agent_logs').select('id', { count: 'exact', head: true }).eq('agent', agent).eq('status', 'error').gte('created_at', since24h),
      supabase.from('agent_logs').select('id', { count: 'exact', head: true }).eq('agent', agent).gte('created_at', since7d),
      supabase.from('agent_logs').select('id', { count: 'exact', head: true }).eq('agent', agent).eq('status', 'error').gte('created_at', since7d),
    ]);

    // Top actions
    const { data: actionLogs } = await supabase
      .from('agent_logs')
      .select('action')
      .eq('agent', agent)
      .gte('created_at', since24h)
      .limit(100);

    const actionCounts: Record<string, number> = {};
    for (const l of actionLogs || []) {
      if (l.action) actionCounts[l.action] = (actionCounts[l.action] || 0) + 1;
    }
    const topActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, c]) => `${a} (${c})`);

    // Recent errors
    const { data: recentErrors } = await supabase
      .from('agent_logs')
      .select('action, data, created_at')
      .eq('agent', agent)
      .eq('status', 'error')
      .gte('created_at', since24h)
      .order('created_at', { ascending: false })
      .limit(3);

    groups.push({
      agent,
      runs_24h: runs24 || 0,
      errors_24h: errors24 || 0,
      error_rate: (runs24 || 0) > 0 ? Math.round(((errors24 || 0) / (runs24 || 0)) * 100) : 0,
      runs_7d: runs7d || 0,
      errors_7d: errors7d || 0,
      top_actions: topActions,
      recent_errors: (recentErrors || []).map(e => ({
        action: e.action || '?',
        error: (e.data as any)?.error?.substring(0, 150) || JSON.stringify(e.data)?.substring(0, 150) || '?',
        created_at: e.created_at,
      })),
    });
  }

  // Total costs (credits consumed)
  const { count: totalGenerations } = await supabase.from('credit_transactions').select('id', { count: 'exact', head: true }).gte('created_at', since7d);

  // Total active clients
  const { count: activeClients } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).not('subscription_plan', 'in', '(gratuit,free,)');

  return NextResponse.json({
    ok: true,
    groups: groups.sort((a, b) => b.runs_24h - a.runs_24h),
    totals: {
      runs_24h: groups.reduce((s, g) => s + g.runs_24h, 0),
      errors_24h: groups.reduce((s, g) => s + g.errors_24h, 0),
      active_clients: activeClients || 0,
      generations_7d: totalGenerations || 0,
    },
  });
}
