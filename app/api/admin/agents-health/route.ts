import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { isAdmin } from '@/lib/credits/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/admin/agents-health
 *
 * Per-agent RAG summary: count, with_embedding, latest entry timestamp.
 * Used by /admin/agents-health to render the unified ecosystem view.
 *
 * Admin-only (profiles.is_admin=true) OR CRON_SECRET bearer.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const cronOk = !!cronSecret && auth === `Bearer ${cronSecret}`;

  if (!cronOk) {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // JS aggregation — works without a dedicated RPC. We only pull
  // metadata columns (no full content + embedding blobs) so 50k rows
  // fits in memory cheaply.
  const { data: rows } = await supabase
    .from('agent_knowledge')
    .select('agent, embedding, created_at')
    .order('created_at', { ascending: false })
    .limit(50000);

  const agg: Record<string, { count: number; with_embedding: number; latest: string | null }> = {};
  for (const r of rows ?? []) {
    const a = r.agent || 'unknown';
    if (!agg[a]) agg[a] = { count: 0, with_embedding: 0, latest: null };
    agg[a].count++;
    if (r.embedding) agg[a].with_embedding++;
    if (!agg[a].latest || (r.created_at && r.created_at > agg[a].latest)) {
      agg[a].latest = r.created_at;
    }
  }

  const agents = Object.entries(agg)
    .map(([agent, v]) => ({ agent, ...v }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ ok: true, agents });
}
