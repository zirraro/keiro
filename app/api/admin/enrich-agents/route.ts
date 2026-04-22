import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runEnrichmentCampaign } from '@/lib/agents/enrichment';

export const runtime = 'nodejs';
export const maxDuration = 900; // up to 15 min — enrichment is expensive

/**
 * POST /api/admin/enrich-agents?agents=content,email&max=5&sync=1
 *
 * Triggers the cross-agent knowledge enrichment campaign, prioritised by
 * plan tier (Créateur agents → Pro → Business → disabled agents).
 *
 * Default is fire-and-forget: returns 202 immediately with a job_id,
 * the campaign runs in the Node process in background (up to maxDuration).
 * Progress visible via agent_knowledge WHERE source='enrichment_campaign'.
 *
 * Pass sync=1 to block and return the full per-agent results (nginx will
 * 504 on long runs — only use for small batches).
 *
 * Query params:
 *   agents  - comma-separated subset to run (default: priority order)
 *   max     - limit to the first N agents in the list
 *   sync    - 1 to block and return full results; default fire-and-forget
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
  const depthParam = (req.nextUrl.searchParams.get('depth') || 'medium').toLowerCase();
  const depth: 'shallow' | 'medium' | 'deep' = depthParam === 'deep' || depthParam === 'shallow' ? depthParam : 'medium';
  const sync = req.nextUrl.searchParams.get('sync') === '1';
  const filter = {
    agents: agentsParam ? agentsParam.split(',').map(a => a.trim()).filter(Boolean) : undefined,
    maxAgents: maxParam ? parseInt(maxParam, 10) : undefined,
    depth,
  };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const jobId = `enrich_${Date.now().toString(36)}`;

  if (sync) {
    // Block + return full results. Risk: nginx 504 if > 60s.
    const started = Date.now();
    const results = await runEnrichmentCampaign(supabase, filter);
    const durationMs = Date.now() - started;
    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    return NextResponse.json({ ok: true, job_id: jobId, duration_ms: durationMs, total_inserted: totalInserted, results });
  }

  // Fire-and-forget: start the campaign in background and return 202.
  const started = Date.now();
  await supabase.from('agent_logs').insert({
    agent: 'admin',
    action: 'enrichment_campaign_started',
    data: { job_id: jobId, filter, started_at: new Date(started).toISOString() },
    created_at: new Date(started).toISOString(),
  });

  // Don't await — the handler returns immediately and Node keeps running
  // the campaign until maxDuration (15 min) per slot.
  runEnrichmentCampaign(supabase, filter)
    .then(async (results) => {
      const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
      await supabase.from('agent_logs').insert({
        agent: 'admin',
        action: 'enrichment_campaign_completed',
        data: { job_id: jobId, duration_ms: Date.now() - started, total_inserted: totalInserted, results },
        created_at: new Date().toISOString(),
      });
    })
    .catch(async (err) => {
      await supabase.from('agent_logs').insert({
        agent: 'admin',
        action: 'enrichment_campaign_failed',
        data: { job_id: jobId, error: err?.message || String(err) },
        created_at: new Date().toISOString(),
      });
    });

  return NextResponse.json({
    ok: true,
    status: 'started',
    job_id: jobId,
    message: 'Campagne lancée en background. Suivi via agent_knowledge source=enrichment_campaign ou agent_logs.',
    filter,
  }, { status: 202 });
}

/**
 * GET /api/admin/enrich-agents — returns current counts per agent from
 * the enrichment campaign, so you can watch progress without polling the DB.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data } = await supabase
    .from('agent_knowledge')
    .select('agent')
    .eq('source', 'enrichment_campaign');
  const counts: Record<string, number> = {};
  for (const r of data ?? []) {
    counts[r.agent] = (counts[r.agent] || 0) + 1;
  }
  return NextResponse.json({
    ok: true,
    total: Object.values(counts).reduce((s, n) => s + n, 0),
    per_agent: counts,
  });
}
