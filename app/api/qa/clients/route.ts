import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/qa/clients
 * Run QA checks for each client: IG token, dossier completeness, agents activity, CRM health.
 * Admin only.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();

  // Also accept CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isCron = cronSecret && auth === `Bearer ${cronSecret}`;

  if (!profile?.is_admin && !isCron) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Get all clients (non-admin, non-free)
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, first_name, subscription_plan, instagram_business_account_id, facebook_page_access_token, created_at')
    .not('is_admin', 'eq', true)
    .order('created_at', { ascending: false })
    .limit(50);

  const results: Array<{
    client_id: string;
    email: string;
    name: string;
    plan: string;
    checks: Array<{ name: string; status: string; message: string }>;
    score: number;
  }> = [];

  for (const client of clients || []) {
    const checks: Array<{ name: string; status: string; message: string }> = [];

    // 1. Instagram connected?
    const hasIG = !!client.instagram_business_account_id && !!client.facebook_page_access_token;
    checks.push({
      name: 'Instagram',
      status: hasIG ? 'pass' : 'warn',
      message: hasIG ? 'Connecte' : 'Non connecte',
    });

    // 2. Dossier business completeness
    const { data: dossier } = await supabase
      .from('business_dossiers')
      .select('completeness_score')
      .eq('user_id', client.id)
      .single();

    const dossierScore = dossier?.completeness_score || 0;
    checks.push({
      name: 'Dossier business',
      status: dossierScore >= 60 ? 'pass' : dossierScore >= 30 ? 'warn' : 'fail',
      message: `${dossierScore}% complet`,
    });

    // 3. Agent activity (any logs in 24h?)
    const { count: agentRuns } = await supabase
      .from('agent_logs')
      .select('id', { count: 'exact', head: true })
      .or(`user_id.eq.${client.id},org_id.eq.${client.id}`)
      .gte('created_at', since24h);

    checks.push({
      name: 'Activite agents',
      status: (agentRuns || 0) > 0 ? 'pass' : 'warn',
      message: `${agentRuns || 0} actions en 24h`,
    });

    // 4. CRM prospects count
    const { count: prospects } = await supabase
      .from('crm_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', client.id);

    checks.push({
      name: 'CRM',
      status: (prospects || 0) > 0 ? 'pass' : 'warn',
      message: `${prospects || 0} prospects`,
    });

    // 5. Content generated?
    const { count: generations } = await supabase
      .from('saved_images')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', client.id);

    checks.push({
      name: 'Contenus',
      status: (generations || 0) > 0 ? 'pass' : 'warn',
      message: `${generations || 0} visuels`,
    });

    // Score
    const passCount = checks.filter(c => c.status === 'pass').length;
    const score = Math.round((passCount / checks.length) * 100);

    results.push({
      client_id: client.id,
      email: client.email || '?',
      name: client.first_name || client.email?.split('@')[0] || '?',
      plan: client.subscription_plan || 'gratuit',
      checks,
      score,
    });
  }

  return NextResponse.json({
    ok: true,
    clients: results.sort((a, b) => a.score - b.score), // Worst first
    total: results.length,
    healthy: results.filter(c => c.score >= 80).length,
    at_risk: results.filter(c => c.score < 60).length,
  });
}
