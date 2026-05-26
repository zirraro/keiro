import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * GET /api/admin/service-health
 *
 * Returns the rollup of Noah catch-up diagnostics from the last 7 days.
 * Powers /admin/service-health where Victor monitors which agents
 * underperform and why. Founder ask 2026-05-26: "admin doit pouvoir
 * monitorer tout ca proprement et visuellement".
 */
export async function GET(_req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: diagnostics } = await supabase
    .from('agent_logs')
    .select('id, user_id, data, created_at')
    .eq('agent', 'ceo')
    .eq('action', 'noah_diagnostic')
    .gte('created_at', since7d)
    .order('created_at', { ascending: false })
    .limit(500);

  // Aggregate by cause across all clients to spot systemic issues
  const byCause: Record<string, {
    cause: string;
    severity: string;
    incidents: number;
    clients: Set<string>;
    agents: Set<string>;
    fixes: Set<string>;
    last_seen: string;
    sample_error: string;
  }> = {};

  let totalIncidents = 0;
  let p0Count = 0, p1Count = 0, p2Count = 0;

  for (const row of diagnostics || []) {
    const gaps = (row.data?.gaps || []) as Array<any>;
    for (const g of gaps) {
      totalIncidents++;
      const key = g.cause || 'unknown';
      if (!byCause[key]) {
        byCause[key] = {
          cause: key,
          severity: g.severity || 'P2',
          incidents: 0,
          clients: new Set(),
          agents: new Set(),
          fixes: new Set(),
          last_seen: row.created_at,
          sample_error: g.raw_error || '',
        };
      }
      const bucket = byCause[key];
      bucket.incidents++;
      if (row.user_id) bucket.clients.add(row.user_id);
      if (g.agent) bucket.agents.add(g.agent);
      for (const f of (g.fixes || [])) bucket.fixes.add(f);
      if (row.created_at > bucket.last_seen) bucket.last_seen = row.created_at;
      if (g.severity === 'P0') p0Count++;
      else if (g.severity === 'P1') p1Count++;
      else p2Count++;
    }
  }

  const causes = Object.values(byCause)
    .map(b => ({
      cause: b.cause,
      severity: b.severity,
      incidents: b.incidents,
      affected_clients: b.clients.size,
      agents: Array.from(b.agents),
      fixes: Array.from(b.fixes),
      last_seen: b.last_seen,
      sample_error: b.sample_error.slice(0, 200),
    }))
    .sort((a, b) => {
      // Sort by severity then by incidents desc
      const sev = { P0: 0, P1: 1, P2: 2 } as const;
      if (sev[a.severity as keyof typeof sev] !== sev[b.severity as keyof typeof sev]) {
        return sev[a.severity as keyof typeof sev] - sev[b.severity as keyof typeof sev];
      }
      return b.incidents - a.incidents;
    });

  // Recent incidents (last 50, raw)
  const recent = (diagnostics || []).slice(0, 50).map(d => ({
    at: d.created_at,
    client: d.data?.client_email || d.user_id,
    plan: d.data?.plan,
    severity: d.data?.severity,
    gaps: d.data?.gaps?.length || 0,
    causes: (d.data?.gaps || []).map((g: any) => g.cause),
  }));

  return NextResponse.json({
    ok: true,
    window: '7d',
    summary: {
      total_incidents: totalIncidents,
      total_diagnostics: diagnostics?.length || 0,
      p0: p0Count,
      p1: p1Count,
      p2: p2Count,
      unique_causes: causes.length,
    },
    causes,
    recent,
  });
}
