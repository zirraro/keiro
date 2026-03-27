import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { QA_MODULES, QA_GROUPS, type QACheck } from '@/lib/agents/qa-modules';

export const runtime = 'nodejs';
export const maxDuration = 120;

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

export async function GET(request: NextRequest) {
  const globalStart = Date.now();

  // ── Auth ──
  const auth = await verifyAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Determine which modules to run ──
  const searchParams = request.nextUrl.searchParams;
  const modulesParam = searchParams.get('modules');
  const groupParam = searchParams.get('group');

  let moduleNames: string[];

  if (modulesParam) {
    // Explicit module list: ?modules=instagram_token,publications
    moduleNames = modulesParam.split(',').map(m => m.trim()).filter(Boolean);
    const invalid = moduleNames.filter(m => !QA_MODULES[m]);
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown modules: ${invalid.join(', ')}`, available: Object.keys(QA_MODULES) },
        { status: 400 }
      );
    }
  } else if (groupParam) {
    // Group: ?group=quick
    const group = QA_GROUPS[groupParam];
    if (!group) {
      return NextResponse.json(
        { error: `Unknown group: ${groupParam}`, available: Object.keys(QA_GROUPS) },
        { status: 400 }
      );
    }
    moduleNames = group;
  } else {
    // Default: run all modules
    moduleNames = Object.keys(QA_MODULES);
  }

  // ── Run modules in parallel, isolating errors ──
  const supabase = getSupabaseAdmin();
  const results: QACheck[] = [];
  const moduleErrors: Record<string, string> = {};

  const modulePromises = moduleNames.map(async (name) => {
    const moduleFn = QA_MODULES[name];
    try {
      const checks = await moduleFn(supabase);
      return { name, checks, error: null };
    } catch (err: any) {
      return {
        name,
        checks: [{
          name: `Module ${name}`,
          module: name,
          agent: 'qa',
          status: 'critical' as const,
          message: `Module crashed: ${err.message || String(err)}`,
          duration_ms: 0,
        }] satisfies QACheck[],
        error: err.message || String(err),
      };
    }
  });

  const settled = await Promise.all(modulePromises);

  for (const result of settled) {
    results.push(...result.checks);
    if (result.error) {
      moduleErrors[result.name] = result.error;
    }
  }

  // ── Summary ──
  const summary = {
    total: results.length,
    pass: results.filter(c => c.status === 'pass').length,
    warn: results.filter(c => c.status === 'warn').length,
    fail: results.filter(c => c.status === 'fail').length,
    critical: results.filter(c => c.status === 'critical').length,
    modules_run: moduleNames.length,
    modules_errored: Object.keys(moduleErrors).length,
    duration_ms: Date.now() - globalStart,
  };

  const overallStatus = summary.critical > 0
    ? 'critical'
    : summary.fail > 0
      ? 'fail'
      : summary.warn > 0
        ? 'warn'
        : 'pass';

  // ── Log QA run to agent_logs ──
  try {
    await supabase.from('agent_logs').insert({
      agent: 'qa',
      action: 'qa_run',
      status: overallStatus === 'pass' ? 'success' : 'error',
      data: {
        summary,
        modules_run: moduleNames,
        module_errors: Object.keys(moduleErrors).length > 0 ? moduleErrors : undefined,
        checks: results,
      },
      created_at: new Date().toISOString(),
    });
  } catch {
    // Don't fail the response if logging fails
  }

  // ── Response ──
  return NextResponse.json({
    status: overallStatus,
    summary,
    checks: results,
    ...(Object.keys(moduleErrors).length > 0 ? { module_errors: moduleErrors } : {}),
    ran_at: new Date().toISOString(),
  });
}
