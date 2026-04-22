import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runEnrichmentCampaign } from '@/lib/agents/enrichment';

export const runtime = 'nodejs';
export const maxDuration = 900; // up to 15 min — enrichment is expensive

/**
 * POST /api/admin/enrich-agents?agents=content,email&max=5
 *
 * Runs the cross-agent knowledge enrichment campaign, prioritised by plan
 * tier (Créateur agents → Pro → Business → disabled agents).
 *
 * Query params:
 *   agents  - comma-separated subset to run (default: priority order)
 *   max     - limit to the first N agents in the list (useful for
 *             incremental rollout without timeouts)
 *
 * Auth: CRON_SECRET bearer.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const agentsParam = req.nextUrl.searchParams.get('agents');
  const maxParam = req.nextUrl.searchParams.get('max');
  const filter = {
    agents: agentsParam ? agentsParam.split(',').map(a => a.trim()).filter(Boolean) : undefined,
    maxAgents: maxParam ? parseInt(maxParam, 10) : undefined,
  };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const started = Date.now();
  const results = await runEnrichmentCampaign(supabase, filter);
  const durationMs = Date.now() - started;

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  return NextResponse.json({
    ok: true,
    duration_ms: durationMs,
    total_inserted: totalInserted,
    results,
  });
}
