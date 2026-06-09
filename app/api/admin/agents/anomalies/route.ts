/**
 * GET active anomaly alerts (for the control center 🚨 Live alerts panel).
 * POST {action:'resolve',id}  → mark one as resolved manually.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const url = new URL(req.url);
  const agentFilter = url.searchParams.get('agent');
  const includeResolved = url.searchParams.get('include_resolved') === 'true';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);

  let q = supabase
    .from('anomaly_alerts')
    .select('*')
    .order('severity', { ascending: true })
    .order('count_in_window', { ascending: false })
    .order('last_seen', { ascending: false })
    .limit(limit);

  if (!includeResolved) q = q.is('resolved_at', null);
  if (agentFilter) q = q.eq('agent', agentFilter);

  const { data } = await q;

  // Resolve client email for rows with user_id
  const ids = [...new Set((data || []).map((d: any) => d.user_id).filter(Boolean))] as string[];
  const emailById = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, email').in('id', ids);
    for (const p of (profs || []) as any[]) emailById.set(p.id, p.email);
  }

  const alerts = (data || []).map((a: any) => ({
    ...a,
    client_email: a.user_id ? emailById.get(a.user_id) || null : null,
  }));

  return NextResponse.json({
    ok: true,
    summary: {
      total: alerts.length,
      p0: alerts.filter((a: any) => a.severity === 'P0').length,
      p1: alerts.filter((a: any) => a.severity === 'P1').length,
      p2: alerts.filter((a: any) => a.severity === 'P2').length,
    },
    alerts,
    anomalies: alerts, // alias for cockpit
  });
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body.action === 'resolve' && body.id) {
    await supabase.from('anomaly_alerts').update({ resolved_at: new Date().toISOString() } as any).eq('id', body.id);
    return NextResponse.json({ ok: true, resolved: body.id });
  }
  if (body.action === 'resolve_all') {
    await supabase.from('anomaly_alerts').update({ resolved_at: new Date().toISOString() } as any).is('resolved_at', null);
    return NextResponse.json({ ok: true, resolved: 'all' });
  }
  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
