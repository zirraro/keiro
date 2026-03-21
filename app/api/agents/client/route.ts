import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { saveLearning, saveAgentFeedback } from '@/lib/agents/learning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function verifyAuth(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return { authorized: true, isCron: true };
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return { authorized: false };
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    if (profile?.is_admin) return { authorized: true, isAdmin: true };
  } catch {}
  return { authorized: false };
}

/**
 * GET /api/agents/client
 * Returns unified client health dashboard
 */
export async function GET(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  // org_id passthrough (Phase B4 — backwards compatible)
  const orgId = request.nextUrl.searchParams.get('org_id') || null;

  const supabase = getSupabaseAdmin();

  // Get combined stats from both onboarding and retention
  const [onboardingStats, retentionStats, recentLogs] = await Promise.all([
    // Onboarding: pending queue items
    supabase.from('onboarding_queue').select('status', { count: 'exact', head: false })
      .in('status', ['pending', 'sent', 'alert_sent', 'skipped', 'failed']),
    // Retention: health levels
    supabase.from('retention_scores').select('health_level, monthly_revenue'),
    // Recent logs from both agents
    supabase.from('agent_logs').select('agent, action, status, data, created_at')
      .in('agent', ['onboarding', 'retention', 'client'])
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  // Aggregate onboarding
  const obStats: Record<string, number> = {};
  for (const item of onboardingStats.data || []) {
    obStats[item.status] = (obStats[item.status] || 0) + 1;
  }

  // Aggregate retention
  const rtLevels = { green: 0, yellow: 0, orange: 0, red: 0 };
  let mrrAtRisk = 0;
  for (const s of retentionStats.data || []) {
    rtLevels[s.health_level as keyof typeof rtLevels] = (rtLevels[s.health_level as keyof typeof rtLevels] || 0) + 1;
    if (s.health_level === 'orange' || s.health_level === 'red') {
      mrrAtRisk += Number(s.monthly_revenue || 0);
    }
  }

  return NextResponse.json({
    ok: true,
    unified_stats: {
      onboarding: obStats,
      retention: { levels: rtLevels, mrr_at_risk: mrrAtRisk },
    },
    recent_logs: recentLogs.data || [],
  });
}

/**
 * POST /api/agents/client
 * Unified client lifecycle management
 * Actions: onboarding_stats, retention_stats, health_check, full_report
 */
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const body = await request.json().catch(() => ({}));
  const orgId = body?.org_id || null;
  const action = body.action || 'full_report';

  if (action === 'full_report') {
    // Call both internal endpoints and merge results
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const headers: Record<string, string> = {};
    if (process.env.CRON_SECRET) {
      headers['Authorization'] = `Bearer ${process.env.CRON_SECRET}`;
    }

    const [onbRes, retRes] = await Promise.all([
      fetch(`${baseUrl}/api/agents/onboarding`, { headers }).then(r => r.json()).catch(() => ({ ok: false })),
      fetch(`${baseUrl}/api/agents/retention`, { headers }).then(r => r.json()).catch(() => ({ ok: false })),
    ]);

    const report = {
      onboarding: onbRes,
      retention: retRes,
      timestamp: new Date().toISOString(),
    };

    // Log unified report
    await supabase.from('agent_logs').insert({
      agent: 'client',
      action: 'unified_report',
      status: 'ok',
      data: report,
      created_at: new Date().toISOString(),
      ...(orgId ? { org_id: orgId } : {}),
    });

    // Save learning about client lifecycle
    try {
      const totalClients = (retRes.green || 0) + (retRes.yellow || 0) + (retRes.orange || 0) + (retRes.red || 0);
      if (totalClients > 0) {
        await saveLearning(supabase, {
          agent: 'client',
          category: 'retention',
          learning: `Cycle client unifie: ${onbRes.processed || 0} onboarding, ${retRes.messagesSent || 0} retention. Sante globale: ${totalClients} clients suivis.`,
          evidence: `Onboarding: ${JSON.stringify(onbRes).substring(0, 200)}, Retention: ${JSON.stringify(retRes).substring(0, 200)}`,
          confidence: 25,
        }, orgId);
      }

      await saveAgentFeedback(supabase, {
        from_agent: 'client',
        to_agent: 'ceo',
        feedback: `Rapport client unifie: ${onbRes.processed || 0} onboarding traites, ${retRes.messagesSent || 0} messages retention. ${(retRes.red || 0) > 0 ? `${retRes.red} clients en danger.` : 'Situation stable.'}`,
        category: 'retention',
      }, orgId);
    } catch (learnErr: any) {
      console.warn('[ClientAgent] Learning error:', learnErr.message);
    }

    return NextResponse.json({ ok: true, ...report });
  }

  return NextResponse.json({ ok: false, error: `Action inconnue: ${action}` }, { status: 400 });
}
